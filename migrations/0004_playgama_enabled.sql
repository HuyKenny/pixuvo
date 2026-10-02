-- Playgama: catalogue export + clid verified in the partner dashboard on 2026-10-02.
-- Live test from an EU IP: the embed shows Google's certified consent dialog (Funding Choices) before ads.
UPDATE providers SET
  catalog_status = 'available',
  publish_status = 'approved',
  monetize_status = 'pending',
  consent_mode = 'partner_handles',
  attribution = '{"clid":"p_32f1a219-f53f-4b7c-ba4c-b2715b71d41a"}',
  notes = 'Partner account active. Catalogue via POST https://playgama.com/api/v1/partner/export/catalogue/games (the dashboard''s "Download all Games"). Every embed is https://playgama.com/export/game/<slug>?clid=<our clid>. 17 games that live on their own domains are skipped. Revenue shows in widgets.playgama.com → Games.',
  verified_at = '2026-10-02T12:00:00Z',
  updated_at = '2026-10-02T12:00:00Z'
WHERE id = 'playgama';
