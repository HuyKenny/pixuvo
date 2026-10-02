# Providers

Three permissions are tracked separately for every partner (table `providers`, editable in Admin → Providers):

1. **catalog_status** – the feed is technically available.
2. **publish_status** – we may publish its games on pixuvo.com.
3. **monetize_status** – revenue is attributed to Pixuvo (account + attribution verified).

Plus **consent_mode**: `partner_handles` (partner shows its own consent flow — verified live), `owner_accepted`
(no partner consent flow found, the site owner explicitly decided to publish anyway), `blocked` (plays refused).
`/api/play/` checks publish status and consent mode on every start.

State on 2026-10-02:

| Provider | Catalog | Publish | Monetize | Consent | Games in D1 |
|---|---|---|---|---|---|
| GameMonetize | available | approved | **pending** (verify ads.txt in dashboard) | **owner_accepted** | 38 131 sources |
| GamePix | available | approved | **pending** (verify ads.txt in dashboard) | partner_handles | 13 892 sources (2 961 merged into GameMonetize games) |
| Playgama | available | approved | **pending** (revenue in widgets.playgama.com) | partner_handles | 2 350 sources (2 081 own games, 269 attached) |
| GameDistribution | unknown | **awaiting_approval** | not_approved | blocked | 0 — application rejected |
| Famobi | unknown | disabled | not_approved | blocked | 0 — no account |

## GameMonetize

* **Docs used:** https://gamemonetize.com/faq, https://gamemonetize.com/rss-builder, publisher dashboard
  (Websites and Ads.txt Management), checked 2026-10-02.
* **Feed:** `https://gamemonetize.com/feed.php?format=0&page=N` (from the publisher dashboard). JSON array,
  2 000 items per page, 20 pages = 38 131 games on 2026-10-02. Fields: `id, title, description, instructions, url,
  category, tags (CSV), thumb (512×384), width, height`. No developer, release date, mobile flag or popularity.
* **Rate limit:** Cloudflare error 1015 after ~5 rapid requests. Importer waits 8 s between pages and backs off 30 s+
  on 1015/429.
* **Embed:** `url` as delivered (`https://html5.gamemonetize.co/<hash>/`). The embed carries **no publisher id**:
  revenue is attributed via the verified website + ads.txt in the GameMonetize dashboard (per dashboard text).
* **ads.txt:** the two lines from the dashboard are served at `/ads.txt`. After the site is live, press **Verify**
  in the GameMonetize dashboard, then set monetize_status = approved in the admin.
* **Consent:** live test 2026-10-02 from an EU IP — after Play the frame requests Google IMA/doubleclick ads
  (`gdpr=1`) and Google Tag Manager with **no consent prompt**. Site owner decided on 2026-10-02 to publish anyway
  (`owner_accepted`, see LAUNCH-CHECKLIST.md). Ask GameMonetize support how EEA consent (TCF) is handled.
* **Content policy:** titles naming third-party brands (Minecraft, Mario, Barbie, …) and adult/gambling wording are
  held in `pending_review` (3 204 GameMonetize games).

## GamePix

* **Docs used:** https://partners.gamepix.com/publishers and the publisher dashboard feed URL, checked 2026-10-02.
* **Feed:** `https://feeds.gamepix.com/v2/json?sid=9O09X&pagination=96&page=N` (JSON Feed 1.1, `next_url` paging,
  145 pages = 13 893 games). Fields: `id, title, namespace, description, category, orientation, quality_score,
  width, height, date_published, date_modified, banner_image, image, url`.
* **Attribution:** publisher `sid=9O09X` is part of every embed URL (`https://play.gamepix.com/<ns>/embed?sid=9O09X`).
  The importer rejects any item or `next_url` without our sid.
* **Consent:** live test 2026-10-02 — GamePix shows its own consent notice inside the frame before gameplay/ads.
* **ads.txt:** the GamePix snippet reached us without line breaks and cannot be split without guessing
  (e.g. `#OKO_Version_45633across.com`). It will be added verbatim once the original file is provided — see
  CREDENTIALS_REQUIRED.md. Then press **Verify** in the GamePix dashboard.
* `quality_score` (0–1) feeds the ranking; GameMonetize games get a neutral 0.35 until Pixuvo play data exists.

## Playgama

* **Docs used:** https://wiki.playgama.com/playgama/for-partners/import-the-game-catalog and the partner dashboard
  (widgets.playgama.com), checked 2026-10-02.
* **Feed:** the dashboard's "Download all Games" calls `POST https://playgama.com/api/v1/partner/export/catalogue/games`
  with `{pagination:{limit,offset}, filters:{}, sort:{}}` → `{games[], totalCount}` (2 367 games, no login needed).
  Fields: id, slug, title, description, howToPlayText, gameURL, genres, tags, images, mobileReady, inGamePurchases,
  supportedLanguages, screenOrientation.
* **Attribution:** our `clid` (`PLAYGAMA_CLID`, from the dashboard's embed code) is appended to every
  `https://playgama.com/export/game/<slug>`, exactly like the dashboard's iframe code.
* 17 games point to their own domains (e.g. numicolor.com) and are skipped (not on the frame allowlist).
* **Consent:** live test 2026-10-02 from an EU IP — Google's certified consent dialog (Funding Choices) before ads.

## GameDistribution

* **State:** publisher application **rejected** for low traffic → `awaiting_approval`, publishing and monetization
  disabled. A public catalog endpoint exists but using it would mean publishing without permission. Adapter inactive.

## Famobi

* **State:** requires 50 000+ monthly visits and an approved application (https://famobi.com/publishers/). No access →
  `disabled`. Adapter inactive.

## Switching a provider off

Admin → Providers → Publish = `disabled` (or Consent = `blocked`) → Save. New plays stop immediately, games
without another usable source become `hidden` (dynamic pages and APIs within ~1 minute, static pages with the next
publish), and they are restored automatically when the provider is re-enabled. See OPERATIONS.md.
