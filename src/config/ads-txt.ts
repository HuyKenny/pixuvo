/**
 * ads.txt — ONLY lines copied verbatim from partner dashboards. Never invent lines.
 * GameMonetize: Publisher → Websites and Ads.txt Management (received 2026-10-02).
 * GamePix: my.gamepix.com → Properties → Verify ads.txt (verbatim file, src/config/ads-gamepix.ts).
 */
import { GAMEPIX_ADS_TXT } from './ads-gamepix';

export const ADS_TXT_BLOCKS: Array<{ source: string; lines: string[] }> = [
  {
    source: 'GameMonetize.com',
    lines: ['google.com, pub-5519830896693885, DIRECT, f08c47fec0942fa0', 'google.com, pub-4764333688337558, DIRECT, f08c47fec0942fa0'],
  },
  { source: 'GamePix (property M7X08)', lines: GAMEPIX_ADS_TXT.split('\n') },
];

// domain, publisher id, relationship[, cert id][ # comment]  — comment lines and blank lines pass through.
const RECORD = /^[a-z0-9.-]+\.[a-z]{2,}\s*,\s*[^,\s]+\s*,\s*(DIRECT|RESELLER)(\s*,\s*[A-Za-z0-9]+)?(\s*#.*)?$/i;
export function renderAdsTxt(): string {
  const out: string[] = [];
  for (const b of ADS_TXT_BLOCKS) {
    out.push(`# ${b.source}`);
    for (const l of b.lines) {
      if (l.trim() !== '' && !l.trimStart().startsWith('#') && !RECORD.test(l.trim())) throw new Error(`invalid ads.txt record in ${b.source}: ${l}`);
      out.push(l);
    }
  }
  return out.join('\n') + '\n';
}
