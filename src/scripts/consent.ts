/**
 * Consent state (browser-only). Optional features MUST go through whenConsented();
 * nothing optional runs before an explicit choice, a rejection is respected, and
 * the choice can be changed at any time via "Privacy choices".
 */
export type ConsentCategory = 'analytics' | 'ads';
export interface ConsentState {
  v: 1;
  analytics: boolean;
  ads: boolean;
  at: number;
}
const KEY = 'pixuvo:consent';
const VERSION = 1;
let memory: ConsentState | null = null;

export function getConsent(): ConsentState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return memory;
    const s = JSON.parse(raw) as ConsentState;
    return s && s.v === VERSION ? { v: 1, analytics: s.analytics === true, ads: s.ads === true, at: Number(s.at) || 0 } : null;
  } catch {
    return memory;
  }
}

function setConsent(s: Omit<ConsentState, 'v' | 'at'>) {
  const state: ConsentState = { v: 1, analytics: s.analytics, ads: s.ads, at: Date.now() };
  memory = state;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* memory only */
  }
  window.dispatchEvent(new CustomEvent('pixuvo:consent', { detail: state }));
}

const waiting: Array<{ cat: ConsentCategory; fn: () => void; done: boolean }> = [];
export function whenConsented(cat: ConsentCategory, fn: () => void) {
  const entry = { cat, fn, done: false };
  waiting.push(entry);
  flush();
}
function flush() {
  const s = getConsent();
  if (!s) return;
  for (const w of waiting) if (!w.done && s[w.cat]) {
    w.done = true;
    w.fn();
  }
}
window.addEventListener('pixuvo:consent', flush);

const box = document.querySelector<HTMLElement>('[data-consent]');
if (box) {
  const active = (box.dataset.active ?? '').split(',').filter(Boolean) as ConsentCategory[];
  const boxes = (name: ConsentCategory) => box.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  const show = () => {
    const s = getConsent();
    for (const c of ['analytics', 'ads'] as const) {
      const b = boxes(c);
      if (b) b.checked = !!s?.[c];
    }
    box.hidden = false;
    // Opened from "Privacy choices": show the detailed settings right away.
    const details = box.querySelector<HTMLDetailsElement>('[data-consent-details]');
    if (details) details.open = true;
    box.querySelector<HTMLElement>('button')?.focus();
  };
  if (active.length && !getConsent()) box.hidden = false;
  box.addEventListener('click', (e) => {
    if ((e.target as Element).closest('[data-consent-settings]')) {
      const d = box.querySelector<HTMLDetailsElement>('[data-consent-details]');
      if (d) d.open = !d.open;
      return;
    }
    const action = (e.target as Element).closest<HTMLElement>('[data-consent-action]')?.dataset.consentAction;
    if (!action) return;
    const allow = (c: ConsentCategory) => active.includes(c);
    if (action === 'accept') setConsent({ analytics: allow('analytics'), ads: allow('ads') });
    if (action === 'reject') setConsent({ analytics: false, ads: false });
    if (action === 'save') setConsent({ analytics: allow('analytics') && !!boxes('analytics')?.checked, ads: allow('ads') && !!boxes('ads')?.checked });
    box.hidden = true;
  });
  document.addEventListener('click', (e) => {
    if ((e.target as Element).closest('[data-consent-open]')) show();
  });
}

(window as unknown as { pixuvoConsent: unknown }).pixuvoConsent = { getConsent, whenConsented };
