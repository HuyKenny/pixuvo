/**
 * Game page behaviour.
 * - The partner game loads on its own when the page opens (partner games have their
 *   own Play button, so a second one here would mean clicking twice), but only after
 *   /api/play confirms the source is still active and permitted (so a revoked game
 *   cannot start even from stale cached HTML). Crawlers get the poster only.
 *   Our Play button appears only when the automatic start fails or after bfcache.
 * - The chosen source is pinned for the browser session (no mid-session switching).
 * - Cross-origin iframe = opaque: we do not claim "loaded" or track playtime.
 * - Leaving the page removes the iframe so sound stops.
 */
import { store } from './store';
import { track } from './analytics';

interface GameData {
  id: number;
  slug: string;
  title: string;
  thumb: string;
  portrait: boolean;
  fit?: 'portrait' | 'landscape' | 'any';
  cat?: string;
}
interface PlayResponse {
  embedUrl: string;
  sourceId: number;
  provider: string;
  allow: string;
  sandbox: string | null;
}

const stage = document.getElementById('stage');
const data: GameData | null = stage?.dataset.game ? (JSON.parse(stage.dataset.game) as GameData) : null;
const TURNSTILE_KEY = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY as string | undefined;

if (stage && data) {
  const poster = stage.querySelector<HTMLElement>('[data-poster]')!;
  const playBtn = stage.querySelector<HTMLButtonElement>('[data-play]')!;
  const msg = stage.querySelector<HTMLElement>('[data-stage-msg]')!;
  let iframe: HTMLIFrameElement | null = null;
  const pinKey = `pixuvo:src:${data.id}`;

  const setMsg = (html: string) => {
    msg.innerHTML = html;
  };

  const showPlay = () => {
    playBtn.hidden = false;
    playBtn.disabled = false;
  };

  async function play() {
    playBtn.disabled = true;
    setMsg('Loading game…');
    let pinned: string | null = null;
    try {
      pinned = sessionStorage.getItem(pinKey);
    } catch {
      pinned = null;
    }
    let res: Response;
    try {
      res = await fetch('/api/play/', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ id: data!.id, source: pinned ? Number(pinned) : null }),
      });
    } catch {
      showPlay();
      setMsg('Could not reach Pixuvo. Check your connection and try again.');
      return;
    }
    const body = (await res.json().catch(() => ({}))) as Partial<PlayResponse> & { error?: string };
    if (!res.ok || !body.embedUrl) {
      if (res.status >= 500 || res.status === 429) showPlay(); // worth another try
      setMsg(`${escapeText(body.error ?? 'This game is not available right now.')} <a href="/">Find another game</a>.`);
      return;
    }
    try {
      sessionStorage.setItem(pinKey, String(body.sourceId));
    } catch {
      /* ignore */
    }
    mount(body as PlayResponse);
    store.addRecent({ id: data!.id, slug: data!.slug, title: data!.title, thumb: data!.thumb, ...(data!.cat ? { cat: data!.cat } : {}) });
    track('game_start', { game_slug: data!.slug, provider: (body as PlayResponse).provider, ...(data!.cat ? { game_category: data!.cat } : {}) });
  }

  function mount(p: PlayResponse) {
    unmount();
    const f = document.createElement('iframe');
    f.src = p.embedUrl;
    f.title = `${data!.title} (game)`;
    f.allow = p.allow;
    if (p.sandbox) f.setAttribute('sandbox', p.sandbox);
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.setAttribute('allowfullscreen', '');
    f.loading = 'eager';
    iframe = f;
    poster.hidden = true;
    stage!.appendChild(f);
    f.focus({ preventScroll: true });
    // We cannot see inside a cross-origin game; offer help instead of a fake progress bar.
    const help = document.querySelector<HTMLElement>('[data-share-status]');
    if (help) help.innerHTML = '<span class="help-row"><span>Game not starting?</span><button type="button" class="mini-btn" data-retry>↻ Reload</button><button type="button" class="mini-btn" data-report-open>⚑ Report</button></span>';
    fitToScreen();
  }

  // Phones: bring the whole game into view once (only if the visitor has not scrolled yet).
  const phone = matchMedia('(max-width: 699.98px), (orientation: landscape) and (max-height: 500px)');
  let userScrolled = false;
  for (const ev of ['touchmove', 'wheel', 'keydown'] as const) addEventListener(ev, () => (userScrolled = true), { once: true, passive: true });
  function fitToScreen() {
    if (!phone.matches || userScrolled) return;
    const header = matchMedia('(orientation: landscape) and (max-height: 500px)').matches ? 0 : (document.querySelector('.site-header')?.getBoundingClientRect().height ?? 0);
    const top = stage!.getBoundingClientRect().top + scrollY - header;
    scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }
  matchMedia('(orientation: landscape)').addEventListener('change', () => {
    userScrolled = false;
    setTimeout(fitToScreen, 300);
  });

  function unmount() {
    if (iframe) {
      iframe.src = 'about:blank';
      iframe.remove();
      iframe = null;
    }
  }

  playBtn.addEventListener('click', play);
  const BOT = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|headlesschrome\/.*google/i;
  if (BOT.test(navigator.userAgent)) showPlay();
  else {
    playBtn.hidden = true;
    void play();
  }
  document.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (t.closest('[data-retry]')) {
      unmount();
      poster.hidden = false;
      play();
    }
  });
  // Stop the game (and its audio) when the page is left or frozen into bfcache.
  window.addEventListener('pagehide', unmount);
  window.addEventListener('pageshow', (e) => {
    if ((e as PageTransitionEvent).persisted && !iframe) {
      poster.hidden = false;
      playBtn.hidden = true;
      void play();
    }
  });

  // Fullscreen, with an "expanded" fallback where the API is missing (iPhone Safari).
  // Landscape games also try to lock landscape (Android Chrome allows it only in fullscreen).
  const scr = screen as Screen & { orientation?: ScreenOrientation & { lock?: (o: string) => Promise<void> } };
  const setExpanded = (on: boolean) => {
    document.body.classList.toggle('expanded-mode', on);
    document.documentElement.classList.toggle('no-scroll', on);
  };
  const exitExpanded = () => setExpanded(false);
  document.querySelector('[data-fullscreen]')?.addEventListener('click', async () => {
    const el = stage as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      else throw new Error('no fullscreen');
      if (!data.portrait) await scr.orientation?.lock?.('landscape').catch(() => {});
    } catch {
      setExpanded(true);
    }
  });
  document.addEventListener('fullscreenchange', () => {
    document.body.classList.toggle('is-fullscreen', !!document.fullscreenElement);
    if (!document.fullscreenElement) scr.orientation?.unlock?.();
  });
  document.querySelector('[data-exit-expanded]')?.addEventListener('click', exitExpanded);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') exitExpanded();
  });

  // "Turn your phone" hint: landscape game, touch phone held upright. Dismissal is remembered.
  const hint = document.querySelector<HTMLElement>('[data-rotate-hint]');
  if (hint && (data.fit ?? (data.portrait ? 'portrait' : 'landscape')) === 'landscape') {
    const portraitPhone = matchMedia('(orientation: portrait) and (max-width: 699px) and (pointer: coarse)');
    let dismissed = false;
    try {
      dismissed = localStorage.getItem('pixuvo:rotate-hint') === 'off';
    } catch {
      /* ignore */
    }
    const sync = () => (hint.hidden = dismissed || !portraitPhone.matches);
    portraitPhone.addEventListener('change', sync);
    hint.querySelector('[data-rotate-close]')?.addEventListener('click', () => {
      dismissed = true;
      try {
        localStorage.setItem('pixuvo:rotate-hint', 'off');
      } catch {
        /* ignore */
      }
      sync();
    });
    sync();
  }

  // Share
  document.querySelector('[data-share]')?.addEventListener('click', async () => {
    const url = `https://pixuvo.com/games/${data.slug}/`;
    const status = document.querySelector<HTMLElement>('[data-share-status]');
    try {
      if (navigator.share) await navigator.share({ title: data.title, url });
      else {
        await navigator.clipboard.writeText(url);
        if (status) status.textContent = 'Link copied to clipboard.';
      }
    } catch {
      if (status) status.textContent = url;
    }
  });

  setupRating(data);
  setupReport(data);
}

// Messages from the game are only accepted from the iframe we created, from its
// own origin, and with a known shape. No partner SDK events are documented for
// our integrations yet, so nothing is acted upon.
window.addEventListener('message', (e) => {
  const f = document.querySelector<HTMLIFrameElement>('#stage iframe');
  if (!f || e.source !== f.contentWindow) return;
  try {
    if (new URL(f.src).origin !== e.origin) return;
  } catch {
    return;
  }
});

function escapeText(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// ── Turnstile (loaded on demand, only when someone votes or reports) ─────────
let tsLoading: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  if (!TURNSTILE_KEY) return Promise.resolve();
  tsLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('turnstile'));
    document.head.appendChild(s);
  });
  return tsLoading;
}
async function turnstileToken(slot: HTMLElement | null): Promise<string | null> {
  if (!TURNSTILE_KEY) return null;
  await loadTurnstile();
  const ts = (window as unknown as { turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string; remove: (id: string) => void } }).turnstile;
  if (!ts || !slot) return null;
  return new Promise((resolve) => {
    // Never hang: a challenge that cannot complete (blocked script, bot) ends as a visible error.
    const timer = window.setTimeout(() => resolve(null), 25_000);
    const done = (t: string | null) => {
      window.clearTimeout(timer);
      resolve(t);
    };
    slot.innerHTML = '';
    const id = ts.render(slot, {
      sitekey: TURNSTILE_KEY,
      appearance: 'interaction-only',
      callback: (t: string) => {
        done(t);
        setTimeout(() => ts.remove(id), 0);
      },
      'error-callback': () => done(null),
      'expired-callback': () => done(null),
    });
  });
}

function setupRating(g: GameData) {
  const box = document.querySelector<HTMLElement>('[data-rating]');
  if (!box) return;
  const status = document.querySelector<HTMLElement>('[data-rate-status]');
  const key = `pixuvo:vote:${g.id}`;
  let mine = 0;
  try {
    mine = Number(localStorage.getItem(key) ?? '0');
  } catch {
    mine = 0;
  }
  const paint = () => box.querySelectorAll<HTMLButtonElement>('[data-vote]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.vote) === mine)));
  paint();
  box.addEventListener('click', async (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-vote]');
    if (!b) return;
    const value = Number(b.dataset.vote);
    if (value === mine) return;
    if (status) {
      status.className = 'form-status';
      status.textContent = 'Saving…';
    }
    const token = await turnstileToken(box.parentElement?.querySelector('[data-turnstile-slot]') ?? null);
    const res = await fetch('/api/rate/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: g.id, value, token }) }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { up?: number; down?: number; error?: string };
    if (!res || !res.ok) {
      if (status) {
        status.className = 'form-status err';
        status.textContent = body?.error ?? 'Could not save your vote.';
      }
      return;
    }
    mine = value;
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* ignore */
    }
    paint();
    const votes = (body.up ?? 0) + (body.down ?? 0);
    const score = box.parentElement?.querySelector('[data-score]');
    if (score && votes > 0) score.textContent = `${Math.round(((body.up ?? 0) / votes) * 100)}% liked · ${votes} vote${votes === 1 ? '' : 's'} on Pixuvo`;
    if (status) {
      status.className = 'form-status ok';
      status.textContent = 'Thanks for your vote!';
    }
  });
}

function setupReport(g: GameData) {
  const dlg = document.getElementById('report-dialog') as HTMLDialogElement | null;
  const form = dlg?.querySelector<HTMLFormElement>('[data-report-form]');
  if (!dlg || !form) return;
  const status = form.querySelector<HTMLElement>('[data-report-status]')!;
  document.addEventListener('click', (e) => {
    if ((e.target as Element).closest('[data-report-open]')) {
      status.textContent = '';
      dlg.showModal();
    }
  });
  form.querySelector('[data-report-cancel]')?.addEventListener('click', () => dlg.close());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    status.className = 'form-status';
    status.textContent = 'Sending…';
    const token = await turnstileToken(form.querySelector('[data-turnstile-slot]'));
    const res = await fetch('/api/report/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: g.id, reason: fd.get('reason'), message: String(fd.get('message') ?? '').slice(0, 1000), path: location.pathname, token }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { error?: string };
    if (!res || !res.ok) {
      status.className = 'form-status err';
      status.textContent = body?.error ?? 'Could not send the report. Please e-mail info@pixuvo.com.';
      return;
    }
    status.className = 'form-status ok';
    status.textContent = 'Thank you — your report was received.';
    form.reset();
    setTimeout(() => dlg.close(), 1500);
  });
}
