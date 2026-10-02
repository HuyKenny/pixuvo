/** One-off: renders favicon/app icons and the default OG image from the SVG mark (sharp). Outputs are committed in public/. */
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
const svg = readFileSync('public/favicon.svg');
for (const [name, size] of [['icon-192.png', 192], ['logo-512.png', 512], ['apple-touch-icon.png', 180], ['favicon-32.png', 32]] as const) {
  await sharp(svg, { density: 1200 }).resize(size, size).png().toFile(`public/${name}`);
}
// favicon.ico: a 32×32 PNG inside an ICO container.
const png = await sharp(svg, { density: 1200 }).resize(32, 32).png().toBuffer();
const ico = Buffer.alloc(22);
ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico.writeUInt8(32, 6); ico.writeUInt8(32, 7); ico.writeUInt8(0, 8); ico.writeUInt8(0, 9);
ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
const { writeFileSync, unlinkSync } = await import('node:fs');
writeFileSync('public/favicon.ico', Buffer.concat([ico, png]));
unlinkSync('public/favicon-32.png');
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#111841"/><stop offset="1" stop-color="#283372"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#g)"/>
<g transform="translate(120 205) scale(7)"><rect width="32" height="32" rx="9" fill="#6a35f2"/><rect x="9" y="7.5" width="4.5" height="17" rx="1.4" fill="#fff"/><rect x="13.5" y="11" width="4.5" height="10" rx="1.4" fill="#fff"/><rect x="18" y="14" width="4.5" height="4" rx="1.4" fill="#fff"/><rect x="22.5" y="6.5" width="3.5" height="3.5" rx="1.1" fill="#2dd4bf"/></g>
<text x="400" y="300" font-family="DejaVu Sans, Arial, sans-serif" font-weight="800" font-size="120" fill="#fff">pixuvo</text>
<text x="404" y="380" font-family="DejaVu Sans, Arial, sans-serif" font-size="40" fill="#c9cdf0">Find your next favorite game.</text>
<text x="404" y="440" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" fill="#5eead4">Free online games. No downloads. Just play.</text>
</svg>`;
await sharp(Buffer.from(og)).png().toFile('public/og-default.png');
console.log('icons written');
// Maskable app icon: full-bleed brand colour, the mark inside the 80 % safe zone.
const mark = await sharp(svg, { density: 1200 }).resize(360, 360).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#6a35f2' } }).composite([{ input: mark, gravity: 'center' }]).png().toFile('public/icon-maskable-512.png');
