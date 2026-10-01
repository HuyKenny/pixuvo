/** Accessible drawers: focus moves in, Esc closes, focus returns to the opener, background is inert. */
let lastOpener: HTMLElement | null = null;

export function openDrawer(id: string, opener?: HTMLElement | null) {
  const d = document.getElementById(id);
  if (!d) return;
  lastOpener = opener ?? (document.activeElement as HTMLElement | null);
  if (d.parentElement !== document.body) document.body.appendChild(d);
  d.dataset.open = 'true';
  d.setAttribute('aria-hidden', 'false');
  opener?.setAttribute('aria-expanded', 'true');
  for (const el of Array.from(document.body.children)) if (el !== d && el instanceof HTMLElement && el.tagName !== 'SCRIPT') el.setAttribute('inert', '');
  document.body.style.overflow = 'hidden';
  (d.querySelector<HTMLElement>('[data-autofocus]') ?? d.querySelector<HTMLElement>('button, a, input'))?.focus();
}

export function closeDrawer(d: HTMLElement) {
  d.dataset.open = 'false';
  d.setAttribute('aria-hidden', 'true');
  for (const el of Array.from(document.body.children)) if (el instanceof HTMLElement) el.removeAttribute('inert');
  document.body.style.overflow = '';
  document.querySelectorAll(`[aria-controls="${d.id}"]`).forEach((b) => b.setAttribute('aria-expanded', 'false'));
  lastOpener?.focus();
}

document.addEventListener('click', (e) => {
  const t = e.target as Element | null;
  const opener = t?.closest<HTMLElement>('[data-drawer-open]');
  if (opener) {
    openDrawer(opener.dataset.drawerOpen!, opener);
    return;
  }
  const closer = t?.closest<HTMLElement>('[data-drawer-close]');
  if (closer) {
    const d = closer.closest<HTMLElement>('[data-drawer]');
    if (d) closeDrawer(d);
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const d = document.querySelector<HTMLElement>('[data-drawer][data-open="true"]');
  if (d) closeDrawer(d);
});
