-- Machine translations of partner texts (separate D1 "pixuvo-i18n" so the catalog DB stays small).
CREATE TABLE game_translations (
  game_id       INTEGER NOT NULL,
  lang          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  instructions  TEXT NOT NULL DEFAULT '',
  source_hash   TEXT NOT NULL,          -- hash of the English texts that were translated
  model         TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (game_id, lang)
) WITHOUT ROWID;

-- Progress + spend bookkeeping for scripts/translate.ts.
CREATE TABLE translate_runs (
  id             INTEGER PRIMARY KEY,
  started_at     TEXT NOT NULL,
  finished_at    TEXT,
  status         TEXT NOT NULL,
  pairs_done     INTEGER NOT NULL DEFAULT 0,
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  est_cost_usd   REAL NOT NULL DEFAULT 0,
  error          TEXT
);
