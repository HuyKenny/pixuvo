-- /games/ is an A–Z directory (stable pages; /new-games/ covers "newest"). Page N is a keyset read
-- from the boundary (title_norm, id) precomputed into site_settings.dir_bounds.
CREATE INDEX IF NOT EXISTS games_status_title ON games(status, title_norm, id);
