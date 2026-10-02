-- Daily report cap per visitor (api/report.ts) looked up voter_hash with a full scan.
CREATE INDEX IF NOT EXISTS reports_voter ON reports(voter_hash, created_at);
