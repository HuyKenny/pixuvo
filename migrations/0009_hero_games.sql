-- SEO audit 2026-10-03: "hero games" — titles people really search for (Ahrefs, monthly global volume).
-- search_volume feeds rank_score (src/lib/rank.ts); game_editorial holds Pixuvo's own texts per language.
ALTER TABLE games ADD COLUMN search_volume INTEGER NOT NULL DEFAULT 0;

CREATE TABLE game_editorial (
  game_id     INTEGER NOT NULL REFERENCES games(id),
  lang        TEXT NOT NULL,
  summary     TEXT NOT NULL,              -- 120–180 words, own words (no partner text)
  how_to      TEXT NOT NULL DEFAULT '',   -- how to play, from real controls / publisher instructions
  tips_json   TEXT NOT NULL DEFAULT '[]', -- ["tip", …]
  faq_json    TEXT NOT NULL DEFAULT '[]', -- [{"q": "", "a": ""}, …]
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (game_id, lang)
) WITHOUT ROWID;
