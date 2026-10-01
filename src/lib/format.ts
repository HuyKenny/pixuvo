/** Honest number formatting: rounds DOWN so we never claim more than we have. */
export function approxCount(n: number): string {
  if (n >= 10_000) return `${Math.floor(n / 1000).toLocaleString('en-US')},000+`;
  if (n >= 1000) return `${(Math.floor(n / 100) * 100).toLocaleString('en-US')}+`;
  if (n >= 100) return `${Math.floor(n / 10) * 10}+`;
  return String(n);
}

export function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}
