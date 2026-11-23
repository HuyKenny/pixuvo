#!/usr/bin/env bash
# Static pixuvo.com (Cloudflare Workers Free, since 23 Nov 2026). Runs in GitHub Actions (.github/workflows/sync.yml).
#
#   scripts/static/build.sh [full|quick] [--no-deploy]
#     full   export D1 -> import partner feeds, probe embeds, metrics on the LOCAL copy -> push only the changed rows
#            to D1 -> snapshot + build -> render every sitemap page from a local `wrangler dev` -> deploy shards
#     quick  export D1 -> snapshot + build -> render -> deploy  (CSS/JS/template/text fixes: no feeds, no D1 writes)
#
# What serves pixuvo.com afterwards:
#   pixuvo-z01..zNN  /games/<x>* and the 22 language dirs (zone routes, assets only, ~19 k files each)
#   pixuvo-static    pixuvo.com/* : root pages, _astro, sitemaps, data files; "/" is English + a JS language redirect
#   pixuvo           pixuvo.com/api/* only (play, suggest, games, rate, report) from D1 pixuvo-production
#
# D1 cost per full run: one export (~400 k rows read) + the changed rows written (capped by PIXUVO_MAX_WRITES).
# Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CF_ACCOUNT_ID, CF_D1_DATABASE_ID, feed secrets (GAMEPIX_SID,
# PLAYGAMA_CLID, GAMEMONETIZE_FEED_URL), TURNSTILE_SITE_KEY; PIXUVO_WORK (default .static-work), PIXUVO_PORT (8797).
set -euo pipefail
MODE=${1:-full}
DEPLOY=1
[[ " $* " == *" --no-deploy "* ]] && DEPLOY=0
cd "$(dirname "$0")/../.."
ROOT=$PWD
WORK=$(realpath -m "${PIXUVO_WORK:-.static-work}")
PORT=${PIXUVO_PORT:-8797}
OUT=$WORK/site
DB_NAME=pixuvo-production
MAX_WRITES=${PIXUVO_MAX_WRITES:-30000}
WR="pnpm exec wrangler"
export WRANGLER="$ROOT/node_modules/.bin/wrangler"
t0=$(date +%s)
step() { echo "::group::$1 (+$(( $(date +%s) - t0 )) s)"; }
endstep() { echo "::endgroup::"; }

mkdir -p "$WORK"
rm -rf "$OUT" "$WORK/site-deploy" .wrangler/state

step "D1 migrations (production) + local schema"
$WR d1 migrations apply "$DB_NAME" --remote > "$WORK/migrate.log" 2>&1 || { tail -20 "$WORK/migrate.log"; exit 1; }
$WR d1 migrations apply "$DB_NAME" --local > "$WORK/migrate-local.log" 2>&1 || { tail -20 "$WORK/migrate-local.log"; exit 1; }
SQLITE=$(ls .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite | grep -v metadata | head -1)
endstep

step "export production D1 (data only, FTS rebuilt locally)"
TABLES=$(python3 - "$SQLITE" <<'EOF'
import sqlite3, sys
c = sqlite3.connect(sys.argv[1])
rows = c.execute("SELECT name, sql FROM sqlite_master WHERE type='table'").fetchall()
virt = [n for n, s in rows if (s or "").upper().startswith("CREATE VIRTUAL")]
print(" ".join(n for n, s in rows if n not in virt and not any(n.startswith(v + "_") for v in virt)
               and not n.startswith(("sqlite_", "_cf_", "d1_migrations"))))
EOF
)
args=(); for t in $TABLES; do args+=(--table "$t"); done
$WR d1 export "$DB_NAME" --remote --no-schema "${args[@]}" --output "$WORK/prod.sql" > "$WORK/export.log" 2>&1 || { tail -20 "$WORK/export.log"; exit 1; }
python3 scripts/static/load-d1.py "$SQLITE" "$WORK/prod.sql"
rm -f "$WORK/prod.sql"
pnpm exec tsx scripts/rebuild-fts.ts --target local | tail -1
python3 -c "import sqlite3,sys; sqlite3.connect(sys.argv[1]).execute('PRAGMA wal_checkpoint(TRUNCATE)')" "$SQLITE"
cp "$SQLITE" "$WORK/before.sqlite"
endstep

if [[ $MODE == full ]]; then
  step "import partner catalogs (local copy)"
  pnpm exec tsx scripts/import/cli.ts --target local --budget "${PIXUVO_IMPORT_BUDGET:-60000}" --json "$WORK/import-report.json" \
    > "$WORK/import.log" 2>&1 || echo "::warning::import exited non-zero (see import-report.json)"
  grep -E "^(gamemonetize|gamepix|playgama|gamezipper|htmlgames|gameflare|skip)[: ]| rows written|new [0-9]" "$WORK/import.log" | grep -v "page [0-9]* done" | tail -30 || true
  endstep
  step "probe embeds + metrics (local copy)"
  pnpm exec tsx scripts/probe-embeds.ts --target local --limit 2500 > "$WORK/probe.log" 2>&1 || echo "::warning::probe failed"
  tail -3 "$WORK/probe.log"
  pnpm exec tsx scripts/metrics.ts --target local | tail -5
  endstep
  step "push changed rows to D1"
  python3 -c "import sqlite3,sys; sqlite3.connect(sys.argv[1]).execute('PRAGMA wal_checkpoint(TRUNCATE)')" "$SQLITE"
  python3 scripts/static/d1-push.py "$WORK/before.sqlite" "$SQLITE" --out "$WORK/push.sql" --max-writes "$MAX_WRITES"
  if [[ -s "$WORK/push.sql" ]]; then
    $WR d1 execute "$DB_NAME" --remote --file "$WORK/push.sql" -y > "$WORK/push.log" 2>&1 || { tail -20 "$WORK/push.log"; exit 1; }
    grep -i -E "rows|executed|success" "$WORK/push.log" | tail -3 || true
  fi
  endstep
fi
rm -f "$WORK/before.sqlite"

step "snapshot + build"
DV=$(python3 -c "import sqlite3,sys; r=sqlite3.connect(sys.argv[1]).execute(\"SELECT value FROM site_settings WHERE key='data_version'\").fetchone(); print(r[0] if r else 0)" "$SQLITE")
SHA=${GITHUB_SHA:-$(git rev-parse HEAD)}
pnpm exec tsx scripts/snapshot.ts --target local --games 3000 | tail -2
BUILD_ID="$DV-${SHA:0:7}" PUBLIC_TURNSTILE_SITE_KEY="${TURNSTILE_SITE_KEY:-}" pnpm exec astro build > "$WORK/build.log" 2>&1 || { tail -40 "$WORK/build.log"; exit 1; }
pnpm exec tsx scripts/postbuild.ts
rm -f dist/server/.dev.vars
endstep

step "render every sitemap page from the local app"
# workerd runs the app on one thread: one dev server per CPU, each on its own copy of the local state.
# Sitemap pages + discovered utility pages (favorites, search, popular, ... in every language); never discovered game
# pages without a translation, /page/N/ listings or /random/ (publish_static.py finish points links at existing pages).
N=${PIXUVO_DEV_INSTANCES:-$(nproc)}
PIDS=(); BASES=""
stop_dev() { for p in "${PIDS[@]}"; do kill -- -"$p" 2>/dev/null || true; done; }
trap stop_dev EXIT
for n in $(seq 1 "$N"); do
  st=.wrangler/state
  if [[ $n -gt 1 ]]; then st=$WORK/state-$n; rm -rf "$st"; cp -r .wrangler/state "$st"; fi
  p=$((PORT + n - 1))
  setsid "$WRANGLER" dev -c dist/server/wrangler.json --local --persist-to "$st" --port "$p" --ip 127.0.0.1 \
    --inspector-port $((9300 + n)) --show-interactive-dev-session=false > "$WORK/dev-$n.log" 2>&1 &
  PIDS+=($!)
  BASES+="${BASES:+,}http://127.0.0.1:$p"
done
for b in ${BASES//,/ }; do
  for i in $(seq 1 180); do
    curl -sf -o /dev/null "$b/robots.txt" && break
    sleep 1
    [[ $i == 180 ]] && { for f in "$WORK"/dev-*.log; do echo "== $f"; grep -v -E "^[│├└┌]" "$f" | tail -15; done; exit 1; }
  done
done
echo "$N dev servers ready"
python3 -u scripts/static/zmraz.py crawl pixuvo.com --base "$BASES" --out "$OUT" --extra-until 200000 \
  --extra-skip '^(/[a-z]{2}(-han[st])?)?/(games/[^/]+/|([^/]+/)*page/[0-9]+/|random/)$' \
  --limit 200000 --workers "${PIXUVO_CRAWL_WORKERS:-$((N * 4))}" | grep -E "souborů|^\{" | awk 'NR % 20 == 0 || /^\{/' || true
python3 scripts/static/publish_static.py finish --out "$OUT" --base "http://127.0.0.1:$PORT" --client dist/client
stop_dev
trap - EXIT
for n in $(seq 2 "$N"); do rm -rf "$WORK/state-$n"; done
endstep

if [[ $DEPLOY == 1 ]]; then
  step "deploy shards + pixuvo-static"
  python3 scripts/static/publish_static.py deploy --out "$OUT"
  endstep
  step "deploy API Worker (pixuvo: /api/* only)"
  $WR deploy -c dist/server/wrangler.json 2>&1 | grep -v -i -E 'token|key' | tail -6
  endstep
  if [[ $MODE == full ]]; then
    step "IndexNow"
    pnpm exec tsx scripts/indexnow.ts --target local || echo "::warning::IndexNow failed"
    endstep
  fi
fi
du -sh "$OUT" 2>/dev/null || true
echo "done in $(( $(date +%s) - t0 )) s"
