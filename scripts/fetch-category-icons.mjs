// One-off: downloads Microsoft Fluent Emoji 3D (MIT, github.com/microsoft/fluentui-emoji) for category icons → public/icons/cat/<slug>.webp (96 px).
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
const MAP = {
  action: 'Fire', fighting: 'Boxing glove', ninja: 'Ninja', adventure: 'Compass', escape: 'Door', arcade: 'Joystick', runner: 'Person running',
  retro: 'Video game', snake: 'Snake', 'bubble-shooter': 'Bubbles', casual: 'Smiling face with sunglasses', puzzle: 'Puzzle piece', jigsaw: 'Puzzle piece',
  '2048': 'Input numbers', 'hidden-object': 'Magnifying glass tilted left', block: 'Brick', maze: 'World map', math: 'Abacus', memory: 'Brain',
  racing: 'Racing car', car: 'Automobile', drift: 'Dashing away', motorcycle: 'Motorcycle', driving: 'Oncoming automobile', parking: 'P button',
  truck: 'Delivery truck', bus: 'Bus', shooting: 'Bullseye', sniper: 'Bullseye', zombie: 'Skull', 'first-person-shooter': 'Water pistol',
  tank: 'Military helmet', archery: 'Bow and arrow', sports: 'Soccer ball', football: 'Soccer ball', basketball: 'Basketball', pool: 'Pool 8 ball',
  golf: 'Flag in hole', strategy: 'Crossed swords', 'tower-defense': 'Castle', simulation: 'Building construction', tycoon: 'Money bag',
  farming: 'Tractor', building: 'Construction', idle: 'Hourglass not done', clicker: 'Computer mouse', platformer: 'Kangaroo', board: 'Game die',
  chess: 'Chess pawn', card: 'Joker', solitaire: 'Spade suit', mahjong: 'Mahjong red dragon', 'match-3': 'Gem stone', word: 'Input latin letters',
  quiz: 'Red question mark', music: 'Musical notes', horror: 'Ghost', cooking: 'Cooking', 'dress-up': 'Dress', coloring: 'Artist palette',
  educational: 'Graduation cap', multiplayer: 'Busts in silhouette', '2-player': 'Handshake', cooperative: 'People hugging', io: 'Globe with meridians',
  // UI
  'ui-new': 'New button', 'ui-popular': 'Fire', 'ui-trophy': 'Trophy', 'ui-star': 'Star', 'ui-heart': 'Red heart', 'ui-controller': 'Video game',
  'ui-lightning': 'High voltage', 'ui-cloud': 'Cloud', 'ui-grid': 'Joystick', 'ui-clock': 'Alarm clock', 'ui-sparkles': 'Sparkles', 'ui-two': 'Handshake',
};
const base = 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/';
const fails = [];
for (const [slug, name] of Object.entries(MAP)) {
  const file = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const tries = [`${encodeURIComponent(name)}/3D/${file}_3d.png`, `${encodeURIComponent(name)}/Default/3D/${file}_3d_default.png`];
  let ok = false;
  for (const t of tries) {
    const r = await fetch(base + t);
    if (r.ok) {
      const buf = Buffer.from(await r.arrayBuffer());
      writeFileSync(`public/icons/cat/${slug}.webp`, await sharp(buf).resize(96, 96).webp({ quality: 82 }).toBuffer());
      ok = true;
      break;
    }
  }
  if (!ok) fails.push(`${slug} (${name})`);
}
console.log('failed:', fails.join(', ') || 'none');
