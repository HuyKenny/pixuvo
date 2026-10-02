# Test report — 2026-10-02

All results below were produced on this date against the code in this repository. "Mock" = fixture data or a
test-mode build; "live" = the real production site or real partner feeds.

## Automated

| Suite | Result | What it covers |
|---|---|---|
| `pnpm check` (astro check, TS strict) | **0 errors, 0 warnings** (141 files) | whole repo incl. scripts and tests |
| `pnpm lint` (ESLint) | **clean** | incl. rule against `href="#"` |
| `pnpm test` (Vitest) | **53 / 53 passed** | see below |
| `pnpm test:e2e` (Playwright, desktop 1440 + mobile 390) | **31 / 31 passed** | see below |

Vitest — unit: text sanitising (scripts/HTML stripped, entities, surrogates), slugs, dedupe keys, controls parser;
taxonomy (unique slugs, parents, no brand categories, brand/sensitive detection); FTS query builder against hostile
input; filter parsing; Cloudflare Access JWT (valid, wrong aud/iss, expired, nbf, alg=none, unknown kid, forged
signature, foreign key); feed fetcher (allowlist incl. redirects, https only, retry 5xx/1015, no retry 404, size cap,
retry limit); adapters (GameMonetize parse/host checks, GamePix sid enforcement and next_url sid change); ads.txt format.
Vitest — integration (SQLite with the real migrations): **same feed twice = no duplicates and zero writes**;
**editorial overrides survive a provider change**, slug stable on rename; **feed outage → failed run, nothing removed,
checkpoint**; safety valve when 30 %+ of a feed vanishes; missing → grace → archive → reactivation; **write budget stop
and resume without duplicates**; dry run writes nothing; brand/sensitive titles held for review; unapproved provider
refused; cross-provider duplicate attached, ambiguous one queued; invalid records skipped. Catalog queries: search
ranking (exact > prefix), synonyms, hostile input, filter combinations, deterministic paging, landing intersections,
directory paging, game lookup (ok/redirect/gone/missing, path traversal), related excludes itself.

Playwright (test-mode build, fixture iframe instead of partner games — no ad impressions are generated):
homepage (games in first screen, canonical, no fake trends), category → card → detail, favorite button does not
navigate, no `href="#"`, crawlable pagination with per-page canonical and real 404 out of range, 301 for `/page/1/`,
real 404s, search without JS + noindex, autocomplete keyboard (↓, Enter), **filters: combine, count, pills, single
removal, Clear all, empty state, state restored after Back**, filter API validation, **Play loads only after click +
history**, **favorites persist after reload and can be removed**, play API refuses unknown game and cross-site origin,
rating + report flow, truthful JSON-LD (no aggregateRating), **admin UI and API refuse unauthenticated clients**
(no-store), cron requires secret, security headers on static and dynamic pages, robots/sitemaps/ads.txt, **consent:
nothing optional loads before a choice, reject keeps it off after reload, changing the choice later loads it**,
**no horizontal overflow at 360 / 390 / 1440 px** on 8 page types + a game page, two cards per row on mobile, mobile
menu, keyboard: skip link, visible focus, filter drawer focus + Esc returns focus.

## Live checks on production (https://pixuvo.com)

* `pnpm verify:launch` — **28 / 28 passed**: homepage, lang, canonical, CSP, static game page, dynamic pages,
  404s, trailing-slash redirect, robots (Cloudflare managed section + ours), sitemap index and games sitemap,
  ads.txt, admin and admin API redirected to Cloudflare Access login, cron 401, autocomplete, **http → https 301**,
  **www → apex 301 keeping path and query**, six legal pages.
* **Partner smoke test** (one Play press each, no clicks inside frames): GameMonetize `parking-space` and GamePix
  `drop-planets` both start inside the sandboxed iframe on pixuvo.com. GamePix shows its own consent notice;
  GameMonetize shows none (see LAUNCH-CHECKLIST.md).
* **Turnstile**: server-side verification live — missing token → 400, invalid token → 403 for both report and vote.
  A real solved challenge cannot be produced by a headless browser; please try one vote manually.
* **Lighthouse mobile** (same Worker and assets via the workers.dev mirror; SEO there is 69 only because the mirror is
  `noindex` on purpose):

  | Page | Perf | A11y | Best pr. | LCP | CLS | TBT | TTFB |
  |---|---|---|---|---|---|---|---|
  | `/` | 98 | 100 | 100 | 2.3 s | 0 | 0 ms | 60 ms |
  | `/racing-games/` | 98 | 100 | 100 | 2.3 s | 0 | 0 ms | 40 ms |
  | `/games/drop-planets/` | 99 | 100 | 100 | 1.7 s | 0 | 0 ms | 60 ms |
  | `/games/page/5/` (dynamic) | 100 | 97 → fixed* | 100 | 1.3 s | 0 | 0 ms | 180 ms |

  \* the one finding (links in text distinguishable by colour only) was fixed by underlining inline links.
  These are lab numbers of our pages before a game loads; partner games are not part of them.
* Worker CPU (first 63 real requests): p50 3.2 ms, p99 66 ms (cold isolates / large sitemap; sitemap files halved since).

## Importer — real data

| Primary provider | Games | Published | Held for review | Extra sources merged in |
|---|---|---|---|---|
| GameMonetize | 38 131 | 34 927 | 3 204 | 2 961 GamePix sources attached as second source |
| GamePix | 10 932 | 10 804 | 128 | — |
| **Total** | **49 063** | **45 731** | **3 332** | 52 023 sources |

Verified-playable on production: the two smoke-tested games above (one per partner). All other games use the same
embed format and permission check but were not started one by one.

## Screenshots (production, 2026-10-02)

`docs/screenshots/`: `desktop-home`, `desktop-category`, `desktop-filters`, `desktop-game`, `desktop-search`,
`desktop-categories`, `mobile-*` (390 px) and `mobile360-home`, `mobile360-game` — all `.webp`, horizontal overflow 0 px.

## Known gaps
* Turnstile human pass, real Access login (needs your inbox for the one-time PIN), and the cron chain
  (needs `GH_DISPATCH_TOKEN`) are not end-to-end tested.
* Lighthouse SEO on pixuvo.com itself not measured (local DNS on the Raspberry still cached the old record).
