export const SITE = {
  name: 'Pixuvo',
  url: 'https://pixuvo.com',
  tagline: 'Find your next favorite game.',
  subline: 'Free online games. No downloads. Just play.',
  email: 'info@pixuvo.com',
  operator: {
    name: 'Ha Duy Huy',
    address: 'Bartáková 36, 140 00 Praha, Czech Republic',
    companyId: '07876823',
    dataBox: 'dxmsrdt',
    vat: 'Not a VAT payer',
  },
  pageSize: 42, // full rows at 2, 3, 6 and 7 columns
  // Every game must be reachable through its category pages (puzzle ≈ 360 pages); this is only a safety guard.
  maxCategoryPages: 1000,
  /** Google Analytics 4 — loads only after the visitor allows "Analytics" (src/scripts/analytics.ts). */
  ga4: 'G-XESJS34X9Z',
} as const;

/** Absolute canonical URL on the production host regardless of request Host header. */
export function canonical(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return SITE.url + (p.endsWith('/') || p.includes('.') ? p : `${p}/`);
}

export function categoryPath(slug: string, page = 1): string {
  return page > 1 ? `/${slug}-games/page/${page}/` : `/${slug}-games/`;
}

export function gamePath(slug: string): string {
  return `/games/${slug}/`;
}

/** Largest variant of a partner thumbnail for og:image / structured data (social cards want ≥ 1200 px wide). */
export function largeImage(thumb: string): string {
  if (thumb.startsWith('https://static.playgama.com/')) return thumb.replace(/([?&])width=\d+/, '$1width=1200');
  if (thumb.startsWith('https://img.gamepix.com/')) return thumb.replace(/([?&])w=\d+/, '$1w=1200');
  return thumb; // GameMonetize: 512×384 is the largest size it serves
}
