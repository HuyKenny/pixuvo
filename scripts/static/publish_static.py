#!/usr/bin/env python3
"""Finish and deploy the frozen pixuvo.com (called by scripts/static/build.sh).

    publish_static.py finish --out DIR --base http://127.0.0.1:PORT --client dist/client
        "/" = the English homepage + a small JS language redirect (replaces the Worker's run_worker_first: ["/"]);
        adds static files only referenced from JS (/data/facets.json, icons, IndexNow key) from the Astro build;
        refuses a broken render (too few pages, dev-server host leaked into HTML).
    publish_static.py deploy --out DIR
        shards pixuvo-zNN for /games/ + the 22 language dirs (zmraz.plan_segment_shards), then everything else as the
        assets-only Worker "pixuvo-static" on pixuvo.com/*. A zone route that moves to another shard is reassigned in
        place (PUT), never deleted first, so no prefix falls through to pixuvo-static; the API Worker "pixuvo" is untouched.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.error
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


def wrangler_deploy(name, d, routes, work, nf):
    cfg = {"name": name, "compatibility_date": "2026-11-01", "workers_dev": False, "preview_urls": False,
           "routes": routes, "assets": {"directory": str(d), "html_handling": "auto-trailing-slash", "not_found_handling": nf}}
    cp = work / f"wrangler-{name}.json"
    cp.write_text(json.dumps(cfg, indent=1))
    res = subprocess.run([os.environ.get("WRANGLER", "wrangler"), "deploy", "-c", str(cp)], cwd=str(work),
                         capture_output=True, text=True)
    full = res.stdout + res.stderr
    ok = res.returncode == 0 and any(k in full for k in ("Current Version ID", "Deployed ", "Uploaded "))
    return ok, full[-1500:]


def sticky_shards(plan, routes_now):
    """Pack the prefix groups into shards, keeping every prefix on the shard that serves it now while it fits.

    A prefix that moves anyway goes to a shard deployed BEFORE the one it leaves (gaining shards first), so the old
    owner never serves its route without the files. Returns [(worker name, files, route patterns)].
    """
    groups = []
    for sh in plan:
        pre = sorted(sh["prefixes"], key=len, reverse=True)
        by = {p: [] for p in pre}
        for f in sh["files"]:
            u = zmraz.url_path(f)
            by[next((p for p in pre if u.startswith(p)), pre[-1])].append(f)
        groups += list(by.items())
    owner = {p: r.get("script") for p, r in routes_now.items()}
    shards = {}                                   # name -> [prefixes, files]
    rest = []
    for p, fl in sorted(groups, key=lambda g: -len(g[1])):
        cur = owner.get(f"{DOMAIN}{p}*") or ""
        if re.fullmatch(re.escape(API_WORKER) + r"-z\d\d", cur):
            sh = shards.setdefault(cur, [[], []])
            if len(sh[1]) + len(fl) <= zmraz.SHARD_CAP:
                sh[0].append(p)
                sh[1] += fl
                continue
        rest.append((p, fl))
    for p, fl in rest:
        for name in sorted(shards):
            if len(shards[name][1]) + len(fl) <= zmraz.SHARD_CAP:
                break
        else:
            name = next(f"{API_WORKER}-z{i:02d}" for i in range(1, 100) if f"{API_WORKER}-z{i:02d}" not in shards)
            shards[name] = [[], []]
        shards[name][0].append(p)
        shards[name][1] += fl
    gains = {n: sum(1 for p in v[0] if owner.get(f"{DOMAIN}{p}*") != n) for n, v in shards.items()}
    order = sorted(shards, key=lambda n: (-gains[n], n))
    for n in order:
        print(f"plan {n}: {len(shards[n][1])} files, {len(shards[n][0])} prefixes, {gains[n]} moved in")
    return [(n, shards[n][1], [f"{DOMAIN}{p}*" for p in shards[n][0]]) for n in order if shards[n][1]]


def deploy(a):
    out = Path(a.out)
    acc = zmraz.account_id()
    zone = cf(f"/zones?name={DOMAIN}")["result"][0]["id"]
    routes_now = {r["pattern"]: r for r in cf(f"/zones/{zone}/workers/routes")["result"]}
    nf = "404-page" if (out / "404.html").exists() else "none"
    work = out.parent / (out.name + "-deploy")
    work.mkdir(exist_ok=True)
    plan = zmraz.plan_segment_shards(out, SEGMENTS)
    files = [p.relative_to(out).as_posix() for p in out.rglob("*") if p.is_file()]
    root = [f for f in files if f not in ("_redirects", "404.html")
            and not any(zmraz.url_path(f).startswith(f"/{s}/") for s in SEGMENTS)]
    if len(root) > zmraz.SHARD_CAP:
        sys.exit(f"{STATIC_WORKER}: {len(root)} files > {zmraz.SHARD_CAP}")
    jobs = sticky_shards(plan, routes_now)
    jobs.append((STATIC_WORKER, root, [f"{DOMAIN}/*"]))
    freed = []          # (pattern, previous script) — put back if a deploy fails
    for name, fl, pats in jobs:
        d = work / name
        zmraz.materialize(out, d, fl)
        rts = [{"pattern": p, "zone_name": DOMAIN} for p in pats]
        print(f"{name}: {len(fl)} files, {len(pats)} routes", flush=True)
        ok, log = wrangler_deploy(name, d, rts, work, nf)
        if not ok:
            # a route that moves to this shard still belongs to another one: free exactly those and retry
            # (the assets are already uploaded, so the gap is seconds)
            taken = [routes_now[p] for p in pats if p in routes_now and routes_now[p].get("script") not in (name, None)]
            for r in taken:
                if route_set(zone, r["pattern"], name, r["id"]) is True:     # reassign in place: no gap
                    freed.append((r["pattern"], r["script"]))
                    print(f"  route {r['pattern']} moved from {r['script']}")
            ok, log = wrangler_deploy(name, d, rts, work, nf) if taken else (False, log)
        if not ok:
            print(log)
            have = {r["pattern"] for r in cf(f"/zones/{zone}/workers/routes")["result"]}
            for p, sc in freed:
                if p not in have:
                    r = route_set(zone, p, sc)
                    print(f"  restored {p} -> {sc}: {r}")
            sys.exit(f"deploy {name} failed")
        print("  OK", flush=True)
        shutil.rmtree(d)
    # routes left on shards that no longer exist in the plan, and the shards themselves
    keep = {n for n, *_ in jobs}
    for sc in cf(f"/accounts/{acc}/workers/scripts")["result"]:
        if re.fullmatch(re.escape(API_WORKER) + r"-z\d\d", sc["id"]) and sc["id"] not in keep:
            r = cf(f"/accounts/{acc}/workers/scripts/{sc['id']}?force=true", "DELETE")
            print(f"old shard {sc['id']} deleted: {r.get('success')}")
    want = {p: n for n, _, pats in jobs for p in pats}
    for r in cf(f"/zones/{zone}/workers/routes")["result"]:
        if r["pattern"] in want and r.get("script") != want[r["pattern"]]:
            print(f"route {r['pattern']} -> {want[r['pattern']]}: {route_set(zone, r['pattern'], want[r['pattern']], r['id'])}")
    for p, n in want.items():
        if p not in {r["pattern"] for r in cf(f"/zones/{zone}/workers/routes")["result"]}:
            print(f"route {p} -> {n} created: {route_set(zone, p, n)}")
    for r in cf(f"/zones/{zone}/workers/routes")["result"]:
        if re.fullmatch(re.escape(API_WORKER) + r"-z\d\d", r.get("script") or "") and r["pattern"] not in want:
            ok = cf(f"/zones/{zone}/workers/routes/{r['id']}", "DELETE").get("success")
            print(f"stale route {r['pattern']} ({r['script']}) removed: {ok}")
    shutil.rmtree(work)


def route_set(zone, pattern, script, route_id=None):
    """Create a zone route, or point an existing one (route_id) at another Worker in place."""
    h = dict(zmraz.cf_creds()[0], **{"User-Agent": "pixuvo-static/1.0", "Content-Type": "application/json"})
    url = f"https://api.cloudflare.com/client/v4/zones/{zone}/workers/routes" + (f"/{route_id}" if route_id else "")
    req = urllib.request.Request(url, method="PUT" if route_id else "POST", headers=h,
                                 data=json.dumps({"pattern": pattern, "script": script}).encode())
    try:
        return json.load(urllib.request.urlopen(req, timeout=60)).get("success")
    except urllib.error.HTTPError as e:
        return json.load(e).get("errors")


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
