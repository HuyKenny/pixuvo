# Credentials still required

Only access that is actually missing. Never put values in this file, in git or in chat.
Local values live in `~/ai/credentials/.pixuvo-credentials.env` (mode 600); Worker secrets are set with
`wrangler secret put <NAME> -c dist/server/wrangler.json`; CI secrets in GitHub → Settings → Secrets → Actions.

| What | Why | How to provide it safely |
|---|---|---|
| **GitHub fine-grained token** `GH_DISPATCH_TOKEN` | lets `/api/cron/sync` and "Request sync" start the GitHub workflow | github.com → Settings → Developer settings → Fine-grained tokens → repository `HuyKenny/pixuvo` only → permission *Actions: Read and write* → then `pnpm exec wrangler secret put GH_DISPATCH_TOKEN -c dist/server/wrangler.json` (paste in terminal, not in chat) |
| **cron-job.org job** | daily trigger | URL `https://pixuvo.com/api/cron/sync/`, method POST, headers `Authorization: Bearer <CRON_SECRET>` and `Content-Type: application/json`, body `{}`, once a day (e.g. 04:20). `CRON_SECRET` is in the credentials file. |
| **GamePix ads.txt (original file)** | the pasted snippet lost its line breaks and cannot be split without guessing | download the ads.txt text from the GamePix dashboard as a file and put it at `~/ai/tmp/pixuvo/gamepix-ads.txt` |
| **Playgama export + `clid`** | Playgama adapter | put the downloaded JSON at `~/ai/tmp/pixuvo/playgama.json`; add `PLAYGAMA_CLID=` to the credentials file |
| **Certified CMP** (optional, before own ads) | only needed if Pixuvo ever shows its own ads or analytics | e.g. Google Privacy & messaging via an AdSense account; not needed for partner-only monetization |

Already configured (no action): Cloudflare scoped API token (`pixuvo-ci`), D1 database, Turnstile widget,
Cloudflare Access app for `/admin`, `CRON_SECRET`, `IP_HASH_SALT`, GamePix sid, GameMonetize feed URL.
GitHub Actions secrets (`CLOUDFLARE_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_D1_DATABASE_ID`, `GAMEPIX_SID`,
`GAMEMONETIZE_FEED_URL`, `TURNSTILE_SITE_KEY`) are set on the repository.
