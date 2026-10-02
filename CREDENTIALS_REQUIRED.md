# Credentials still required

Only access that is actually missing. Never put values in this file, in git or in chat.
Local values live in `~/ai/credentials/.pixuvo-credentials.env` (mode 600); Worker secrets are set with
`wrangler secret put <NAME> -c dist/server/wrangler.json`; CI secrets in GitHub → Settings → Secrets → Actions.

| What | Why | How to provide it safely |
|---|---|---|
| **GamePix ads.txt (original file)** | the pasted snippet lost its line breaks and cannot be split without guessing | download the ads.txt text from the GamePix dashboard as a file and put it at `~/ai/tmp/pixuvo/gamepix-ads.txt` |
| **Playgama export + `clid`** | Playgama adapter | put the downloaded JSON at `~/ai/tmp/pixuvo/playgama.json`; add `PLAYGAMA_CLID=` to the credentials file |
| **Certified CMP** (optional, before own ads) | only needed if Pixuvo ever shows its own ads or analytics | e.g. Google Privacy & messaging via an AdSense account; not needed for partner-only monetization |

Already configured (no action): GitHub fine-grained token `pixuvo-cron-dispatch` (Worker secret `GH_DISPATCH_TOKEN`), daily Worker Cron Trigger, Cloudflare scoped API token (`pixuvo-ci`), D1 database, Turnstile widget,
Cloudflare Access app for `/admin`, `CRON_SECRET`, `IP_HASH_SALT`, GamePix sid, GameMonetize feed URL.
GitHub Actions secrets (`CLOUDFLARE_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_D1_DATABASE_ID`, `GAMEPIX_SID`,
`GAMEMONETIZE_FEED_URL`, `TURNSTILE_SITE_KEY`) are set on the repository.
