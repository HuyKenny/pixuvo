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
  maxCategoryPages: 100,
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
