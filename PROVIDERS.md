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
| GameMonetize | available | approved | **approved** (ads.txt VERIFIED, website Approved) | **owner_accepted** | 38 131 sources |
| GamePix | available | approved | **approved** (property 9O09X, ads.txt VALID) | partner_handles | 13 892 sources (2 961 merged into GameMonetize games) |
| Playgama | available | approved | **pending** (revenue in widgets.playgama.com) | partner_handles | 2 350 sources (2 081 own games, 269 attached) |
| GameZipper (since 2026-10-05) | available (local file) | approved — **76 hand-picked games only** | not_approved (no revenue share exists) | **owner_accepted** | 76 sources |
| HTMLGames (since 2026-10-05) | available | approved | not_approved (no revenue share; their ads.txt lines added) | partner_handles | ~1 240 sources (≈1 210 own games, ≈30 attached) |
| GameFlare (since 2026-10-05) | available | approved | **pending** (revenue share exists, needs a publisher account) | **owner_accepted** | 164 sources (≈129 own games, ≈35 attached) |
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

## GameZipper

* **Programme:** https://gamezipper.com/publisher-partner.html — open embed, no signup, no key, no revenue share;
  commercial use allowed, raw game files must not be rehosted. Embed `https://gamezipper.com/<slug>/?utm_source=pixuvo.com&utm_medium=embed`.
* **Feed:** the documented `GET /api/games.json` returns 404 (2026-10-05). `scripts/import/gamezipper-catalog.ts`
  rebuilds `data/providers/gamezipper.json` from `/js/games-data.js` (parsed as text, never executed) and one page
  per allowlisted game, 3 s apart. The adapter only reads that file, so the daily sync makes no requests to them.
  Refresh: `pnpm exec tsx scripts/import/gamezipper-catalog.ts` (all) or `--only slug1,slug2`, then commit the file.
* **Selection:** `data/providers/gamezipper-allowlist.json` — 77 of their 466 games: the title has real search demand
  (Ahrefs, global volume ≥ ~200 with game intent), it is not a clone of a trademarked game (Wordle, KenKen, Connect
  Four, Fill-a-Pix, Quoridor, Slice Master… were left out) and Pixuvo did not already have it under the same name.
  Kropki Sudoku has no thumbnail and is skipped, so 76 games import. `editorial-import.ts` gives a game its
  `search_volume` only when no other published game carries the keyword.
* **Ads/consent (2026-10-05, EU IP, game embedded like Pixuvo does):** 5 AdSense units, Adsterra
  (effectivecpmnetwork.com — popunder/smartlink) and ExoClick (magsrv.com) load inside the frame with **no consent
  prompt**, plus a "GameZipper — More Free Games" bar — although the programme page promises no ads in embeds. The
  site owner decided to publish the selection anyway; `/api/play` serves these games **without `allow-popups`**
  (`sandboxFor` in `src/lib/security.ts`), so no click inside the game can open a new window. Re-test before
  adding more games.
* Farkle stays in review (`sensitive:casino` tag).

## HTMLGames (Zygomatic)

* **Feed:** `GET https://www.htmlgames.com/rss/games.php?json` — a JSON array (1 242 games on 2026-10-05): name,
  category (56 genres), create_date, description, url (`https://cdn.htmlgames.com/<Id>/index.html`, a few end in `/`),
  embed, width/height (always 800×480, even for portrait games — ignored), thumb1–thumb8 (we use the 800×450 webp).
* **Permission:** the RSS page (https://www.htmlgames.com/rss/) says "Feel free to publish our html5 games on your
  site". No account, key or attribution parameter.
* **ads.txt:** their seller lines from https://cdn.htmlgames.com/ads.partners.txt are part of `/ads.txt`
  (`src/config/ads-htmlgames.ts`, verbatim). They authorise Zygomatic's sellers for the ads in their games; the revenue
  is theirs, not Pixuvo's. Replace the block when they change the file.
* **Genres:** `HG_GENRES` in the adapter maps their genres to Pixuvo labels and keeps precise solitaire/mahjong tags
  (`spider solitaire`, `freecell`, `klondike`, `pyramid solitaire`, `golf solitaire`, `tripeaks`, `mahjong connect`)
  for the landings of the same names. Brand words (Tetris, Zuma, Bejeweled, Arkanoid) never become tags.
* **Skipped:** 6 German-language daily puzzles and JollyJong2.5 (URL outside the expected pattern). Tetris/Zuma/
  "Frozen" titles and blackjack/poker games wait in review.
* **Consent:** live test 2026-10-05 from an EU IP — a certified InMobi TCF dialog with "Reject all" before ads (Yolla
  Media + Google IMA/GAM); no popups.

## GameFlare

* **Feed:** `GET https://distribution.gameflare.com/feed.json` → `{games:[{game:{title, url, description, instructions,
  width, height, assetList:[{name}], categoryList:[{name}]}}]}` (164 games on 2026-10-05, no key). `url` is the embed
  (`/embed/<slug>/`), the thumbnail is a 400×300 jpg on `data.gameflare.com`, sizes are real (portrait games exist).
* **Revenue share:** 35 % publisher / 50 % developer / 15 % GameFlare, monthly from 50 €, via PayPal or Wise. It needs a
  publisher account (Sign up on distribution.gameflare.com; "only offered for established websites") and their ads.txt
  lines (`src/config/ads-gameflare.ts`, from https://distribution.gameflare.com/publishers/). **To do (owner):** register
  pixuvo.com there, then set `monetize_status = approved`; if the account hands out a publisher parameter for the
  embeds, add it in `adapters/gameflare.ts` (like the GamePix sid).
* **Consent (2026-10-05, EU IP):** no TCF dialog, only "By clicking Play Game you agree with our Privacy Policy and
  Cookie Policy… targeted advertisements" with no reject option. Ads from AdinPlay, Venatus, Google IMA/AdSense and
  CPMStar; no popups. Published as `owner_accepted` by the owner's decision (same as GameMonetize).
* **Labels:** category names minus " Games"; `Two players` → `2 player`, `Jumping/Skill` add `platformer`/`arcade`;
  `HTML5`, `WebGL`, `Minecraft` (brand), `Bloody`, `Company`, `Crazy`, `Funny` are dropped.
* **Tests:** their WAF answers 403 to a `HeadlessChrome` user agent — use a normal UA in browser tests. Skibidi Online
  and Five Nights at Old Toy Factory 2020 wait in review (brand filter).

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
