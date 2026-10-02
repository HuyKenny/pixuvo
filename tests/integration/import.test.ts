import { describe, expect, it } from 'vitest';
import { runImport } from '../../scripts/import/pipeline.ts';
import { gamemonetize } from '../../scripts/import/adapters/gamemonetize.ts';
import { gamepix } from '../../scripts/import/adapters/gamepix.ts';
import { GM_CONFIG, freshDb, gmFeed, gmItem } from '../helpers.ts';

const cfg = { ...GM_CONFIG, GAMEMONETIZE_PAGE_SIZE: '3' };
const run = (db: ReturnType<typeof freshDb>, fetchJson: (u: string) => Promise<unknown>, extra: Partial<Parameters<typeof runImport>[2]> = {}) =>
  runImport(db, gamemonetize, { dryRun: false, budgetRows: 1_000_000, config: cfg, fetchJson, minCompleteItems: 1, ...extra });

const count = async (db: ReturnType<typeof freshDb>, sql: string, p: Array<string | number> = []) => Number(Object.values((await db.all<Record<string, number>>(sql, p)).rows[0]!)[0]);

describe('import pipeline', () => {
  it('is idempotent: the same feed twice creates no duplicates and writes nothing the second time', async () => {
    const db = freshDb();
    const feed = gmFeed([[gmItem(1), gmItem(2), gmItem(3)], [gmItem(4)]]);
    const a = await run(db, feed);
    expect(a.status).toBe('completed');
    expect(a.inserted).toBe(4);
    expect(a.completeFeed).toBe(true);
    const b = await run(db, feed);
    expect(b.inserted).toBe(0);
    expect(b.updated).toBe(0);
    expect(b.unchanged).toBe(4);
    expect(b.changed).toBe(false);
    expect(await count(db, 'SELECT count(*) FROM games')).toBe(4);
    expect(await count(db, 'SELECT count(*) FROM game_sources')).toBe(4);
    expect(await count(db, "SELECT count(*) FROM games_fts WHERE games_fts MATCH 'test'")).toBe(4);
  });

  it('keeps editorial overrides when the provider changes the record', async () => {
    const db = freshDb();
    await run(db, gmFeed([[gmItem(1)]]));
    const [{ id }] = (await db.all<{ id: number }>('SELECT id FROM games')).rows as [{ id: number }];
    await db.batch([
      { sql: "UPDATE games SET title = 'Editor Title' WHERE id = ?", params: [id] },
      { sql: "INSERT INTO editorial_overrides (game_id, field, value, updated_by, updated_at) VALUES (?, 'title', 'Editor Title', 'test', 'now')", params: [id] },
    ]);
    const r = await run(db, gmFeed([[gmItem(1, { title: 'Provider Renamed', description: 'A totally new provider description.' })]]));
    expect(r.updated).toBe(1);
    const g = (await db.all<{ title: string; description: string; slug: string }>('SELECT title, description, slug FROM games WHERE id = ?', [id])).rows[0]!;
    expect(g.title).toBe('Editor Title');
    expect(g.description).toBe('A totally new provider description.');
    expect(g.slug).toBe('test-game-1'); // slug never changes on rename
  });

  it('a failing feed does not remove anything and records a failed run with checkpoint', async () => {
    const db = freshDb();
    await run(db, gmFeed([[gmItem(1), gmItem(2), gmItem(3)], [gmItem(4)]]));
    const r = await run(db, gmFeed([[gmItem(1), gmItem(2), gmItem(3)], [gmItem(4)]], { failOnPage: 2 }));
    expect(r.status).toBe('failed');
    expect(r.completeFeed).toBe(false);
    expect(r.markedMissing).toBe(0);
    expect(r.checkpoint).toEqual({ page: 1 });
    expect(await count(db, "SELECT count(*) FROM games WHERE status = 'published'")).toBe(4);
    expect(await count(db, "SELECT count(*) FROM import_runs WHERE status = 'failed'")).toBe(1);
  });

  it('refuses missing-detection when a large share of the feed disappears', async () => {
    const db = freshDb();
    await run(db, gmFeed([[gmItem(1), gmItem(2), gmItem(3)], [gmItem(4), gmItem(5)]]));
    const r = await run(db, gmFeed([[gmItem(1)]]));
    expect(r.status).toBe('failed');
    expect(r.error).toMatch(/refusing missing-detection/);
    expect(await count(db, "SELECT count(*) FROM game_sources WHERE status = 'active'")).toBe(5);
  });

  it('marks an item missing, keeps it playable during the grace period, then archives it', async () => {
    const db = freshDb();
    const all = [gmItem(1), gmItem(2), gmItem(3), gmItem(4), gmItem(5), gmItem(6), gmItem(7)];
    await run(db, gmFeed([all.slice(0, 3), all.slice(3, 6), all.slice(6)]));
    const without7 = gmFeed([all.slice(0, 3), all.slice(3, 6), []]);
    const r1 = await run(db, without7, { now: new Date('2030-01-01T00:00:00Z') });
    expect(r1.markedMissing).toBe(1);
    expect(await count(db, "SELECT count(*) FROM games WHERE status = 'published'")).toBe(7);
    const r2 = await run(db, without7, { now: new Date('2030-01-10T00:00:00Z'), graceDays: 7 });
    expect(r2.archived).toBe(1);
    expect(await count(db, "SELECT count(*) FROM games WHERE status = 'archived'")).toBe(1);
    expect(await count(db, "SELECT count(*) FROM game_categories WHERE published = 0")).toBeGreaterThan(0);
    // Coming back reactivates it.
    const r3 = await run(db, gmFeed([all.slice(0, 3), all.slice(3, 6), all.slice(6)]), { now: new Date('2030-01-11T00:00:00Z') });
    expect(r3.reactivated).toBe(1);
    expect(await count(db, "SELECT count(*) FROM game_sources WHERE status = 'active'")).toBe(7);
    expect(await count(db, "SELECT count(*) FROM games WHERE status = 'published'")).toBe(7);
  });

  it('stops before exceeding the write budget and resumes without duplicates', async () => {
    const db = freshDb();
    const pages = [[gmItem(1), gmItem(2), gmItem(3)], [gmItem(4), gmItem(5), gmItem(6)], [gmItem(7)]];
    const r1 = await run(db, gmFeed(pages), { budgetRows: 150 });
    expect(r1.status).toBe('budget_stopped');
    expect(r1.checkpoint).not.toBeNull();
    const done = await count(db, 'SELECT count(*) FROM games');
    expect(done).toBeGreaterThan(0);
    expect(done).toBeLessThan(7);
    const r2 = await run(db, gmFeed(pages), { resume: true });
    expect(r2.status).toBe('completed');
    expect(await count(db, 'SELECT count(*) FROM games')).toBe(7);
    expect(await count(db, 'SELECT count(*) FROM (SELECT provider_game_id FROM game_sources GROUP BY 1 HAVING count(*) > 1)')).toBe(0);
  });

  it('dry run writes nothing', async () => {
    const db = freshDb();
    const r = await run(db, gmFeed([[gmItem(1), gmItem(2)]]), { dryRun: true });
    expect(r.status).toBe('dry_run');
    expect(r.inserted).toBe(2);
    expect(await count(db, 'SELECT count(*) FROM games')).toBe(0);
    expect(await count(db, 'SELECT count(*) FROM import_runs')).toBe(0);
  });

  it('holds brand-name titles and sensitive titles for review instead of publishing', async () => {
    const db = freshDb();
    await run(db, gmFeed([[gmItem(1, { title: 'Minecraft Block Run' }), gmItem(2, { title: 'Casino Royale Slots' }), gmItem(3, { tags: 'minecraft, car' })]]));
    const rows = (await db.all<{ title: string; status: string; review_reason: string | null }>('SELECT title, status, review_reason FROM games ORDER BY id')).rows;
    expect(rows[0]).toMatchObject({ status: 'pending_review' });
    expect(rows[0]!.review_reason).toMatch(/^brand_ip/);
    expect(rows[1]!.review_reason).toMatch(/^sensitive/);
    expect(rows[2]!.status).toBe('published'); // brand only in tags: tag dropped, game published
    expect(await count(db, "SELECT count(*) FROM tags WHERE slug = 'minecraft'")).toBe(0);
  });

  it('refuses to import from a provider that is not approved for publishing', async () => {
    const db = freshDb();
    await db.batch([{ sql: "UPDATE providers SET publish_status = 'pending' WHERE id = 'gamemonetize'" }]);
    await expect(run(db, gmFeed([[gmItem(1)]]))).rejects.toThrow(/refusing to import/);
  });

  it('attaches a clear cross-provider duplicate as a second source, queues an unclear one', async () => {
    const db = freshDb();
    await run(db, gmFeed([[gmItem(1, { title: 'Neon Turbo Racer', description: 'Race neon cars through glowing city tracks, collect boosts and beat rivals.' }), gmItem(2, { title: 'Snake' })]]));
    const gp = (items: unknown[]) => async () => ({ items, next_url: null });
    const gpItem = (id: string, title: string, description: string) => ({
      id, title, namespace: id.toLowerCase(), description, category: 'racing', orientation: 'landscape', quality_score: 0.7, width: 800, height: 600,
      date_published: 'Wed, 12 Nov 2025 12:34:52 GMT', banner_image: `https://img.gamepix.com/games/${id}/cover.png?w=320`, image: `https://img.gamepix.com/games/${id}/icon.png`,
      url: `https://play.gamepix.com/${id.toLowerCase()}/embed?sid=M7X08`,
    });
    const r = await runImport(db, gamepix, {
      dryRun: false, budgetRows: 1e6, config: cfg, minCompleteItems: 1,
      fetchJson: gp([gpItem('A1', 'Neon Turbo Racer', 'Drive glowing neon cars in city tracks, grab boosts, beat your rivals to win.'), gpItem('B2', 'Snake', 'Classic snake.')]),
    });
    expect(r.attached).toBe(1);
    expect(await count(db, 'SELECT count(*) FROM game_sources WHERE game_id = (SELECT id FROM games WHERE slug = ?)', ['neon-turbo-racer'])).toBe(2);
    // "Snake" is not a distinctive title → separate game + review queue.
    expect(await count(db, "SELECT count(*) FROM games WHERE title = 'Snake'")).toBe(2);
    expect(await count(db, "SELECT count(*) FROM duplicate_candidates WHERE status = 'open'")).toBeGreaterThanOrEqual(1);
  });

  it('rejects invalid partner records without stopping the run', async () => {
    const db = freshDb();
    const r = await run(db, gmFeed([[gmItem(1), gmItem(2, { url: 'https://evil.example.com/x/' }), { id: 'abc' }, gmItem(4, { thumb: 'http://img.gamemonetize.com/x.jpg' })]]));
    expect(r.inserted).toBe(1);
    expect(r.itemsInvalid).toBe(3);
  });
});
