/**
 * One-off: renders favicon/app icons and the default OG image from the gamepad mark used by
 * src/components/Logo.astro (keep the paths in sync). Outputs are committed in public/.
 * Icons: sharp. OG image: Chromium (Playwright) so the Nunito wordmark matches the site header.
 */
import sharp from 'sharp';
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const MARK = `<defs><linearGradient id="lg-pad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9b6bff"/><stop offset="1" stop-color="#5a28e0"/></linearGradient></defs>
<path d="M10 11h20c5.5 0 9 4.6 8.4 10l-1 8.2c-.5 4-4.9 6-8.1 3.6L25 30H15l-4.3 2.8c-3.2 2.4-7.6.4-8.1-3.6l-1-8.2C1 15.6 4.5 11 10 11z" fill="url(#lg-pad)"/>
<path d="M10.5 18.5v7M7 22h7" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>
<circle cx="27" cy="19.5" r="2.2" fill="#2dd4bf"/><circle cx="31" cy="23.5" r="2.2" fill="#ffd166"/>
<rect x="17" y="4" width="6" height="6" rx="1.8" fill="#2dd4bf"/>`;

// App icon: the mark on the header's navy, centred (mark spans x 1.5–38.5, y 4–34 of its 40×40 box).
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#141a46"/><g transform="translate(20 20) scale(0.82) translate(-20 -19)">${MARK}</g></svg>`;
writeFileSync('public/favicon.svg', favicon);
const svg = Buffer.from(favicon);
for (const [name, size] of [['icon-192.png', 192], ['logo-512.png', 512]] as const) {
  await sharp(svg, { density: 1200 }).resize(size, size).png().toFile(`public/${name}`);
}
// iOS rounds the corners itself and fills transparency with black → square tile.
await sharp(Buffer.from(favicon.replace('rx="10"', 'rx="0"')), { density: 1200 }).resize(180, 180).png().toFile('public/apple-touch-icon.png');
// favicon.ico: a 32×32 PNG inside an ICO container.
const png = await sharp(svg, { density: 1200 }).resize(32, 32).png().toBuffer();
const ico = Buffer.alloc(22);
ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico.writeUInt8(32, 6); ico.writeUInt8(32, 7); ico.writeUInt8(0, 8); ico.writeUInt8(0, 9);
ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
writeFileSync('public/favicon.ico', Buffer.concat([ico, png]));

const font = readFileSync('public/fonts/nunito-latin.woff2').toString('base64');
const og = `<!doctype html><html><head><style>
@font-face{font-family:Nunito;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:200 1000}
body{margin:0;width:1200px;height:630px;font-family:Nunito;color:#fff;display:flex;align-items:center;gap:56px;padding:0 110px;box-sizing:border-box;
background:radial-gradient(circle at 85% 20%,rgb(45 212 191/.3),transparent 40%),linear-gradient(135deg,#141a46,#2a1a8f 55%,#5a28e0)}
h1{margin:0;font-size:132px;font-weight:900;letter-spacing:.02em;line-height:1}
p{margin:18px 0 0;font-size:44px;font-weight:800;color:#ffd166}
small{display:block;margin-top:14px;font-size:30px;font-weight:700;color:#d9d3ff}
</style></head><body><svg width="250" height="250" viewBox="0 0 40 40">${MARK}</svg>
<div><h1>PIXUVO</h1><p>Free Online Games</p><small>No downloads. Just play.</small></div></body></html>`;
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(og);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'public/og-default.png' });
await b.close();
console.log('icons written');
