-- /games/ directory pages read by (status, dir_seq) range; the old single-column
-- index made SQLite pick games_status_rank + a temp B-tree sort. Same write cost.
DROP INDEX IF EXISTS games_dir_seq;
CREATE INDEX games_status_seq ON games(status, dir_seq);
