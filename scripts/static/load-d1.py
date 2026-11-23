#!/usr/bin/env python3
"""Load a `wrangler d1 export` SQL dump (data rows) into a local SQLite file that already has the schema
(created by `wrangler d1 migrations apply --local`). Rows replace migration seed rows (INSERT OR REPLACE);
d1_migrations / _cf_ rows are skipped; CREATE statements in the dump are ignored (the migrations own the schema).

    scripts/static/load-d1.py <local.sqlite> <dump.sql[.gz]>
"""
import gzip
import re
import sqlite3
import sys
import time

db_path, dump = sys.argv[1], sys.argv[2]
op = gzip.open if dump.endswith(".gz") else open
con = sqlite3.connect(db_path)
con.execute("PRAGMA foreign_keys=OFF")
con.execute("PRAGMA journal_mode=WAL")
con.execute("PRAGMA synchronous=OFF")
skip = re.compile(r'^INSERT INTO "?(d1_migrations|_cf_\w+|sqlite_\w+)"?[ (]')
t0, n, by = time.time(), 0, {}
buf = ""
with op(dump, "rt", encoding="utf-8") as f:
    con.execute("BEGIN")
    for line in f:
        if not buf and not line.startswith("INSERT INTO"):
            continue                    # schema / pragma lines
        buf += line
        if not sqlite3.complete_statement(buf):
            continue                    # a value with a raw newline: keep reading
        stmt, buf = buf, ""
        if skip.match(stmt):
            continue
        con.execute("INSERT OR REPLACE" + stmt[len("INSERT"):])
        t = stmt.split(None, 3)[2].strip('"').split("(")[0]
        by[t] = by.get(t, 0) + 1
        n += 1
    con.execute("COMMIT")
con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
con.close()
print(f"loaded {n} rows in {time.time() - t0:.0f}s: " + ", ".join(f"{k} {v}" for k, v in sorted(by.items(), key=lambda x: -x[1])))
