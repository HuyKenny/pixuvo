/**
 * Pixuvo taxonomy — the single source of truth for categories, shared by the
 * importer (mapping provider data) and the site (navigation, URLs).
 *
 * Rules:
 * - A game joins a category only when the PROVIDER declared a matching
 *   category or tag. We never guess a genre from the title.
 * - Brand names (Minecraft, Roblox, …) are never categories.
 * - A category page is published only when it has at least MIN_CATEGORY_GAMES.
 */

export type CategoryKind = 'genre' | 'subgenre' | 'mode';

export interface CategoryDef {
  slug: string;
  name: string;
  kind: CategoryKind;
  parent?: string;
  /** Normalised provider category/tag names that map here. */
  match: string[];
  /** Shown in the header / homepage sections. */
  nav?: boolean;
  blurb: string;
}

export const MIN_CATEGORY_GAMES = 12;

export const CATEGORIES: CategoryDef[] = [
  // ── Genres ────────────────────────────────────────────────────────────────
  { slug: 'action', name: 'Action', kind: 'genre', nav: true, match: ['action'], blurb: 'Fast reflexes, quick decisions and plenty of things happening on screen.' },
  { slug: 'fighting', name: 'Fighting', kind: 'subgenre', parent: 'action', match: ['fighting', 'fight', 'street fighting', 'boxing', 'beat em up', "beat 'em up", 'martial arts'], blurb: 'One-on-one duels, brawlers and arena fights.' },
  { slug: 'ninja', name: 'Ninja', kind: 'subgenre', parent: 'action', match: ['ninja'], blurb: 'Stealthy heroes, shuriken and acrobatic action.' },
  { slug: 'adventure', name: 'Adventure', kind: 'genre', nav: true, match: ['adventure'], blurb: 'Explore worlds, solve problems and follow a story to the end.' },
  { slug: 'escape', name: 'Escape', kind: 'subgenre', parent: 'adventure', match: ['escape', 'escape room', 'escape-room', 'point and click', 'point-and-click'], blurb: 'Find clues, combine items and get out.' },
  { slug: 'arcade', name: 'Arcade', kind: 'genre', nav: true, match: ['arcade'], blurb: 'Pick-up-and-play games built around score, timing and one more try.' },
  { slug: 'runner', name: 'Runner', kind: 'subgenre', parent: 'arcade', match: ['runner', 'running', 'endless runner', 'endless'], blurb: 'Keep moving, dodge obstacles and see how far you get.' },
  { slug: 'retro', name: 'Retro', kind: 'subgenre', parent: 'arcade', match: ['retro', 'classic arcade'], blurb: 'Old-school ideas and pixel-era game design.' },
  { slug: 'snake', name: 'Snake', kind: 'subgenre', parent: 'arcade', match: ['snake'], blurb: 'Grow longer, avoid your own tail.' },
  { slug: 'bubble-shooter', name: 'Bubble Shooter', kind: 'subgenre', parent: 'arcade', match: ['bubble shooter', 'bubble-shooter'], blurb: 'Aim, match colours and clear the board.' },
  { slug: 'casual', name: 'Casual', kind: 'genre', match: ['casual', 'hypercasual', 'hyper casual', 'hyper-casual'], blurb: 'Short, relaxed games you can play in a spare minute.' },
  { slug: 'puzzle', name: 'Puzzle', kind: 'genre', nav: true, match: ['puzzle', 'puzzles', 'logic', 'logical', 'brain', 'brain games'], blurb: 'Logic, patterns and clever solutions.' },
  { slug: 'jigsaw', name: 'Jigsaw', kind: 'subgenre', parent: 'puzzle', match: ['jigsaw', 'jigsaw puzzles', 'jigsaw-puzzles', 'jigsaw puzzle'], blurb: 'Put the pieces together.' },
  { slug: '2048', name: '2048', kind: 'subgenre', parent: 'puzzle', match: ['2048'], blurb: 'Slide and merge numbered tiles.' },
  { slug: 'hidden-object', name: 'Hidden Object', kind: 'subgenre', parent: 'puzzle', match: ['hidden object', 'hidden-object', 'hidden objects', 'difference', 'spot the difference'], blurb: 'Search the scene and spot what does not belong.' },
  { slug: 'block', name: 'Block Puzzle', kind: 'subgenre', parent: 'puzzle', match: ['block', 'block puzzle', 'puzzleblock', 'blocks'], blurb: 'Place, fit and clear blocks.' },
  { slug: 'maze', name: 'Maze', kind: 'subgenre', parent: 'puzzle', match: ['maze', 'labyrinth'], blurb: 'Find the way through.' },
  { slug: 'math', name: 'Math', kind: 'subgenre', parent: 'puzzle', match: ['math', 'maths', 'number', 'numbers'], blurb: 'Numbers, sums and quick mental arithmetic.' },
  { slug: 'memory', name: 'Memory', kind: 'subgenre', parent: 'puzzle', match: ['memory'], blurb: 'Remember, match and recall.' },
  { slug: 'racing', name: 'Racing', kind: 'genre', nav: true, match: ['racing', 'race', 'races'], blurb: 'Beat the clock or the other racers to the finish line.' },
  { slug: 'car', name: 'Car', kind: 'subgenre', parent: 'racing', match: ['car', 'cars', 'supercars', 'car games'], blurb: 'Cars of every kind, from city traffic to supercars.' },
  { slug: 'drift', name: 'Drift', kind: 'subgenre', parent: 'racing', match: ['drift', 'drifting'], blurb: 'Slide through corners and keep the combo going.' },
  { slug: 'motorcycle', name: 'Motorcycle', kind: 'subgenre', parent: 'racing', match: ['motorcycle', 'motorbike', 'moto', 'bike', 'dirt bike', 'motocross'], blurb: 'Two wheels, ramps and balance.' },
  { slug: 'driving', name: 'Driving', kind: 'genre', match: ['driving', 'drive'], blurb: 'Steer, brake and handle the road.' },
  { slug: 'parking', name: 'Parking', kind: 'subgenre', parent: 'driving', match: ['parking', 'car parking'], blurb: 'Precise manoeuvres into tight spots.' },
  { slug: 'truck', name: 'Truck', kind: 'subgenre', parent: 'driving', match: ['truck', 'trucks', 'tractor'], blurb: 'Heavy vehicles, cargo and rough roads.' },
  { slug: 'bus', name: 'Bus', kind: 'subgenre', parent: 'driving', match: ['bus'], blurb: 'Pick up passengers and keep to the route.' },
  { slug: 'shooting', name: 'Shooting', kind: 'genre', nav: true, match: ['shooting', 'shooter', 'shoot', 'gun', 'guns', "shoot 'em up", 'shoot em up'], blurb: 'Aim carefully and hit the target.' },
  { slug: 'sniper', name: 'Sniper', kind: 'subgenre', parent: 'shooting', match: ['sniper'], blurb: 'Long-range precision shooting.' },
  { slug: 'zombie', name: 'Zombie', kind: 'subgenre', parent: 'shooting', match: ['zombie', 'zombies'], blurb: 'Survive the undead.' },
  { slug: 'first-person-shooter', name: 'First-Person Shooter', kind: 'subgenre', parent: 'shooting', match: ['first-person-shooter', 'first person shooter', 'fps'], blurb: 'Shooters seen through the hero’s eyes.' },
  { slug: 'tank', name: 'Tank', kind: 'subgenre', parent: 'shooting', match: ['tank', 'tanks'], blurb: 'Armoured battles and big guns.' },
  { slug: 'archery', name: 'Archery', kind: 'subgenre', parent: 'shooting', match: ['archery', 'bow', 'arrow'], blurb: 'Bows, arrows and wind.' },
  { slug: 'sports', name: 'Sports', kind: 'genre', nav: true, match: ['sports', 'sport'], blurb: 'Ball games, athletics and competitions.' },
  { slug: 'football', name: 'Football', kind: 'subgenre', parent: 'sports', match: ['football', 'soccer'], blurb: 'Football (soccer) games: penalties, matches and tricks.' },
  { slug: 'basketball', name: 'Basketball', kind: 'subgenre', parent: 'sports', match: ['basketball'], blurb: 'Shoot hoops.' },
  { slug: 'pool', name: 'Pool & Billiards', kind: 'subgenre', parent: 'sports', match: ['8 ball pool', 'pool', 'billiards', 'snooker'], blurb: 'Cue sports.' },
  { slug: 'golf', name: 'Golf', kind: 'subgenre', parent: 'sports', match: ['golf', 'mini golf', 'minigolf'], blurb: 'Putts, drives and holes in one.' },
  { slug: 'strategy', name: 'Strategy', kind: 'genre', nav: true, match: ['strategy'], blurb: 'Plan ahead and outthink your opponent.' },
  { slug: 'tower-defense', name: 'Tower Defense', kind: 'subgenre', parent: 'strategy', match: ['tower defense', 'tower-defense', 'td'], blurb: 'Build defences and hold the line.' },
  { slug: 'simulation', name: 'Simulation', kind: 'genre', nav: true, match: ['simulation', 'simulator'], blurb: 'Run, build and manage something of your own.' },
  { slug: 'tycoon', name: 'Tycoon', kind: 'subgenre', parent: 'simulation', match: ['tycoon', 'management', 'business'], blurb: 'Grow a business from nothing.' },
  { slug: 'farming', name: 'Farming', kind: 'subgenre', parent: 'simulation', match: ['farm', 'farming'], blurb: 'Crops, animals and harvests.' },
  { slug: 'building', name: 'Building', kind: 'subgenre', parent: 'simulation', match: ['building', 'construction', 'sandbox'], blurb: 'Build structures and worlds.' },
  { slug: 'idle', name: 'Idle', kind: 'genre', match: ['idle', 'incremental'], blurb: 'Progress that keeps going even when you look away.' },
  { slug: 'clicker', name: 'Clicker', kind: 'genre', match: ['clicker', 'click'], blurb: 'Click, upgrade, repeat.' },
  { slug: 'platformer', name: 'Platformer', kind: 'genre', match: ['platformer', 'platform', 'platforms'], blurb: 'Run, jump and land on the next ledge.' },
  { slug: 'board', name: 'Board', kind: 'genre', match: ['board', 'board games', 'checkers', 'ludo', 'backgammon', 'dominoes'], blurb: 'Classic tabletop games on screen.' },
  { slug: 'chess', name: 'Chess', kind: 'subgenre', parent: 'board', match: ['chess'], blurb: 'The royal game.' },
  { slug: 'card', name: 'Card', kind: 'genre', match: ['card', 'cards', 'card games'], blurb: 'Deal, play and build the best hand.' },
  { slug: 'solitaire', name: 'Solitaire', kind: 'subgenre', parent: 'card', match: ['solitaire', 'klondike', 'spider solitaire', 'freecell'], blurb: 'Patience card games for one.' },
  { slug: 'mahjong', name: 'Mahjong', kind: 'genre', match: ['mahjong', 'mahjongg'], blurb: 'Match tiles and clear the layout.' },
  { slug: 'match-3', name: 'Match 3', kind: 'genre', match: ['match 3', 'match-3', 'match3', 'bejeweled', 'jewel', 'jewels', 'matching'], blurb: 'Line up three or more and watch them pop.' },
  { slug: 'word', name: 'Word', kind: 'genre', match: ['word', 'words', 'word games', 'crossword', 'wordsearch', 'word search', 'spelling'], blurb: 'Letters, vocabulary and wordplay.' },
  { slug: 'quiz', name: 'Quiz', kind: 'genre', match: ['quiz', 'trivia'], blurb: 'Test what you know.' },
  { slug: 'music', name: 'Music', kind: 'genre', match: ['music', 'rhythm', 'piano'], blurb: 'Rhythm, beats and instruments.' },
  { slug: 'horror', name: 'Horror', kind: 'genre', match: ['horror', 'scary'], blurb: 'Dark corridors and things that go bump.' },
  { slug: 'cooking', name: 'Cooking', kind: 'genre', match: ['cooking', 'cook', 'kitchen', 'restaurant', 'chef'], blurb: 'Prepare dishes and serve customers.' },
  { slug: 'dress-up', name: 'Dress Up', kind: 'genre', match: ['dress up', 'dress-up', 'dressup', 'fashion', 'makeover', 'makeup', 'make up'], blurb: 'Outfits, styling and makeovers.' },
  { slug: 'coloring', name: 'Coloring & Drawing', kind: 'genre', match: ['coloring', 'colouring', 'drawing', 'draw', 'paint'], blurb: 'Colour pictures and draw your own.' },
  { slug: 'educational', name: 'Educational', kind: 'genre', match: ['educational', 'education', 'learning'], blurb: 'Games that teach something along the way.' },
  // ── Modes (how you play, not what you play) ──────────────────────────────
  { slug: 'multiplayer', name: 'Multiplayer', kind: 'mode', nav: true, match: ['multiplayer', 'multi player', 'online multiplayer'], blurb: 'Games for more than one player.' },
  { slug: '2-player', name: '2 Player', kind: 'mode', nav: true, match: ['2 player', '2 player games', 'two-player', 'two player', '2 players', '2player'], blurb: 'Play with a friend.' },
  { slug: 'cooperative', name: 'Cooperative', kind: 'mode', match: ['coop', 'co-op', 'cooperative'], blurb: 'Team up instead of competing.' },
  { slug: 'io', name: '.io', kind: 'mode', match: ['.io', 'io', '.io games', 'io games'], blurb: 'Browser arena games in the .io style.' },
];

const bySlug = new Map(CATEGORIES.map((c) => [c.slug, c]));
export function getCategoryDef(slug: string): CategoryDef | undefined {
  return bySlug.get(slug);
}

/** Normalise a provider label for matching. */
export function normLabel(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const matchIndex = new Map<string, string[]>();
for (const c of CATEGORIES) {
  for (const m of c.match) {
    const k = normLabel(m);
    const arr = matchIndex.get(k) ?? [];
    arr.push(c.slug);
    matchIndex.set(k, arr);
  }
}

/** Provider labels (category + tags) → Pixuvo category slugs. A subgenre also adds its parent. */
export function mapLabelsToCategories(labels: string[]): string[] {
  const out = new Set<string>();
  for (const l of labels) {
    const hits = matchIndex.get(normLabel(l));
    if (!hits) continue;
    for (const slug of hits) {
      out.add(slug);
      const parent = bySlug.get(slug)?.parent;
      if (parent) out.add(parent);
    }
  }
  return [...out];
}

/** Choose a primary category: most specific genre wins, modes only as a last resort. */
export function pickPrimaryCategory(slugs: string[]): string | null {
  const defs = slugs.map((s) => bySlug.get(s)).filter((d): d is CategoryDef => !!d);
  const order = (d: CategoryDef) => (d.kind === 'genre' ? 0 : d.kind === 'subgenre' ? 1 : 2);
  defs.sort((a, b) => order(a) - order(b) || CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b));
  // Prefer a real genre that is not the generic "casual" bucket.
  const genre = defs.find((d) => d.kind === 'genre' && d.slug !== 'casual');
  return (genre ?? defs[0])?.slug ?? null;
}

/** Labels that are noise, platform names or marketing rather than descriptive tags. */
export const TAG_STOPLIST = new Set(
  [
    'html5', 'html', 'h5', 'game', 'games', 'fun', 'funny', 'best', 'best games', 'hot', 'new', 'cool', 'amazing', 'play',
    'online', 'free', 'free html5 games for your website', 'html5 games', 'android', 'iphone', 'ipad', 'mobile', 'kiz10',
    'mapi games', 'mentolatux', '2025 games', '2026 games', '2024 games', 'super', 'crazy', 'interactive', 'kids', 'kid',
    'boys', 'boy', 'girls', 'girl', 'games for girls', 'games-for-girls', 'addictive', '1 player', 'webgl', 'unity', 'unity3d',
    '2d', '3d', '3d games', 'pixel', 'skill', 'skills',
  ].map(normLabel),
);

/**
 * Brands / third-party IP. A game whose TITLE names one goes to editorial review
 * instead of being published automatically (we cannot verify a licence). When a
 * brand only appears as a tag, the tag is dropped.
 */
export const BRAND_TERMS = [
  'minecraft', 'roblox', 'mario', 'sonic', 'pokemon', 'pikachu', 'skibidi', 'gta', 'grand theft', 'spiderman', 'spider-man', 'spider man',
  'disney', 'barbie', 'ben 10', 'frozen', 'elsa', 'dora', 'batman', 'subway surfers', 'cartoon network', 'dragon ball', 'naruto',
  'among us', 'fnaf', 'five nights', 'poppy playtime', 'huggy', 'squid game', 'peppa', 'paw patrol', 'minion', 'lego', 'fortnite',
  'pubg', 'free fire', 'stumble guys', 'geometry dash', 'angry birds', 'pac-man', 'pacman', 'candy crush', 'talking tom',
  'hello kitty', 'shrek', 'marvel', 'avengers', 'superman', 'hulk', 'iron man', 'harry potter', 'star wars', 'spongebob',
  'mickey', 'winx', 'monster high', 'lol surprise', 'one piece', 'genshin', 'zelda', 'rainbow friends', 'sprunki', 'incredibox',
  'bluey', 'toca', 'hollow knight', 'silksong', 'baby hazel', 'my little pony', 'sailor moon', 'pj masks', 'teen titans',
  'gumball', 'adventure time', 'tom and jerry', 'scooby', 'simpsons', 'call of duty', 'counter strike', 'cs go', 'valorant',
  'overwatch', 'zuma', 'bejeweled', 'tetris', 'fall guys', 'sims',
];

/** Adult / gambling signals in a title or tags → editorial review, never auto-published. */
export const SENSITIVE_TERMS = ['adult', 'sexy', 'sex', 'nude', 'kiss', 'kissing', 'casino', 'gambling', 'slot', 'slots', 'poker', 'roulette', 'betting', 'blackjack', 'plinko', 'hot chats'];

function wordRe(term: string): RegExp {
  return new RegExp(`(?<![a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i');
}
const brandRes = BRAND_TERMS.map((t) => [t, wordRe(t)] as const);
const sensitiveRes = SENSITIVE_TERMS.map((t) => [t, wordRe(t)] as const);

export function findBrandTerms(text: string): string[] {
  return brandRes.filter(([, re]) => re.test(text)).map(([t]) => t);
}
export function findSensitiveTerms(text: string): string[] {
  return sensitiveRes.filter(([, re]) => re.test(text)).map(([t]) => t);
}

/** Query synonyms for search (both directions). */
/**
 * Themes = curated groups of partner tags, used as a category filter ("Animals", "Christmas"…).
 * Partner tags are noisy (logic/logical, jump/jumping); a theme merges the spellings.
 * Only themes with at least MIN_CATEGORY_GAMES games in a category are offered there.
 */
export interface ThemeDef {
  slug: string;
  name: string;
  emoji: string;
  tags: string[];
}
export const THEMES: ThemeDef[] = [
  { slug: 'animals', name: 'Animals', emoji: '🐶', tags: ['animal', 'animals', 'pet', 'pets', 'dog', 'cat', 'horse', 'dinosaur', 'dino'] },
  { slug: 'cars', name: 'Cars', emoji: '🚗', tags: ['cars', 'car', 'supercars', 'drifting', 'drift'] },
  { slug: 'brain', name: 'Brain & Logic', emoji: '🧠', tags: ['brain', 'logic', 'logical', 'mind', 'iq', 'thinking', 'brain-teaser'] },
  { slug: 'christmas', name: 'Christmas', emoji: '🎄', tags: ['christmas', 'xmas', 'santa'] },
  { slug: 'halloween', name: 'Halloween', emoji: '🎃', tags: ['halloween', 'spooky', 'pumpkin'] },
  { slug: 'food', name: 'Candy & Food', emoji: '🍭', tags: ['candy', 'food', 'cake', 'fruit', 'sweet', 'pizza'] },
  { slug: 'fashion', name: 'Fashion & Princess', emoji: '👑', tags: ['princess', 'fashion', 'makeover', 'dress-up', 'dressup'] },
  { slug: 'monsters', name: 'Monsters', emoji: '👾', tags: ['monster', 'monsters'] },
  { slug: 'space', name: 'Space', emoji: '🚀', tags: ['space', 'alien', 'aliens', 'galaxy', 'planet'] },
  { slug: 'superhero', name: 'Superheroes', emoji: '🦸', tags: ['superhero', 'superheroes', 'hero'] },
  { slug: 'army', name: 'Army & War', emoji: '🪖', tags: ['army', 'war', 'military', 'soldier', 'soldiers'] },
  { slug: 'anime', name: 'Anime', emoji: '🌸', tags: ['anime', 'manga'] },
  { slug: 'ball', name: 'Ball', emoji: '⚽', tags: ['ball', 'balls'] },
  { slug: 'drawing', name: 'Drawing & Colors', emoji: '🎨', tags: ['drawing', 'draw', 'color', 'colors', 'coloring', 'paint', 'painting'] },
  { slug: 'relaxing', name: 'Relaxing', emoji: '😌', tags: ['relaxation', 'relaxing', 'relax', 'satisfying', 'asmr'] },
  { slug: 'physics', name: 'Physics', emoji: '🧲', tags: ['physics'] },
  { slug: 'family', name: 'Little Kids', emoji: '🧸', tags: ['baby', 'family', 'kids', 'toddler', 'preschool'] },
  { slug: 'classic', name: 'Classic', emoji: '🕹️', tags: ['classic'] },
];
export const THEME_SLUGS = THEMES.map((t) => t.slug);

export const SEARCH_SYNONYMS: Record<string, string[]> = {
  car: ['driving', 'racing', 'cars'],
  cars: ['car', 'driving'],
  driving: ['car', 'drive'],
  soccer: ['football'],
  football: ['soccer'],
  bike: ['motorcycle', 'moto'],
  motorcycle: ['bike', 'moto'],
  shooter: ['shooting'],
  shooting: ['shooter'],
  zombies: ['zombie'],
  '2player': ['2 player'],
  twoplayer: ['2 player'],
  mahjongg: ['mahjong'],
  colouring: ['coloring'],
  puzzles: ['puzzle'],
};
