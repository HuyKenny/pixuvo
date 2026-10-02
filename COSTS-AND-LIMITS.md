# Costs and limits

## Plan reality

The Cloudflare account already runs **Workers Paid** (plus R2 Paid) for other projects. Pixuvo is built to stay
inside the **Free** limits anyway, so it would keep working on a free account. Nothing new was bought or switched on.

## Verified limits (Cloudflare docs, checked 2026-10-01/02)

| Resource | Free | Paid (current account) |
|---|---|---|
| Worker requests | 100 000 / day (account-wide) | 10 M / month included |
| Worker CPU per invocation | 10 ms | 30 s default |
| Static Assets files per version | 20 000 | 100 000 |
| Static asset requests | free, unlimited, no Worker invocation | same |
| D1 database size | 500 MB | 10 GB |
| D1 storage per account | 5 GB | 1 TB |
| D1 rows read | 5 M / day | 25 B / month included |
| D1 rows written | 100 k / day | 50 M / month included |
| D1 bound parameters per query | 100 | 100 |
| D1 queries per Worker invocation | 50 | 1 000 |

Sources: developers.cloudflare.com/workers/platform/limits, /workers/static-assets/billing-and-limitations,
/d1/platform/limits, /d1/platform/pricing.

## Measured (2026-10-02)

| Item | Value |
|---|---|
| D1 `pixuvo-production` size | **92.6 MB** with 49 063 games, 52 023 sources, FTS index (limit 500 MB) |
| First catalog fill | **1.14 M rows written** in 3 runs (GameMonetize 971 k, GamePix 28.7 k + 139.5 k) — ~25 rows per new game incl. indexes and FTS |
| Daily sync without changes (measured dry run) | 0 rows written (unchanged items skipped by hash); **~650 k rows read** (state load: 336 k GameMonetize + 312 k GamePix) — 13 % of a free day |
| Daily write budget | 90 000 rows; the importer stops before it and resumes next day |
| Snapshot export for a publish | 62 k rows read, 15 s |
| Static files per build | 3 120 (3 098 HTML) — stop at 18 000 |
| Worker bundle | 0.82 MB (snapshot never bundled) |
| Worker CPU (first real traffic, 63 requests) | p50 **3.2 ms**, p99 **66 ms** |
| Lighthouse mobile (same Worker via workers.dev) | Performance 98–100, Accessibility 97–100, Best practices 100; LCP 1.3–2.3 s, CLS 0, TBT 0 ms, TTFB 40–180 ms |

CPU p99 above 10 ms came from heavy routes on cold isolates (sitemap with 10 000 URLs, first requests after
deploy). Sitemap files were cut to 5 000 URLs. On a Free account such requests could hit error 1102; on the
current Paid account they cannot. Re-measure with `pnpm verify:free-tier` after real traffic.

## Account-wide usage — not Pixuvo, but it matters

`verify:free-tier` measures the whole account. On 2026-10-01/02:

| Database | Rows read / day |
|---|---|
| hlidamo | ~1.24 B |
| pokector-production | ~0.8–1.2 B |
| pixuvo-production | 1.9 M (first import day) |

≈ 2.4 B rows read per day is ~72 B per month against 25 B included in Workers Paid. At $0.001 per million rows that
is **about $47/month of overage**, caused by hlidamo and pokector. The same account also served ~115 k Worker
requests in 24 h (above the free 100 k). These projects would not fit a Free account.

## Capacity model for Pixuvo (no visitor guarantee)

* Static HTML (homepage, categories page 1, top ~3 000 games, info pages) and all assets: **0 Worker requests.**
* Typical dynamic requests per visit: 1 `/api/play/` per game started (1 D1 write), autocomplete calls (≤ 1 per
  180 ms typing pause, cached 5 min at the edge), on-demand game/category pages (cached 10 min per data version).
* On Free limits the binding constraints would be Worker requests (100 k/day account-wide, shared with every other
  Worker) and D1 writes (100 k/day): each Play click writes one aggregated row.
* D1 size grows ~1.9 KB per game; 500 MB fits roughly 200 000+ games with current indexes.

## GitHub Actions

Minutes are shared across the HuyKenny repos (2 000/month). Expected: daily sync ≈ 6–8 min (GameMonetize paging
with 8 s pauses ≈ 3 min, build ≈ 2 min), CI per push ≈ 5 min.
