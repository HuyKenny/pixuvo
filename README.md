# Pixuvo

**Find your next favorite game.** Free online games. No downloads. Just play.

Pixuvo (https://pixuvo.com) is an English browser-game portal that aggregates
games from licensed distribution partners (GameMonetize, GamePix) and
monetises through the partners' revenue share. It is an Astro site on
Cloudflare Workers + Static Assets with a D1 catalog.

| Doc | What is in it |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | data flow, rendering split, cache, how a change reaches the public site |
| [PROVIDERS.md](PROVIDERS.md) | every partner: documentation, permissions, attribution, status |
| [OPERATIONS.md](OPERATIONS.md) | daily sync, failures, restore, switching a partner off |
| [COSTS-AND-LIMITS.md](COSTS-AND-LIMITS.md) | verified limits, measured usage, capacity model |
| [LAUNCH-CHECKLIST.md](LAUNCH-CHECKLIST.md) | what is done and what still blocks a clean launch |
| [TEST-REPORT.md](TEST-REPORT.md) | what was tested, results, screenshots |
| [CREDENTIALS_REQUIRED.md](CREDENTIALS_REQUIRED.md) | access that is still missing (never values) |
| [TASKS.md](TASKS.md) | acceptance criteria and their state |

## Requirements

Node ≥ 22.12, pnpm 11 (`corepack enable`). Wrangler is a dev dependency.

## Local development (no production secrets needed)

```bash
pnpm install
cp .dev.vars.example .dev.vars          # ENVIRONMENT=local, admin bypass for local only
pnpm db:migrate:local                   # creates the local D1 (.wrangler/state)
pnpm import:games -- --target local --budget 2000000 --cache-dir ../../tmp/pixuvo/cache
#   (or a small sample: pnpm test:e2e:setup builds a fixture catalog)
pnpm exec tsx scripts/snapshot.ts --target local   # data for prerendered pages
pnpm build && pnpm preview              # http://localhost:8787  (production-like: Worker + assets + local D1)
pnpm dev                                # Astro dev server (http://localhost:4321)
```

The production build never falls back to demo data: without a snapshot the
build fails, and runtime pages read only D1.

## Commands

| Command | Does |
|---|---|
| `pnpm dev` / `pnpm preview` | dev server / production build served by wrangler with local D1 |
| `pnpm check` · `pnpm lint` · `pnpm test` | `astro check` (TS strict) · ESLint · Vitest unit + integration |
| `pnpm test:e2e:setup` · `pnpm test:e2e` | fixture catalog + test-mode build · Playwright (desktop + mobile) |
| `pnpm build` | Astro build + post-build guards (asset count ≤ 18 000, no snapshot in Worker bundle, no Images/KV bindings) |
| `pnpm db:migrate:local` · `pnpm db:migrate:remote` | D1 migrations (remote prints a Time Travel restore bookmark first) |
| `pnpm import:games -- --target remote --budget 90000` | import partner feeds into D1 (`--provider`, `--resume`, `--cache-dir`) |
| `pnpm import:dry-run -- --target remote` | the same, without writing; prints the plan and a row estimate |
| `pnpm catalog:publish -- --deploy` | snapshot → build → deploy (only if data or code changed) → live checks |
| `pnpm verify:free-tier` | real usage vs Workers/D1 free limits + query plans |
| `pnpm verify:launch` | live checks of https://pixuvo.com (read-only, never presses Play) |
| `pnpm deploy` | restore bookmark + migrations + forced publish |
| `tsx scripts/sql.ts --target remote "SELECT …"` | read-only SQL for operations |

## Configuration

* Worker vars live in `wrangler.jsonc`; secrets via `wrangler secret put` (`TURNSTILE_SECRET_KEY`,
  `CRON_SECRET`, `IP_HASH_SALT`, `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `GH_DISPATCH_TOKEN`).
* Offline scripts read `process.env`, then `~/ai/credentials/.pixuvo-credentials.env` (outside the repo).
* CI secrets: see `.github/workflows/sync.yml` and [CREDENTIALS_REQUIRED.md](CREDENTIALS_REQUIRED.md).
* Build-time public flags: `PUBLIC_TURNSTILE_SITE_KEY`, `PUBLIC_NOINDEX` (preview), `PUBLIC_CONSENT_CATEGORIES`,
  `PUBLIC_ADS_PROVIDER` (off by default).

## Deploy

`pnpm deploy` locally, or the **Sync and publish** GitHub workflow (daily via cron-job.org, on push to `main`,
or "Request sync" in the admin). Rollback: `wrangler rollback` to the previous Worker version — see OPERATIONS.md.
