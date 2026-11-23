#!/usr/bin/env python3
"""Turn the changes a local run made (import, probe, metrics) into SQL for production D1.

The run starts from an export of production D1 (base.sqlite), changes a local copy (new.sqlite), and only the
difference goes back: INSERT for new rows, UPDATE of the changed columns only, DELETE for removed rows.
Rows the run did not touch are never written, so live writes made meanwhile (plays, ratings, reports) survive.
games_fts (FTS5) rows are compared by content and re-inserted for changed games.

    scripts/static/d1-push.py base.sqlite new.sqlite --out push.sql [--max-writes 20000]

Prints a per-table summary and an estimate of D1 rows written (row + one per index on the table).
Exit code 3 when the estimate is over --max-writes (nothing is written to D1 by this script).
"""
import argparse
import sqlite3
import sys

SKIP = ("sqlite_", "_cf_", "d1_migrations", "games_fts")


def lit(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return str(int(v))
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, bytes):
        return "X'" + v.hex() + "'"
    return "'" + str(v).replace("'", "''") + "'"


def qi(name):
    return '"' + name.replace('"', '""') + '"'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("base")
    ap.add_argument("new")
    ap.add_argument("--out", required=True)
    ap.add_argument("--max-writes", type=int, default=0)
    a = ap.parse_args()

    con = sqlite3.connect(a.new)
    con.execute("ATTACH DATABASE ? AS b", (a.base,))
    tables = [r[0] for r in con.execute(
        "SELECT name FROM main.sqlite_master WHERE type='table' AND sql NOT LIKE 'CREATE VIRTUAL%' ORDER BY name")
        if not r[0].startswith(SKIP)]
    base_tables = {r[0] for r in con.execute("SELECT name FROM b.sqlite_master WHERE type='table'")}
    # parents before children (games before game_categories ...); D1 also checks foreign keys only at commit
    deps = {t: {r[2] for r in con.execute(f"SELECT * FROM pragma_foreign_key_list({lit(t)})")} & set(tables) - {t}
            for t in tables}
    ordered = []
    while deps:
        ready = sorted(t for t, d in deps.items() if not d - set(ordered)) or sorted(deps)[:1]
        for t in ready:
            ordered.append(t)
            deps.pop(t)
    tables = ordered
    out = open(a.out, "w", encoding="utf-8")
    out.write("PRAGMA defer_foreign_keys = true;\n")
    total_est = 0
    summary = []
    for t in tables:
        if t not in base_tables:
            sys.exit(f"table {t} missing in base — run migrations on production first")
        info = con.execute(f"PRAGMA main.table_info({qi(t)})").fetchall()
        cols = [r[1] for r in info]
        pk = [r[1] for r in sorted(info, key=lambda r: r[5]) if r[5] > 0]
        without_rowid = "WITHOUT ROWID" in (con.execute(
            "SELECT sql FROM main.sqlite_master WHERE name=?", (t,)).fetchone()[0] or "").upper()
        if not pk:
            if without_rowid:
                sys.exit(f"{t}: no key")
            pk = ["rowid"]
        idx_cols = [{r[2] for r in con.execute(f"SELECT * FROM pragma_index_info({lit(i[0])})")}
                    for i in con.execute(f"SELECT name FROM pragma_index_list({lit(t)})")]
        n_idx = len(idx_cols)
        upd_w = 0
        key = " AND ".join(f"n.{qi(k)} IS b.{qi(k)}" for k in pk)
        sel = ", ".join(f"n.{qi(c)}" for c in cols)
        bsel = ", ".join(f"b.{qi(c)}" for c in cols)
        kcols = ", ".join(qi(k) for k in pk)
        ins = upd = dele = 0
        # new or changed rows
        diff = " OR ".join(f"n.{qi(c)} IS NOT b.{qi(c)}" for c in cols)
        q = (f"SELECT {sel}, {bsel}, b.{qi(pk[0])} IS NULL AS is_new FROM main.{qi(t)} n "
             f"LEFT JOIN b.{qi(t)} b ON {key} WHERE b.{qi(pk[0])} IS NULL OR {diff}")
        if pk == ["rowid"]:
            q = (f"SELECT {sel}, n.rowid, {bsel}, b.rowid, b.rowid IS NULL AS is_new FROM main.{qi(t)} n "
                 f"LEFT JOIN b.{qi(t)} b ON n.rowid = b.rowid WHERE b.rowid IS NULL OR {diff}")
        nc = len(cols)
        for row in con.execute(q):
            if pk == ["rowid"]:
                nrow, nrid, brow, is_new = row[:nc], row[nc], row[nc + 1: 2 * nc + 1], row[-1]
                where = f"rowid = {lit(nrid)}"
                kc, kv = ["rowid"], [nrid]
            else:
                nrow, brow, is_new = row[:nc], row[nc: 2 * nc], row[-1]
                d = dict(zip(cols, nrow))
                where = " AND ".join(f"{qi(k)} = {lit(d[k])}" for k in pk)
                kc, kv = [], []
            if is_new:
                cl = kc + cols
                vl = kv + list(nrow)
                out.write(f"INSERT OR REPLACE INTO {qi(t)} ({', '.join(qi(c) for c in cl)}) VALUES "
                          f"({', '.join(lit(v) for v in vl)});\n")
                ins += 1
            else:
                changed = [c for c, v, o in zip(cols, nrow, brow) if v != o or type(v) is not type(o)]
                sets = [f"{qi(c)} = {lit(v)}" for c, v in zip(cols, nrow) if c in changed]
                if sets:
                    upd_w += 1 + sum(1 for ic in idx_cols if ic & set(changed))
                    out.write(f"UPDATE {qi(t)} SET {', '.join(sets)} WHERE {where};\n")
                    upd += 1
        # removed rows
        bkey = " AND ".join(f"n.{qi(k)} IS b.{qi(k)}" for k in pk)
        bk = ", ".join(f"b.{qi(k)}" for k in pk)
        for row in con.execute(f"SELECT {bk} FROM b.{qi(t)} b LEFT JOIN main.{qi(t)} n ON {bkey} WHERE n.{qi(pk[0])} IS NULL"):
            out.write(f"DELETE FROM {qi(t)} WHERE " + " AND ".join(f"{qi(k)} = {lit(v)}" for k, v in zip(pk, row)) + ";\n")
            dele += 1
        if ins or upd or dele:
            est = (ins + dele) * (1 + n_idx) + upd_w      # an UPDATE writes the row + each index on a changed column
            total_est += est
            summary.append(f"{t}: +{ins} ~{upd} -{dele} (≈{est} rows written)")

    # FTS5: compare the indexed text; changed games are deleted and re-inserted
    has_fts = con.execute("SELECT 1 FROM main.sqlite_master WHERE name='games_fts'").fetchone() and \
        con.execute("SELECT 1 FROM b.sqlite_master WHERE name='games_fts'").fetchone()
    if has_fts:
        fcols = ["title", "aliases", "developer", "labels"]
        newf = {r[0]: r[1:] for r in con.execute("SELECT rowid, title, aliases, developer, labels FROM main.games_fts")}
        basef = {r[0]: r[1:] for r in con.execute("SELECT rowid, title, aliases, developer, labels FROM b.games_fts")}
        ch = 0
        norm = lambda v: v and tuple(sorted((x or "").split()) for x in v)   # label order is not stable; tokens are
        for rid, vals in newf.items():
            if norm(basef.get(rid)) != norm(vals):
                if rid in basef:
                    out.write(f"DELETE FROM games_fts WHERE rowid = {rid};\n")
                out.write(f"INSERT INTO games_fts (rowid, {', '.join(fcols)}) VALUES ({rid}, {', '.join(lit(v) for v in vals)});\n")
                ch += 1
        gone = [rid for rid in basef if rid not in newf]
        for rid in gone:
            out.write(f"DELETE FROM games_fts WHERE rowid = {rid};\n")
        if ch or gone:
            est = (ch + len(gone)) * 12      # FTS5 shadow tables (docsize, idx, data segments): rough
            total_est += est
            summary.append(f"games_fts: ~{ch} -{len(gone)} (≈{est} rows written)")
    out.close()
    for s in summary:
        print(" ", s)
    print(f"estimated D1 rows written: {total_est}")
    if a.max_writes and total_est > a.max_writes:
        print(f"over the budget of {a.max_writes} rows — not pushing", file=sys.stderr)
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
