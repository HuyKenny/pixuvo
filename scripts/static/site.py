#!/usr/bin/env python3
"""Finish and deploy the frozen pixuvo.com (called by scripts/static/build.sh).

    site.py finish --out DIR --base http://127.0.0.1:PORT --client dist/client
        "/" = the English homepage + a small JS language redirect (replaces the Worker's run_worker_first: ["/"]);
        adds static files only referenced from JS (/data/facets.json, icons, IndexNow key) from the Astro build;
        refuses a broken render (too few pages, dev-server host leaked into HTML).
    site.py deploy --out DIR
        shards for /games/ + the 22 language dirs (zmraz.py deploy --segments, keeps the API Worker "pixuvo"),
        then everything else as the assets-only Worker "pixuvo-static" on pixuvo.com/*.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import zmraz  # noqa: E402

DOMAIN = "pixuvo.com"
LANGS = ["es", "fr", "pt", "de", "it", "nl", "pl", "cs", "sk", "hu", "ro", "uk", "ru", "tr", "ar", "id", "vi", "th", "ja",
         "ko", "zh-hans", "zh-hant"]
SEGMENTS = ["games"] + LANGS
STATIC_WORKER = "pixuvo-static"
API_WORKER = "pixuvo"

# Same order as the Worker's detectLang(): remembered choice (cookie) -> browser languages -> English.
# A visit from another pixuvo page (logo / "English" link) stays on "/".
REDIRECT = ("<script>(function(){try{var L=%s;var c=/(?:^|;\\s*)pixuvo_lang=([a-z-]{2,7})/.exec(document.cookie);"
            "if(c){if(c[1]!=='en'&&L.indexOf(c[1])>=0)location.replace('/'+c[1]+'/'+location.search);return}"
            "if(/pixuvo\\.com/.test(document.referrer))return;"
            "var a=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||''];"
            "for(var i=0;i<a.length;i++){var t=String(a[i]).toLowerCase(),b=t.split('-')[0],r=null;"
            "if(b==='zh')r=/(^|-)(hant|tw|hk|mo)($|-)/.test(t.slice(3))?'zh-hant':'zh-hans';"
            "else if(b==='en'||L.indexOf(b)>=0)r=b;"
            "if(r){if(r!=='en')location.replace('/'+r+'/'+location.search);return}}}catch(e){}})()</script>") % json.dumps(LANGS)


def finish(a):
    out = Path(a.out)
    req = urllib.request.Request(a.base.rstrip("/") + "/", headers={"User-Agent": zmraz.UA, "Accept-Language": "en"})
    with urllib.request.urlopen(req, timeout=60) as r:
        home = r.read().decode("utf-8")
    if "<head>" not in home or 'hreflang="cs"' not in home:
        sys.exit("homepage render looks wrong")
    (out / "index.html").write_text(home.replace("<head>", "<head>" + REDIRECT, 1), encoding="utf-8")
    red = out / "_redirects"
    if red.exists():
        red.write_text("".join(l for l in red.read_text().splitlines(True) if not l.startswith("/ ")))

    added = 0
    client = Path(a.client)
    for p in client.rglob("*"):
        rel = p.relative_to(client).as_posix()
        if not p.is_file() or rel.endswith(".html") or rel in ("_headers", "_routes.json", ".assetsignore") or rel.startswith("_worker"):
            continue
        d = out / rel
        if not d.exists():
            d.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, d)
            added += 1

    meta = json.loads((out.parent / (out.name + ".meta.json")).read_text())
    html = [p for p in out.rglob("*.html")]
    leaked = [p for p in html[:3000] if b"127.0.0.1" in p.read_bytes()]
    print(f"finish: {len(html)} HTML pages, {added} build files added, crawl errors {meta['errors']} {meta['error_sample'] if meta['errors'] else ''}")
    if leaked:
        sys.exit(f"dev-server host leaked into {len(leaked)} pages, e.g. {leaked[0]}")
    _, urls = zmraz.sitemap_urls("https://" + DOMAIN, a.base.rstrip("/"))
    if len(html) < 0.97 * len(urls) or meta["errors"] > max(50, len(urls) // 100):
        sys.exit(f"render incomplete: {len(html)} pages for {len(urls)} sitemap URLs, {meta['errors']} errors — not deploying")


def cf(path, method="GET"):
    return zmraz.cf_api(path, method)


def deploy(a):
    out = Path(a.out)
    acc = zmraz.account_id()
    zone = cf(f"/zones?name={DOMAIN}")["result"][0]["id"]
    # 1) routes of shards whose owner changes (more games per letter -> another packing) are freed first:
    #    a zone route can belong to one Worker only, and a stale route would shadow the new shard.
    plan = zmraz.plan_segment_shards(out, SEGMENTS)
    want = {f"{DOMAIN}{p}*": f"{API_WORKER}-z{i:02d}" for i, sh in enumerate(plan, 1) for p in sh["prefixes"]}
    for r in cf(f"/zones/{zone}/workers/routes")["result"]:
        s = r.get("script") or ""
        if re.fullmatch(re.escape(API_WORKER) + r"-z\d\d", s) and want.get(r["pattern"]) != s:
            ok = cf(f"/zones/{zone}/workers/routes/{r['id']}", "DELETE").get("success")
            print(f"route {r['pattern']} ({s}) freed: {ok}")
    # 2) shards (zmraz keeps the API Worker, deletes shards no longer in the plan)
    sys.argv = ["zmraz.py", "deploy", DOMAIN, "--out", str(out), "--worker", API_WORKER, "--segments", ",".join(SEGMENTS)]
    if zmraz.main():
        sys.exit("shard deploy failed")
    # 3) everything outside the segments -> pixuvo-static on pixuvo.com/*
    files = [p.relative_to(out).as_posix() for p in out.rglob("*") if p.is_file()]
    root = [f for f in files if f not in ("_redirects", "404.html")
            and not any(zmraz.url_path(f).startswith(f"/{s}/") for s in SEGMENTS)]
    if len(root) > zmraz.SHARD_CAP:
        sys.exit(f"{STATIC_WORKER}: {len(root)} files > {zmraz.SHARD_CAP}")
    work = out.parent / (out.name + "-deploy")
    d = work / STATIC_WORKER
    zmraz.materialize(out, d, root)
    cfg = {"name": STATIC_WORKER, "compatibility_date": "2026-11-01", "workers_dev": False, "preview_urls": False,
           "routes": [{"pattern": f"{DOMAIN}/*", "zone_name": DOMAIN}],
           "assets": {"directory": str(d), "html_handling": "auto-trailing-slash",
                      "not_found_handling": "404-page" if (out / "404.html").exists() else "none"}}
    cp = work / f"wrangler-{STATIC_WORKER}.json"
    cp.write_text(json.dumps(cfg, indent=1))
    print(f"{STATIC_WORKER}: {len(root)} files", flush=True)
    res = subprocess.run([os.environ.get("WRANGLER", "wrangler"), "deploy", "-c", str(cp)], cwd=str(work),
                         capture_output=True, text=True)
    full = res.stdout + res.stderr
    if res.returncode != 0 or not any(k in full for k in ("Current Version ID", "Deployed ", "Uploaded ")):
        print(full[-1500:])
        sys.exit(f"deploy {STATIC_WORKER} failed")
    print("  OK")
    shutil.rmtree(work)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["finish", "deploy"])
    ap.add_argument("--out", required=True)
    ap.add_argument("--base")
    ap.add_argument("--client", default="dist/client")
    a = ap.parse_args()
    finish(a) if a.cmd == "finish" else deploy(a)


if __name__ == "__main__":
    main()
