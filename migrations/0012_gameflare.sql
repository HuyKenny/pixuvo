-- GameFlare: public feed, revenue share for publishers with an account. Approved by the site owner on 2026-10-05.
INSERT INTO providers (id, name, website, catalog_status, publish_status, monetize_status, consent_mode, attribution, notes, verified_at, updated_at) VALUES
  ('gameflare', 'GameFlare', 'https://distribution.gameflare.com', 'available', 'approved', 'pending', 'owner_accepted', '{}',
   'Public feed https://distribution.gameflare.com/feed.json (164 games on 2026-10-05). Revenue share 35 % for publishers (50 % developer, 15 % GameFlare), monthly from 50 EUR — needs a publisher account (Sign up on distribution.gameflare.com, "only offered for established websites") and their ads.txt lines (src/config/ads-gameflare.ts). Mark monetization approved once the account exists. CONSENT: live test 2026-10-05 from an EU IP — no TCF dialog, only "By clicking Play Game you agree with our Privacy Policy and Cookie Policy… targeted advertisements"; ads via AdinPlay, Venatus, Google IMA/AdSense, CPMStar; no popups. The site owner decided on 2026-10-05 to publish anyway (like GameMonetize). Their WAF answers 403 to HeadlessChrome user agents.',
   '2026-10-05T16:00:00Z', '2026-10-05T16:00:00Z')
ON CONFLICT(id) DO NOTHING;

-- "parkour games": 10 k US / 19 k global searches a month, KD 0 (Ahrefs 2026-10-05). Obby = parkour courses.
INSERT INTO seo_landings (slug, h1, title, description, intro, filter, status, indexable, min_games, updated_at) VALUES
 ('parkour', 'Parkour Games', 'Parkour Games – Play Free Parkour and Obby Games Online',
  'Free parkour games: jump, climb and run through obstacle courses and obbies. Play online in your browser, no downloads.',
  'Jump, climb and run through tricky obstacle courses.',
  '{"tags":["parkour","obby"]}', 'published', 1, 24, '2026-10-05T00:00:00Z')
ON CONFLICT(slug) DO NOTHING;
