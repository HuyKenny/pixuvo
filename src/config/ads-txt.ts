/**
 * ads.txt — ONLY lines copied verbatim from partner dashboards. Never invent lines.
 * GameMonetize: Publisher → Websites and Ads.txt Management (received 2026-10-02).
 * GamePix: my.gamepix.com → Properties → Verify ads.txt (verbatim file, src/config/ads-gamepix.ts).
 * HTMLGames: https://cdn.htmlgames.com/ads.partners.txt (verbatim file, src/config/ads-htmlgames.ts).
 */
import { GAMEPIX_ADS_TXT } from './ads-gamepix';
import { HTMLGAMES_ADS_TXT } from './ads-htmlgames';

export const ADS_TXT_BLOCKS: Array<{ source: string; lines: string[] }> = [
  {
    source: 'GameMonetize.com',
    lines: ['google.com, pub-5519830896693885, DIRECT, f08c47fec0942fa0', 'google.com, pub-4764333688337558, DIRECT, f08c47fec0942fa0'],
  },
  { source: 'GamePix (property 9O09X)', lines: GAMEPIX_ADS_TXT.split('\n') },
  { source: 'HTMLGames.com (Zygomatic)', lines: HTMLGAMES_ADS_TXT.split('\n') },
];

// domain, publisher id, relationship[, cert id][ # comment]  — comment lines and blank lines pass through.
// The cert id may be empty after its comma ("contextweb.com, 558511, RESELLER," in the HTMLGames file).
const RECORD = /^[a-z0-9.-]+\.[a-z]{2,}\s*,\s*[^,\s]+\s*,\s*(DIRECT|RESELLER)(\s*,\s*[A-Za-z0-9]*)?(\s*#.*)?$/i;
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
