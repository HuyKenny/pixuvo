-- GamePix property M7X08 had the domain saved as "https://pixuvocom"; the owner replaced it with
-- property 9O09X (https://pixuvo.com) on 2026-10-02. The sid is part of every GamePix embed URL.
UPDATE providers SET attribution = '{"sid":"9O09X"}',
  notes = replace(notes, 'sid M7X08', 'sid 9O09X'), updated_at = '2026-10-02T13:00:00Z'
WHERE id = 'gamepix';
UPDATE game_sources SET embed_url = replace(embed_url, 'sid=M7X08', 'sid=9O09X')
WHERE provider_id = 'gamepix' AND embed_url LIKE '%sid=M7X08%';
