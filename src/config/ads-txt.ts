/**
 * ads.txt — ONLY lines copied verbatim from partner dashboards. Never invent lines.
 * GameMonetize: Publisher → Websites and Ads.txt Management (received 2026-10-02).
 * GamePix: the snippet reached us without line breaks and cannot be split
 * unambiguously; it is added once the original file from the GamePix dashboard
 * is provided (see LAUNCH-CHECKLIST.md). Each block is listed with its source.
 */
export const ADS_TXT_BLOCKS: Array<{ source: string; lines: string[] }> = [
  {
    source: 'GameMonetize.com',
    lines: ['google.com, pub-5519830896693885, DIRECT, f08c47fec0942fa0', 'google.com, pub-4764333688337558, DIRECT, f08c47fec0942fa0'],
  },
];

const RECORD = /^[a-z0-9.-]+\.[a-z]{2,}, [A-Za-z0-9._:-]+, (DIRECT|RESELLER)(, [A-Za-z0-9]+)?$/i;
export function renderAdsTxt(): string {
  const out: string[] = [];
  for (const b of ADS_TXT_BLOCKS) {
    out.push(`# ${b.source}`);
    for (const l of b.lines) {
      if (!RECORD.test(l)) throw new Error(`invalid ads.txt record: ${l}`);
      out.push(l);
    }
  }
  return out.join('\n') + '\n';
}
