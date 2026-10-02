-- Pixuvo catalog schema (D1 / SQLite).
-- Conventions: timestamps are ISO-8601 UTC strings; unknown attribute = NULL.

CREATE TABLE providers (
  id               TEXT PRIMARY KEY,               -- 'gamemonetize', 'gamepix', ...
  name             TEXT NOT NULL,
  website          TEXT NOT NULL,
  -- 1) technical availability of the catalog feed
  catalog_status   TEXT NOT NULL DEFAULT 'unknown' CHECK (catalog_status IN ('available','unavailable','unknown')),
  -- 2) permission to publish games on pixuvo.com
  publish_status   TEXT NOT NULL DEFAULT 'pending' CHECK (publish_status IN ('approved','pending','awaiting_approval','rejected','disabled')),
  -- 3) permission to monetize + attribution in place
  monetize_status  TEXT NOT NULL DEFAULT 'pending' CHECK (monetize_status IN ('approved','pending','not_approved','disabled')),
  -- partner_handles = partner shows its own consent flow (verified live)
  -- owner_accepted  = no partner consent flow found; site owner explicitly decided to publish anyway
  consent_mode     TEXT NOT NULL DEFAULT 'blocked' CHECK (consent_mode IN ('partner_handles','owner_accepted','blocked')),
  attribution      TEXT NOT NULL DEFAULT '{}',     -- JSON: non-secret attribution config (e.g. GamePix sid)
  notes            TEXT NOT NULL DEFAULT '',
  verified_at      TEXT,
  updated_at       TEXT NOT NULL
);

CREATE TABLE developers (
  id    INTEGER PRIMARY KEY,
  slug  TEXT NOT NULL UNIQUE,
  name  TEXT NOT NULL
);

CREATE TABLE categories (
  id           INTEGER PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('genre','subgenre','mode')),
  parent_id    INTEGER REFERENCES categories(id),
  blurb        TEXT NOT NULL DEFAULT '',
  is_nav       INTEGER NOT NULL DEFAULT 0,
  sort         INTEGER NOT NULL DEFAULT 0,
  game_count   INTEGER NOT NULL DEFAULT 0,          -- published games, refreshed by catalog jobs
  seo_title    TEXT,
  seo_description TEXT,
  indexable    INTEGER NOT NULL DEFAULT 1,
  updated_at   TEXT NOT NULL
);

CREATE TABLE games (
  id                   INTEGER PRIMARY KEY,
  slug                 TEXT NOT NULL UNIQUE,
  title                TEXT NOT NULL,
  title_norm           TEXT NOT NULL,               -- lowercase ascii, for exact/prefix ranking + dedupe
  description          TEXT NOT NULL DEFAULT '',    -- plain text, sanitised
  instructions         TEXT NOT NULL DEFAULT '',    -- plain text, sanitised
  thumb_url            TEXT NOT NULL,
  thumb_w              INTEGER,
  thumb_h              INTEGER,
  developer_id         INTEGER REFERENCES developers(id),
  status               TEXT NOT NULL DEFAULT 'pending_review'
                       CHECK (status IN ('published','pending_review','hidden','archived','merged')),
  review_reason        TEXT,                        -- why it is not auto-published (brand_ip, sensitive, ...)
  merged_into          INTEGER REFERENCES games(id),
  primary_source_id    INTEGER,
  primary_category_id  INTEGER REFERENCES categories(id),
  source_release_date  TEXT,                        -- date the provider says the game was released/published
  added_at             TEXT NOT NULL,               -- date Pixuvo first imported it
  updated_at           TEXT NOT NULL,
  published_at         TEXT,
  -- Attributes declared by the provider (NULL = unknown)
  mobile_friendly      INTEGER,                     -- 1 = provider declares mobile support
  orientation          TEXT CHECK (orientation IN ('landscape','portrait','any')),
  players_max          INTEGER,
  multiplayer_mode     TEXT CHECK (multiplayer_mode IN ('local','online')),
  technology           TEXT,                        -- html5 / webgl / unity
  visual_style         TEXT CHECK (visual_style IN ('2d','3d','pixel')),
  language             TEXT,
  age_rating           TEXT,
  -- Derived by a deterministic parser from the provider's instructions (not a guarantee)
  controls_inferred    TEXT,                        -- JSON array: ["keyboard","mouse","touch"]
  -- Ordering signals
  dir_seq              INTEGER NOT NULL,            -- monotonic, stable position in the /games/ directory
  quality_score        REAL,                        -- provider-supplied quality 0..1 (GamePix); NULL = not supplied
  rank_score           REAL NOT NULL DEFAULT 0,     -- Pixuvo ordering score, see src/lib/rank.ts
  partner_rank         INTEGER,                     -- provider "most played" rank when available
  plays_7d             INTEGER NOT NULL DEFAULT 0,  -- Pixuvo play clicks, last 7 days (aggregated)
  trending_score       REAL NOT NULL DEFAULT 0,
  rating_up            INTEGER NOT NULL DEFAULT 0,
  rating_down          INTEGER NOT NULL DEFAULT 0,
  content_hash         TEXT NOT NULL DEFAULT ''
);
CREATE INDEX games_status_added  ON games(status, added_at DESC, id DESC);
CREATE INDEX games_status_rank   ON games(status, rank_score DESC, id DESC);
CREATE INDEX games_dir_seq       ON games(dir_seq);

CREATE TABLE game_sources (
  id                INTEGER PRIMARY KEY,
  game_id           INTEGER NOT NULL REFERENCES games(id),
  provider_id       TEXT NOT NULL REFERENCES providers(id),
  provider_game_id  TEXT NOT NULL,
  embed_url         TEXT NOT NULL,                   -- approved embed URL incl. attribution params
  width             INTEGER,
  height            INTEGER,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','missing','removed')),
  restrictions      TEXT NOT NULL DEFAULT '{}',      -- JSON: {"countries_block":[..],"devices":[..]}
  provider_labels   TEXT NOT NULL DEFAULT '[]',      -- JSON: provider category + tags as delivered
  payload_hash      TEXT NOT NULL,
  first_seen_at     TEXT NOT NULL,
  last_seen_at      TEXT NOT NULL,
  missing_since     TEXT,
  verified_at       TEXT,
  UNIQUE (provider_id, provider_game_id)
);
CREATE INDEX game_sources_game ON game_sources(game_id);

-- Membership denormalises the sort keys so a category page reads ~N rows, not the whole category.
CREATE TABLE game_categories (
  category_id  INTEGER NOT NULL REFERENCES categories(id),
  game_id      INTEGER NOT NULL REFERENCES games(id),
  published    INTEGER NOT NULL DEFAULT 0,
  rank_score   REAL NOT NULL DEFAULT 0,
  added_at     TEXT NOT NULL,
  origin       TEXT NOT NULL DEFAULT 'provider' CHECK (origin IN ('provider','editorial')),
  PRIMARY KEY (category_id, game_id)
) WITHOUT ROWID;
CREATE INDEX game_categories_rank  ON game_categories(category_id, published, rank_score DESC, game_id);
CREATE INDEX game_categories_new   ON game_categories(category_id, published, added_at DESC, game_id);
CREATE INDEX game_categories_game  ON game_categories(game_id);

CREATE TABLE tags (
  id    INTEGER PRIMARY KEY,
  slug  TEXT NOT NULL UNIQUE,
  name  TEXT NOT NULL
);
CREATE TABLE game_tags (
  game_id INTEGER NOT NULL REFERENCES games(id),
  tag_id  INTEGER NOT NULL REFERENCES tags(id),
  PRIMARY KEY (game_id, tag_id)
) WITHOUT ROWID;
CREATE INDEX game_tags_tag ON game_tags(tag_id, game_id);

CREATE TABLE game_aliases (
  game_id     INTEGER NOT NULL REFERENCES games(id),
  alias       TEXT NOT NULL,
  alias_norm  TEXT NOT NULL,
  PRIMARY KEY (game_id, alias_norm)
) WITHOUT ROWID;

-- Old slug -> current game (301). Kept forever.
CREATE TABLE slug_redirects (
  old_slug    TEXT PRIMARY KEY,
  game_id     INTEGER NOT NULL REFERENCES games(id),
  created_at  TEXT NOT NULL
) WITHOUT ROWID;

-- Editorial values beat provider values on every sync.
CREATE TABLE editorial_overrides (
  game_id     INTEGER NOT NULL REFERENCES games(id),
  field       TEXT NOT NULL CHECK (field IN ('title','description','instructions','status','categories','thumb_url','mobile_friendly','players_max','multiplayer_mode','visual_style')),
  value       TEXT NOT NULL,
  updated_by  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (game_id, field)
) WITHOUT ROWID;

CREATE TABLE duplicate_candidates (
  id           INTEGER PRIMARY KEY,
  game_a       INTEGER NOT NULL REFERENCES games(id),
  game_b       INTEGER NOT NULL REFERENCES games(id),
  score        REAL NOT NULL,
  signals      TEXT NOT NULL,                        -- JSON
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','merged','rejected')),
  created_at   TEXT NOT NULL,
  resolved_at  TEXT,
  resolved_by  TEXT,
  UNIQUE (game_a, game_b)
);
CREATE INDEX duplicate_candidates_status ON duplicate_candidates(status, score DESC);

CREATE TABLE seo_landings (
  id           INTEGER PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,                 -- full path segment, e.g. '2-player-racing-games'
  h1           TEXT NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL,
  intro        TEXT NOT NULL,
  filter       TEXT NOT NULL,                        -- JSON: {"all":["racing","2-player"]}
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  indexable    INTEGER NOT NULL DEFAULT 1,
  min_games    INTEGER NOT NULL DEFAULT 12,
  game_count   INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL
);

CREATE TABLE import_runs (
  id                  INTEGER PRIMARY KEY,
  provider_id         TEXT NOT NULL,
  mode                TEXT NOT NULL CHECK (mode IN ('sync','dry_run')),
  status              TEXT NOT NULL CHECK (status IN ('running','completed','failed','budget_stopped','aborted')),
  started_at          TEXT NOT NULL,
  finished_at         TEXT,
  complete_feed       INTEGER NOT NULL DEFAULT 0,    -- 1 only when every page was fetched and parsed
  checkpoint          TEXT NOT NULL DEFAULT '{}',    -- JSON: {"page":n,"processed":[...]}
  pages_fetched       INTEGER NOT NULL DEFAULT 0,
  items_seen          INTEGER NOT NULL DEFAULT 0,
  items_invalid       INTEGER NOT NULL DEFAULT 0,
  inserted            INTEGER NOT NULL DEFAULT 0,
  updated             INTEGER NOT NULL DEFAULT 0,
  unchanged           INTEGER NOT NULL DEFAULT 0,
  marked_missing      INTEGER NOT NULL DEFAULT 0,
  archived            INTEGER NOT NULL DEFAULT 0,
  rows_written        INTEGER NOT NULL DEFAULT 0,    -- from D1 meta
  rows_read           INTEGER NOT NULL DEFAULT 0,
  budget_rows         INTEGER NOT NULL,
  error               TEXT
);
CREATE INDEX import_runs_provider ON import_runs(provider_id, started_at DESC);

CREATE TABLE reports (
  id          INTEGER PRIMARY KEY,
  game_id     INTEGER REFERENCES games(id),
  reason      TEXT NOT NULL CHECK (reason IN ('not_loading','broken_controls','inappropriate','copyright','other')),
  message     TEXT NOT NULL DEFAULT '',
  page_path   TEXT NOT NULL DEFAULT '',
  voter_hash  TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  created_at  TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX reports_status ON reports(status, created_at DESC);

-- One vote per anonymous voter hash per game; aggregate counters live on games.
CREATE TABLE ratings (
  game_id     INTEGER NOT NULL REFERENCES games(id),
  voter_hash  TEXT NOT NULL,
  value       INTEGER NOT NULL CHECK (value IN (-1, 1)),
  created_at  TEXT NOT NULL,
  PRIMARY KEY (game_id, voter_hash)
) WITHOUT ROWID;

-- Daily counters. game_id 0 = site-wide.
CREATE TABLE aggregate_metrics (
  day            TEXT NOT NULL,
  game_id        INTEGER NOT NULL,
  play_clicks    INTEGER NOT NULL DEFAULT 0,
  sdk_starts     INTEGER NOT NULL DEFAULT 0,
  load_errors    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, game_id)
) WITHOUT ROWID;
CREATE INDEX aggregate_metrics_game ON aggregate_metrics(game_id, day);

CREATE TABLE site_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE admin_audit_log (
  id           INTEGER PRIMARY KEY,
  at           TEXT NOT NULL,
  actor        TEXT NOT NULL,
  action       TEXT NOT NULL,
  target_type  TEXT NOT NULL,
  target_id    TEXT NOT NULL,
  details      TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX admin_audit_log_at ON admin_audit_log(at DESC);

-- Full-text search. rowid = games.id. Maintained by the importer and admin edits.
CREATE VIRTUAL TABLE games_fts USING fts5(
  title, aliases, developer, labels,
  tokenize = 'unicode61 remove_diacritics 2',
  prefix = '2 3'
);

-- Popular / trending lists are precomputed by catalog jobs into site_settings
-- ('list:popular', 'list:trending' = JSON arrays of game ids) instead of extra
-- indexes on games: every index costs one written row per game update.

INSERT INTO site_settings (key, value, updated_at) VALUES
  ('data_version', '0', '2026-10-02T00:00:00Z'),
  ('published_version', '0', '2026-10-02T00:00:00Z'),
  ('ads_enabled', 'false', '2026-10-02T00:00:00Z');

INSERT INTO providers (id, name, website, catalog_status, publish_status, monetize_status, consent_mode, attribution, notes, updated_at) VALUES
  ('gamemonetize', 'GameMonetize', 'https://gamemonetize.com', 'available', 'approved', 'pending', 'owner_accepted', '{}',
   'Publisher account registered by the site owner; feed https://gamemonetize.com/feed.php. Revenue is attributed by verified domain + ads.txt in the GameMonetize dashboard. Mark monetization approved after the dashboard "Verify" succeeds. CONSENT: live test 2026-10-02 from an EU IP showed Google IMA/doubleclick ad requests and Google Tag Manager inside the game frame with NO consent prompt. The site owner decided on 2026-10-02 to publish GameMonetize games anyway (see LAUNCH-CHECKLIST.md).', '2026-10-02T00:00:00Z'),
  ('gamepix', 'GamePix', 'https://www.gamepix.com', 'available', 'approved', 'pending', 'partner_handles', '{"sid":"M7X08"}',
   'Publisher account registered by the site owner (sid M7X08). The sid is part of every embed URL. Mark monetization approved after ads.txt verification in the GamePix dashboard. CONSENT: live test 2026-10-02 from an EU IP: GamePix shows its own consent notice inside the game frame before ads.', '2026-10-02T00:00:00Z'),
  ('playgama', 'Playgama', 'https://playgama.com', 'unknown', 'pending', 'pending', 'blocked', '{}',
   'Account registered; catalog only available as a manual JSON download so far and the clid is not configured. Disabled until both exist.', '2026-10-02T00:00:00Z'),
  ('gamedistribution', 'GameDistribution', 'https://gamedistribution.com', 'unknown', 'awaiting_approval', 'not_approved', 'blocked', '{}',
   'Publisher application rejected for low traffic. Do not publish or monetize until approved.', '2026-10-02T00:00:00Z'),
  ('famobi', 'Famobi', 'https://famobi.com', 'unknown', 'disabled', 'not_approved', 'blocked', '{}',
   'Requires 50k+ monthly visits and an approved application. No access.', '2026-10-02T00:00:00Z');
