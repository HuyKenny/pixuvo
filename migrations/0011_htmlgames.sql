-- HTMLGames.com (Zygomatic): public JSON feed, "Feel free to publish our html5 games on your site" (RSS page).
INSERT INTO providers (id, name, website, catalog_status, publish_status, monetize_status, consent_mode, attribution, notes, verified_at, updated_at) VALUES
  ('htmlgames', 'HTMLGames', 'https://www.htmlgames.com', 'available', 'approved', 'not_approved', 'partner_handles', '{}',
   'Public feed https://www.htmlgames.com/rss/games.php?json (1 242 games on 2026-10-05), no account or key; the RSS page says "Feel free to publish our html5 games on your site". No revenue share for publishers: their ads.partners.txt lines (src/config/ads-htmlgames.ts) authorise Zygomatic''s sellers on pixuvo.com. CONSENT: live test 2026-10-05 from an EU IP — a certified InMobi TCF dialog with "Reject all" appears before any ad (ads via Yolla Media + Google IMA/GAM); no popups.',
   '2026-10-05T14:00:00Z', '2026-10-05T14:00:00Z')
ON CONFLICT(id) DO NOTHING;

-- Solitaire and mahjong variants with large search demand (Ahrefs global/month, 2026-10-05): spider solitaire 2.0 M,
-- freecell 1.38 M, klondike solitaire 266 k, mahjong connect 107 k, pyramid solitaire 40 k, golf solitaire 21 k.
INSERT INTO seo_landings (slug, h1, title, description, intro, filter, status, indexable, min_games, updated_at) VALUES
 ('spider-solitaire', 'Spider Solitaire', 'Spider Solitaire – Play Free Spider Solitaire Online',
  'Free spider solitaire games: classic Spider, one-suit games, big versions and variants like Tarantula and Black Widow. Play online, no downloads.',
  'Build sequences from King to Ace and clear the tableau.',
  '{"tags":["spider-solitaire"]}', 'published', 1, 10, '2026-10-05T00:00:00Z'),
 ('freecell', 'FreeCell Solitaire', 'FreeCell Solitaire – Play Free FreeCell Online',
  'Free FreeCell solitaire games: classic FreeCell and themed versions with four free cells. Play online in your browser, no downloads.',
  'Four free cells, one deck and almost every deal can be won.',
  '{"tags":["freecell"]}', 'published', 1, 12, '2026-10-05T00:00:00Z'),
 ('klondike-solitaire', 'Klondike Solitaire', 'Klondike Solitaire – Play Free Classic Solitaire Online',
  'Free Klondike solitaire games: the classic patience game plus Halloween, Christmas and Wild West versions. Play online in your browser, no downloads.',
  'The classic patience game: build the foundations from Ace to King.',
  '{"tags":["klondike"]}', 'published', 1, 12, '2026-10-05T00:00:00Z'),
 ('pyramid-solitaire', 'Pyramid Solitaire', 'Pyramid Solitaire – Play Free Pyramid Solitaire Online',
  'Free pyramid solitaire games: pair cards that add up to 13 and clear the pyramid. Play online in your browser, no downloads.',
  'Pair two cards that add up to 13 and clear the pyramid.',
  '{"tags":["pyramid-solitaire"]}', 'published', 1, 12, '2026-10-05T00:00:00Z'),
 ('golf-solitaire', 'Golf & TriPeaks Solitaire', 'Golf and TriPeaks Solitaire – Play Free Online',
  'Free golf and TriPeaks solitaire games: play cards one higher or lower and clear the board. Play online in your browser, no downloads.',
  'Play a card one higher or one lower and clear the whole table.',
  '{"tags":["golf-solitaire","tripeaks"]}', 'published', 1, 12, '2026-10-05T00:00:00Z'),
 ('mahjong-connect', 'Mahjong Connect', 'Mahjong Connect – Play Free Mahjong Connect Online',
  'Free mahjong connect games: link two matching tiles with a path of up to three lines. Play online in your browser, no downloads.',
  'Link two matching tiles with a path of no more than three straight lines.',
  '{"tags":["mahjong-connect"]}', 'published', 1, 12, '2026-10-05T00:00:00Z')
ON CONFLICT(slug) DO NOTHING;
