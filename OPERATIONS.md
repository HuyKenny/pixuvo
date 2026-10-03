# Operations

## Daily sync

```
Worker Cron Trigger (daily 03:20 UTC, src/worker.ts) ──workflow_dispatch──► GitHub Actions "Sync and publish" (HuyKenny/pixuvo)
   (manual/external alternative: POST https://pixuvo.com/api/cron/sync/ with Authorization: Bearer <CRON_SECRET>,
    Content-Type: application/json, body {})
   test → restore bookmark → migrations → import (budget 90 000 rows) → metrics → publish (deploy only if changed) → free-tier report
```

* The endpoint refuses a second dispatch within 6 h and never runs the import itself.
* "Request sync now" in Admin → Imports does the same dispatch.
* The dispatch uses the fine-grained token `pixuvo-cron-dispatch` (Actions read/write on this repo only, Worker secret `GH_DISPATCH_TOKEN`).
* Why not cron-job.org: it would need the cron secret stored at a third party; the built-in Cron Trigger is free and keeps every secret inside Cloudflare.
* Measured cost of a sync run: see COSTS-AND-LIMITS.md. GitHub Actions minutes are shared with other repos (2 000/month).

### Manual runs (from `apps/pixuvo`)

```bash
pnpm import:dry-run -- --target remote                     # what would change, estimated rows
pnpm import:games -- --target remote --budget 90000        # real import (both providers)
pnpm import:games -- --target remote --provider gamepix --resume   # continue after budget stop / failure
pnpm exec tsx scripts/metrics.ts --target remote           # popular / trending / ranks
pnpm catalog:publish -- --deploy                           # snapshot → build → deploy if changed → live checks
pnpm verify:launch                                         # live checks (read-only)
pnpm verify:free-tier                                      # usage vs limits
```

## Reading an import run

Admin → Imports (or `SELECT * FROM import_runs ORDER BY id DESC`). Statuses:

| Status | Meaning | Action |
|---|---|---|
| `completed` + full feed ✓ | everything processed; missing-detection ran | none |
| `completed` without ✓ | resumed or partial feed; missing-detection skipped on purpose | none, next full run handles it |
| `budget_stopped` | write budget reached; checkpoint saved | next run continues (`--resume`) |
| `failed` | feed error, invalid response or safety valve | read `error`; nothing was removed |
| `aborted` | stale lock (> 3 h) cleared | none |

Safety rules built into the importer:
* A failing or incomplete feed never removes anything.
* If more than 30 % of a provider's active items vanish from a "complete" feed, the run fails instead of marking them.
* An item missing from a complete feed becomes `missing` (still playable) and is archived only after 7 days.
* Items that come back are reactivated automatically.
* Editorial overrides (title, description, instructions, categories, status) are never overwritten.

## Common tasks

| Task | How |
|---|---|
| Hide a game | Admin → Games → game → Status = hidden (bulk: select up to 50) |
| Fix a title/description | Admin → game → Editorial text (provider syncs keep it; "Remove" an override to go back) |
| Stop a broken source | Admin → game → Sources → Disable (immediate for new plays) |
| Merge duplicates | Admin → Duplicates (old URL redirects 301 to the kept game) |
| Add an SEO landing | Admin → SEO (2–3 categories; appears after next publish if ≥ min games) |
| Redirect an old URL | Admin → SEO → Game URL redirects |
| Handle a report | Admin → Reports → resolved / dismissed |
| Copyright notice | hide the game, resolve the report, reply from info@pixuvo.com, inform the partner |

## Switching a partner off safely

1. Admin → Providers → Publish = `disabled` (or Consent = `blocked`) → Save.
2. Effect: `/api/play/` refuses new starts at once; games with no other usable source become `hidden`
   (dynamic pages within ~1 min). Run `pnpm catalog:publish -- --deploy` (or Request sync) to refresh static pages.
3. Re-enable the same way; games hidden for this reason are restored automatically.

## Backups and restore

* Before every remote migration `scripts/db-backup.ts` prints and logs a **D1 Time Travel bookmark**
  (`~/ai/backups/pixuvo/bookmarks.log`; in CI it is in the job log). Time Travel keeps 30 days on Workers Paid.
* `wrangler d1 export` cannot export databases with FTS5 tables, so a full copy is
  `pnpm exec tsx scripts/db-backup.ts --dump` (paged JSONL of every real table to `~/ai/backups/pixuvo/<stamp>/`).
* Restore to a point in time:
  ```bash
  pnpm exec wrangler d1 time-travel restore pixuvo-production --bookmark <bookmark>   # or --timestamp <ISO>
  pnpm exec tsx scripts/rebuild-fts.ts --target remote   # only if the search index looks wrong afterwards
  pnpm catalog:publish -- --deploy --force
  ```
* Migrations are additive; a destructive change must ship in two steps (new column/table → code → cleanup) so the
  previous Worker version keeps working during rollback.

## Rollback of a deploy

```bash
pnpm exec wrangler deployments list -c dist/server/wrangler.json
pnpm exec wrangler rollback <version-id> -c dist/server/wrangler.json
```
Static assets roll back together with the Worker version. D1 is not rolled back by this — use Time Travel if data
must go back too.

## Errors and logs

* Worker logs: Cloudflare dashboard → Workers → pixuvo → Observability (enabled, no secrets or IPs are logged).
* `pnpm exec wrangler tail -c dist/server/wrangler.json` for live tail.
* Common failures: `D1_ERROR` (check migrations), 503 on vote/report (Turnstile or rate limiter not configured),
  503 on admin (Access not configured), 401 on cron (secret mismatch).

## Translations (UI only)

```bash
pnpm exec tsx scripts/i18n-check.ts                                 # validate UI translation files
pnpm exec tsx scripts/i18n-audit.ts [--base http://localhost:8799]  # English left on localised pages
pnpm exec tsx scripts/i18n-export.ts                                # English source for translators (tmp/i18n/)
```
* A new UI string: add it to `src/i18n/messages/en.ts`, then add it to every `messages/<code>.json`
  (the check fails until all languages have it). Write it natively, not word for word.
* Game descriptions are not translated (owner decision 2026-10-03). `scripts/translate.ts` and the D1 `pixuvo-i18n`
  (13 191 translations of 600 games from the first run, ≈ $2.10) are kept but unused — nothing reads them.
