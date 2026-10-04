# Architecture

## Overview

```
 partner feeds ──► importer (Node, CI/locally) ──► D1 (catalog) ──► snapshot.json ──► astro build ──► Static Assets
 (GameMonetize,      fetch → validate → normalise       │                                            (prerendered HTML)
  GamePix)           → dedupe → categorise → store      │
                                                         └──────────► Worker (SSR + API) ◄── visitors
```

* **Stack:** Astro 7.3 (TypeScript strict) + `@astrojs/cloudflare` 14.3 on Cloudflare Workers with Static
  Assets, D1 for the catalog and operational data. No KV, no R2, no Images binding, no Astro sessions
  (`session: false`; `imageService: { build: 'compile', runtime: 'passthrough' }` — verified in the generated
  `dist/server/wrangler.json` by `scripts/postbuild.ts`).
* **Client JS:** small vanilla-TS islands (search autocomplete, filters, favorites/history, player,
  consent). No SPA framework.

## Rendering split (deliberate)

| Route | Rendering | Source |
|---|---|---|
| `/`, `/categories/`, info + legal pages | prerendered | snapshot |
| `/{category}-games/` page 1, SEO landings | prerendered | snapshot |
| `/games/{slug}/` for the top-ranked ~3 000 games | prerendered | snapshot |
| `/games/{slug}/` for everything else | on demand (`games/[...path].astro`) | D1 |
| `/{category}-games/page/N/`, `/games/`, `/games/page/N/`, `/new-games/` | on demand | D1 |
| `/popular-games/`, `/trending-games/` | on demand, `noindex` until real data exists | D1 (`site_settings` lists) |
| `/search/`, `/favorites/`, `/recently-played/` | on demand / prerendered shell, all `noindex` | D1 / browser storage |
| `/sitemap.xml`, `/sitemaps/*.xml` | on demand, cached 1 h | D1 |
| `/api/*`, `/admin/*` | on demand | D1 |

Prerendered dynamic routes fall through to the on-demand route when a slug was not prerendered (verified with
the adapter: static file first, Worker only on a miss). Static files never invoke the Worker — there is no
`run_worker_first` and the Astro middleware runs only for on-demand routes. The asset count is guarded at
18 000 per build (free limit 20 000).

The snapshot (`src/data/snapshot/*.json`) is imported **only** by prerendered pages; the post-build guard fails
the build if it ends up in the Worker bundle (bundle today ≈ 0.8 MB).

## Data model (D1)

`migrations/0001_init.sql` — games, providers, game_sources, developers, categories, game_categories, tags,
game_tags, game_aliases, slug_redirects, editorial_overrides, duplicate_candidates, seo_landings, import_runs,
reports, ratings, aggregate_metrics, site_settings, admin_audit_log, `games_fts` (FTS5).

Decisions:
* **Provider vs. Pixuvo data:** `game_sources` keeps each partner record (embed URL, restrictions, labels, hash);
  `games` is the merged Pixuvo record. Editorial changes live in `editorial_overrides` (field level) and win on
  every sync.
* **Two dates:** `source_release_date` (what the partner says) ≠ `added_at` (when Pixuvo imported it).
* **Unknown stays NULL** for device, players, multiplayer mode, style, language, age. `controls_inferred` is a
  deterministic parse of the partner's own instructions and is labelled as such in the UI.
* **Popular/trending lists** are precomputed into `site_settings` instead of extra indexes on `games` (each index
  costs a written row per update).
* `game_categories` denormalises `published` and `rank_score` so a category page reads ~48 index rows.
* Developers table exists but partners currently provide no developer field, so it stays empty rather than
  being guessed from tags.

## Import pipeline (`scripts/import/`)

fetch (allowlisted hosts incl. redirects, timeout, size cap, retry with backoff, rate limit — GameMonetize
answers Cloudflare 1015 to bursts) → zod-free hand validation per field → normalisation (HTML → plain text,
slug, attributes) → **dedupe** → taxonomy mapping (`src/lib/taxonomy.ts`, shared with the site) → hash diff →
batched writes (≤ 100 params/statement) with a **row budget** measured from D1 meta → checkpoint per page →
missing detection only after a complete feed in one run, with a 30 % safety valve and a 7-day grace period →
`data_version` bump and category counts.

Dedupe: only cross-provider, exact normalised title, and either near-identical description (trigram Jaccard ≥ 0.5)
or a distinctive title that is unique in the catalog backed by topical overlap/aspect ratio. Anything less goes to
`duplicate_candidates` for the admin queue. Merges keep all sources and 301 the old slug.

Brand/IP titles (Minecraft, Mario, …) and adult/gambling wording go to `pending_review` instead of being published.

## How a change reaches the public site

1. Importer or admin writes D1 and bumps `site_settings.data_version`.
2. On-demand pages and APIs: the edge cache key contains `data_version` (memoised 60 s per isolate) **and** the
   build id, so they reflect changes within ~1 minute and never serve HTML from a previous build.
3. Static pages: `catalog:publish` exports a new snapshot, rebuilds, deploys (only when `data_version` or the git
   sha differ from `published_version`/`published_sha`), records the published version and runs live checks.
   The admin dashboard shows "changes waiting for the next publish".
4. Sitemaps are generated from D1 on request (cached 1 h) and contain only published, canonical URLs.

**Revoking a game or provider** takes effect immediately for new plays: the Play button calls
`POST /api/play/`, which checks the game status, source status, provider publish status, consent mode, country and
device restrictions on every start. Stale static HTML therefore cannot start a revoked game.

## Cache

`caches.default` inside the Worker for public GET routes only (`/api/play|rate|report|cron|admin` and `/admin` are
never cached). Key = fixed host `pixuvo.com` + path + whitelisted, normalised parameters + data version + build id;
unknown query parameters are ignored; values longer than 40 chars skip the cache. Responses with `Set-Cookie` or a
non-200 status are not stored. The cache saves D1 reads and CPU; it does not reduce Worker requests.

## Security

Parameterised SQL everywhere; partner HTML is reduced to plain text and rendered escaped; FTS input is rebuilt from
normalised tokens (no user operators reach `MATCH`). Same-origin checks on all POST endpoints (plus Astro's origin
check). Admin: Cloudflare Access in front of `/admin` and `/api/admin`, and the Worker independently verifies the
Access JWT (RS256 signature against the team JWKS, issuer, audience, expiry, nbf); without configuration it fails
closed. Public writes (votes, reports) need Turnstile and the Workers rate-limit binding — without them production
refuses the write. CSP allows only the partner frame and image hosts and Turnstile; `frame-ancestors 'none'`.
The partner iframe is sandboxed (`allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox
allow-forms allow-pointer-lock allow-orientation-lock`, no top navigation) — verified to work with both partners.

## Languages (i18n, 2026-10-03)

23 languages: English at the root, the others under `/{code}/` — es fr pt de it nl pl cs sk hu ro uk ru tr ar
(right-to-left) id vi th ja ko zh-hans zh-hant. Slugs stay English, so every page maps 1:1 between languages.

* **Strings:** `src/i18n/messages/en.ts` is the key source (≈ 620 keys incl. category, theme and landing texts);
  `messages/<code>.json` hold the translations, `src/i18n/docs/<code>.json` the info/legal pages
  (privacy/terms/copyright show "English version is legally binding"). `scripts/i18n-check.ts` (also a unit test)
  fails on missing keys, wrong plural forms (Intl.PluralRules) or changed placeholders/HTML.
  Components call `await useI18n(Astro)` — the language comes from the URL. Browser scripts read only the `c.*`/`theme.*`
  keys embedded in `<script id="i18n">`.
* **Links:** components keep writing `/games/x/`; the middleware (also during prerendering) rewrites internal links of
  non-English pages to `/{code}/…` (`src/i18n/links.ts`). The language switcher is exempt (`data-keep-href`).
* **Routes:** `src/pages/[lang]/…` mirror the English routes and reuse the same views (`src/views/*`). Prerendered per
  language: home, categories, category page 1 + landings, info pages, favorites/recent shells. Game pages and page 2+
  are on demand.
* **Detection:** only `/` runs the Worker first (`assets.run_worker_first: ["/"]`, custom entry `src/worker.ts`):
  cookie `pixuvo_lang` → `Accept-Language` → Cloudflare country → English; bots always get English; 302 with
  `Vary: Accept-Language, Cookie`. Deep pages never redirect — a bar offers the visitor's language (`LangOffer`).
* **SEO:** hreflang for all languages + x-default on listing/info pages. Sitemaps: `{code}-pages` and
  `{code}-categories` (with xhtml alternates); game sitemaps are English only.
* **Game pages:** partner descriptions are English and are **not translated** (owner decision 2026-10-03). A localised
  game page shows a short native intro built from facts (`game.intro*`: category, players, devices, controls) plus
  the localised controls/FAQ, and is `noindex, follow` (templated text would be 22 thin duplicates).
* **Category phrases:** `catn.<slug>` is the short label (chips, menus), `catg.<slug>` the whole "… games" phrase
  ("Závodní hry", "Rennspiele"). Templates take `{games}` (heading form) or `{gamesLc}` (mid-sentence form) so no
  language has to inflect a bare adjective. `i18n.catGames(slug)` returns both.
* **Native quality:** every language was reviewed by a native-copywriter pass (address form, local search phrases,
  punctuation). `scripts/i18n-audit.ts` crawls the localised pages and lists English words left outside game titles.
* **Search:** game titles stay English; category names are matched in every language (suggest + search page),
  e.g. "závod" → Racing games.

## SEO structure (audit 2026-10-03)

* **Crawl paths:** every game is reachable by links — category pages go to the last page (guard 1 000), the pager links
  ±3, nearby tens and every 100th page (`src/lib/pager.ts`), and each game page links the next games of its primary
  category by id (`neighborGames`, a chain through the whole category). `/games/` is an A–Z directory with keyset pages
  (`dir_bounds` = (title_norm, id) every 42nd game, migration 0007).
* **Long-form content:** `src/i18n/content/<lang>.json` (home block, 64 categories, 17 landings: intro + FAQ), written
  natively per language; loaded only by prerendered views (`CategoryLandingView`, `HomeView`), never in the Worker
  (postbuild guard). Rendered by `CategoryContent.astro` (About / Types of / FAQ) under the grid on page 1.
* **Landings** (`seo_landings`): category intersection (`all`), union (`any`), themes, tags or the whole catalog
  (`top`); migration 0008 added kids, girls, boys, brain, stickman, unblocked, animal, princess, space, christmas,
  halloween. Curated cross-links in `taxonomy.ts` `RELATED`.
* **Hero games** (`data/hero-games.csv`, 280 games whose own title has real search demand): `games.search_volume` feeds
  `rank_score`; Pixuvo's own text per language in `game_editorial` (migration 0009, source `data/editorial/<lang>.json`,
  loaded by `scripts/editorial-import.ts`). It replaces the partner blurb; a localised game page with it is indexable,
  has hreflang between the languages that have it and is listed in `{lang}-games-1.xml`.
* **No templated FAQ/FAQPage** on game pages; `aggregateRating` only from ≥ 5 real votes. No canonical on noindex pages.
* Redirects outside the Worker: zone rules 301 for missing trailing slash and for uppercase paths.
