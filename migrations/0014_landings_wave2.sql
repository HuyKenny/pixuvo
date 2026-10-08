-- Content audit wave 2 (Marketing Miner, US): toddler games 18 k, games for 5 year olds 4 k + kindergarten 2.6 k, ludo game 10 k, 3D games 12 k.
-- Tags are derived (TITLE_TAGS in src/lib/taxonomy.ts): age words from the description, 3D from the game's visual style.
INSERT INTO seo_landings (slug, h1, title, description, intro, filter, status, indexable, min_games, updated_at) VALUES
 ('toddler', 'Toddler Games', 'Toddler Games – Free Online Games for Toddlers and Preschoolers',
  'Free toddler games: simple puzzles, colors, shapes, letters and counting for the youngest players. Play online, no downloads.',
  'Simple puzzles, colors, shapes and letters for the youngest players.',
  '{"tags":["toddler-games"]}', 'published', 1, 24, '2026-10-08T00:00:00Z'),
 ('kindergarten', 'Kindergarten Games', 'Kindergarten Games – Free Learning Games for 5 Year Olds',
  'Free kindergarten games for 5 year olds: coloring, memory, math, letters and spot the difference. Play online, no downloads.',
  'Coloring, memory, letters and numbers for kindergarten age.',
  '{"tags":["kindergarten-games"]}', 'published', 1, 24, '2026-10-08T00:00:00Z'),
 ('ludo', 'Ludo Games', 'Ludo Games – Play Free Ludo Online',
  'Free Ludo games: roll the dice, move your tokens home and play against the computer or friends. Play online, no downloads.',
  'Roll the dice and race your tokens home.',
  '{"tags":["ludo-games"]}', 'published', 1, 24, '2026-10-08T00:00:00Z'),
 ('3d', '3D Games', '3D Games – Play Free 3D Games Online',
  'Free 3D games: racing, runners, sports, archery and more in 3D worlds. Play online in your browser, no downloads.',
  'Racing, running and sports in 3D worlds.',
  '{"tags":["3d-games"]}', 'published', 1, 24, '2026-10-08T00:00:00Z')
ON CONFLICT(slug) DO NOTHING;
