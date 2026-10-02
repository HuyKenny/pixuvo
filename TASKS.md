# Tasks and acceptance criteria

Legend: ✅ implemented + tested · 🟡 implemented, partly verified · ⛔ blocked externally · ➖ out of V1 scope

## Product & pages
- ✅ Pages: `/`, `/games/`, `/categories/`, `/new-games/`, `/popular-games/`, `/trending-games/`, `/favorites/`,
  `/recently-played/`, `/search/`, `/games/[slug]/`, `/[category]-games/`, 6 SEO landings, `/about/`, `/contact/`,
  `/privacy/`, `/cookies/`, `/terms/`, `/copyright/`, 404, admin. Consistent trailing slash (redirects).
- ✅ Header: logo, big search, Categories, New, Popular, 2 Player, Multiplayer, Favorites; mobile drawer.
- ✅ Homepage without big hero; games visible in the first screen (e2e checks y < 500 px).
- ✅ Popular/Trending only from real play data with a documented formula; cold start shows "Featured games", noindex.
- ✅ Cards link to real detail pages; Favorite button does not navigate (e2e).
- ✅ No `href="#"` (e2e + lint rule).

## Catalog, import, data
- ✅ GameMonetize + GamePix adapters (live feeds), Playgama/GameDistribution/Famobi inactive with reasons.
- ✅ Pipeline with paging, timeout, size cap, allowlist, retry/backoff, rate limit, checkpoint, dry run, resume (tests).
- ✅ Idempotent on provider_id + provider_game_id; hash change detection; overrides survive (tests).
- ✅ Outage/incomplete feed never deletes; safety valve; grace period + archive (tests).
- ✅ Write budget with stop + resume (tests; production first fill 1.14 M rows in 3 runs).
- ✅ Dedupe: multi-signal auto-merge cross-provider (2 961 merged), rest to admin queue; merges 301 old slugs.
- ✅ Migrations for all required tables (+ FTS5), indexes from real query plans (`verify:free-tier`).
- 🟡 Daily scheduled sync: workflow + cron endpoint done; ⛔ waits for `GH_DISPATCH_TOKEN` + cron-job.org job.
- ⛔ Playgama import (needs export + clid).

## Filters, search, recommendations
- ✅ Taxonomy of 64 categories (genres, subgenres, modes); pages only with ≥ 12 games; no brand categories.
- ✅ Filters: genre (page), device, players, local/online, controls (labelled as from instructions), 2D/3D/pixel, sort;
  fragment state, pills, Clear all, count, empty state, Back restores state (e2e).
- ✅ FTS5 search with exact > prefix > relevance ranking, synonyms, sanitised input (tests).
- ✅ Autocomplete: debounce, min length, limit, abort, keyboard, live region; search works without JS (e2e).
- ✅ Related games exclude the game itself, open duplicate candidates and unpublished games.

## Game page & play
- ✅ Breadcrumb, H1, stage, Play, Fullscreen (expanded fallback), Favorite, Share, Report, facts, description,
  instructions, related.
- ✅ Iframe only after Play; `/api/play/` checks permission each time (revocation works on stale HTML).
- ✅ Source pinned per session; country/device restrictions honoured; iframe removed on leave.
- ✅ Live production smoke test for both partners (no clicks inside frames).

## Admin
- ✅ Games (status, bulk ≤ 50, editorial text, categories, overrides, sources, primary source), providers (3 permission
  states + consent), imports (runs, request sync), duplicates (merge/reject), categories/tags, SEO landings, redirects,
  reports, settings (configured/missing, never values), audit log.
- ✅ Cloudflare Access + server-side JWT verification; closed without config; local bypass only in local/test (tests).

## Monetization, consent, legal
- ✅ Partner attribution (GamePix sid enforced, GameMonetize domain/ads.txt); ads.txt only from partner instructions.
- ✅ Own ads component, off by default; consent layer with reject/change; nothing optional loads before a choice (e2e).
- ⚠️ GameMonetize has no consent flow inside its frame — published by owner decision (LAUNCH-CHECKLIST.md).
- ⛔ Monetization verification in partner dashboards; GamePix ads.txt original file.
- ✅ Legal pages with real operator data (drafts for legal review).

## Performance, security, ops
- ✅ Static vs dynamic split, Cache API keyed by data version + build id, no Worker for static files.
- ✅ CSP and security headers on static and dynamic responses; XSS-safe rendering; parameterised SQL.
- ✅ Turnstile (server-side verification verified live) + rate limits; fail closed without protection.
- ✅ Lighthouse mobile 97–100 (perf/a11y/best practices).
- ✅ CI (checks/tests/e2e/build guards, no deploy from PRs) + Sync and publish workflow.
- ✅ Backups (Time Travel bookmark, JSONL dump), restore and rollback documented.

## Out of V1
- ➖ Accounts, chat, comments, own multiplayer, payments, virtual currency, cloud saves.
