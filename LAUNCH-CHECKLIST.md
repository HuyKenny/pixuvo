# Launch checklist

State: 2026-10-02. ✅ done and verified · ⚠️ done with a known caveat · ⛔ external blocker (needs the owner).

## Site and infrastructure
- ✅ pixuvo.com served by the `pixuvo` Worker (custom domain); WEDOS placeholder A/AAAA records for the apex removed
  (backup: `~/ai/backups/pixuvo/dns-before-switch-2026-10-02.json`).
- ✅ `www.pixuvo.com` → 301 → `https://pixuvo.com/…` (zone Redirect Rule, keeps path and query).
- ✅ HTTP → HTTPS (Always Use HTTPS on). TLS ≥ 1.2, SSL strict, HSTS includeSubDomains, DMARC p=reject.
- ✅ Zone hardening 2026-10-02: WEDOS wildcard/www records removed, WAF (scanners, non-GET, empty UA), rate limit /api + /search
  (details `~/ai/reports/pixuvo/audit-2026-10-02.md`).
- ⛔ DNSSEC: signed in Cloudflare (pending) — owner adds DS `2371 13 2 BEB31179…018E` in the WEDOS panel.
- ✅ workers.dev mirror sends `X-Robots-Tag: noindex` for static and dynamic responses.
- ✅ D1 `pixuvo-production` with migrations 0001–0003; Time Travel bookmark recorded before migrations.
- ✅ Worker secrets: Turnstile, cron secret, IP-hash salt, Access team/audience. Rate-limit bindings active.
- ✅ Admin behind Cloudflare Access (`/admin`, `/api/admin`, allow h@huy.cz and huy.kenny@gmail.com) + JWT check in code.
- ✅ info@pixuvo.com → h@huy.cz (Cloudflare Email Routing, MX/SPF/DKIM records created).
- ✅ `verify:launch` 28/28 on production.
- ✅ Daily sync: Worker Cron Trigger 03:20 UTC → GitHub workflow (fine-grained token, Actions on this repo only); first dispatched run 2026-10-02.

## Catalog and partners
- ✅ 44 011 published games after the editorial pass on 2026-10-02 (2 052 duplicates merged with 301 redirects, 286 false
  "adult" tag holds published); 3 018 still held on purpose: third-party brand titles (2 787) and gambling/kissing wording.
- ✅ Live smoke test on production: GameMonetize and GamePix games start inside the sandboxed frame. Since 2026-10-02 the game loads on page open (partners have their own Play button — owner decision, one click instead of two); crawlers get the poster only.
- ⚠️ **GameMonetize consent:** no consent prompt inside GameMonetize games from an EU IP (Google ads + Tag Manager
  load right away). **Owner decision 2026-10-02: publish anyway** (`consent_mode = owner_accepted`). Legal risk accepted
  by the operator; recommended: ask GameMonetize how they handle EEA consent (TCF) and revisit.
- ✅ GameMonetize: pixuvo.com ads.txt VERIFIED and website Approved in the dashboard (2026-10-02); monetize_status = approved.
- ✅ GamePix: new property **9O09X** (https://pixuvo.com) — ads.txt VALID, property ACTIVE (2026-10-02); all 13 904 embeds rewritten to sid=9O09X; monetize_status = approved.
- ✅ Playgama imported (2 081 new games + 269 attached), clid attribution, Google CMP. GameDistribution: rejected (awaiting approval). Famobi: no account.
- ✅ Duplicate queue cleared (`scripts/review-queue.ts`): exact title across partners or near-identical text → merged; the rest marked "not a duplicate".

## SEO
- ✅ Canonical domain, `lang="en"`, unique titles/descriptions/H1, breadcrumbs, OG tags, JSON-LD
  (WebSite, Organization, BreadcrumbList, CollectionPage/ItemList, VideoGame — no aggregateRating).
- ✅ Sitemap index + pages/categories/games sitemaps with real `lastmod`; only indexable canonical URLs.
- ✅ Filters in the URL fragment (no crawlable combinations); 6 curated landing pages; search, favorites,
  recently-played and popular/trending without data are `noindex`.
- ⚠️ Cloudflare's managed robots.txt section on this zone blocks AI *user* agents too (ChatGPT-User, Claude-User,
  Perplexity-User). The portfolio rule from 23 Sept says AI search should pass — owner to decide; Pixuvo's own rules
  are appended after it and allow all regular crawlers.
- ⛔ Submit `https://pixuvo.com/sitemap.xml` in Google Search Console / Bing / Seznam once the property exists.

## Legal (texts are drafts to be reviewed, not legal advice)
- ✅ About, Contact, Privacy, Cookies, Terms, Copyright pages with the real operator: Ha Duy Huy, Bartáková 36,
  140 00 Praha, IČO 07876823, data box dxmsrdt, non-VAT payer, info@pixuvo.com.
- ⚠️ Review the privacy policy wording (partner roles as independent controllers, retention) with a lawyer.
- ✅ Google Analytics 4 `G-XESJS34X9Z` (2026-10-02) loads ONLY after "Analytics" consent (`src/scripts/analytics.ts`):
  consent mode with ad signals denied, Google signals + ad personalisation off, `game_start` event; withdrawing consent
  deletes `_ga` cookies. Verified live: reject → no request from pixuvo.com to Google (the GameMonetize frame loads its
  own gtag — partner, see consent note above); accept → page_view + game_start. No own ads.
- ⛔ Owner, in the GA4 admin: Data retention → 2 months; keep Google signals and ads links off (children's site).
- ⛔ Before showing own ads: approved ad network + its ads.txt lines + a certified CMP where required.

## Not in V1 (by design)
Accounts, chat, comments, own multiplayer, payments, virtual currency, own display ads, cloud saves.
