"""解析 kc.noro6.net/s/<code> 短链 → 完整编成 JSON(lz-string 解码),并用 master 注解名字。

用法:
    python pipeline/fetch_noro6.py                 # 从 data/shimo/main/doc.txt 里扫短链
    python pipeline/fetch_noro6.py 0D7o BY2Q ...   # 指定短码

产物:
    data/noro6/<code>.json          解码原文
    data/noro6/index.json           code → {url, ok, fleets概要}
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

import requests
from lzstring import LZString

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "noro6"
MASTER = ROOT / "data" / "master_full.json"

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}


def resolve(code: str) -> dict | None:
    url = f"https://kc.noro6.net/s/{code}"
    r = requests.head(url, allow_redirects=False, timeout=20, headers=UA)
    loc = r.headers.get("location", "")
    m = re.search(r"[?&]data=([^&]+)", loc)
    if not m:
        print(f"  {code}: no data param (status={r.status_code} loc={loc[:80]})")
        return None
    s = LZString().decompressFromEncodedURIComponent(m.group(1))
    if not s:
        print(f"  {code}: lz decode failed")
        return None
    return json.loads(s)


def summarize(obj: dict, master: dict | None) -> dict:
    ships_m = (master or {}).get("ships", {})
    items_m = (master or {}).get("items", {})

    def ship_name(sid):
        return ships_m.get(str(sid), {}).get("name", f"#{sid}")

    def item_name(iid):
        return items_m.get(str(iid), {}).get("name", f"#{iid}")

    out = {"fleets": [], "airbases": [], "enemy_nodes": []}
    fi = obj.get("fleetInfo", {})
    out["isUnion"] = fi.get("isUnion")
    out["admiralLevel"] = fi.get("admiralLevel")
    for fl in fi.get("fleets", []):
        ships = []
        for s in fl.get("ships", []):
            if not s or not s.get("i"):
                continue
            items = []
            for it in (s.get("is") or []):
                if not it or not it.get("i"):
                    continue
                nm = item_name(it["i"])
                if it.get("r"):
                    nm += f"★{it['r']}"
                items.append(nm)
            ex = s.get("ex") or {}
            if ex.get("i"):
                items.append("[补强]" + item_name(ex["i"]))
            ships.append({"id": s["i"], "name": ship_name(s["i"]),
                          "lv": s.get("lv"), "luck": s.get("lu"),
                          "items": items})
        if ships:
            out["fleets"].append(ships)
    for ab in obj.get("airbaseInfo", {}).get("airbases", []):
        items = [item_name(it["i"]) + (f"★{it['r']}" if it.get("r") else "")
                 for it in ab.get("items", []) if it and it.get("i")]
        if any(not i.startswith("#0") for i in items):
            out["airbases"].append({"mode": ab.get("mode"),
                                    "target": ab.get("battleTarget"), "items": items})
    for f in obj.get("battleInfo", {}).get("fleets", []):
        enemies = [{"id": e.get("i"), "name": ship_name(e.get("i"))}
                   for e in f.get("enemies", []) if e and e.get("i")]
        out["enemy_nodes"].append({"area": f.get("area"), "node": f.get("nodeName"),
                                   "formation": f.get("formation"),
                                   "enemies": enemies})
    return out


def main(codes: list[str]):
    OUT.mkdir(parents=True, exist_ok=True)
    master = json.loads(MASTER.read_text()) if MASTER.exists() else None
    if not master:
        print("!! data/master_full.json 不存在,名字注解将缺失(先跑 build_master.py)")
    index = {}
    for code in codes:
        try:
            obj = resolve(code)
        except Exception as e:
            print(f"  {code}: error {e}")
            obj = None
        if obj is None:
            index[code] = {"ok": False}
            continue
        summary = summarize(obj, master)
        (OUT / f"{code}.json").write_text(
            json.dumps({"code": code, "raw": obj, "summary": summary},
                       ensure_ascii=False, indent=1))
        n_ships = sum(len(f) for f in summary["fleets"])
        index[code] = {"ok": True, "union": summary.get("isUnion"),
                       "ships": n_ships, "airbases": len(summary["airbases"])}
        print(f"  {code}: ok fleets={len(summary['fleets'])} ships={n_ships} "
              f"airbases={len(summary['airbases'])} union={summary.get('isUnion')}")
        time.sleep(0.5)
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    if len(sys.argv) > 1:
        codes = sys.argv[1:]
    else:
        doc = (ROOT / "data" / "shimo" / "main" / "doc.txt").read_text()
        codes = []
        for m in re.finditer(r"kc\.noro6\.net/s/([A-Za-z0-9]+)", doc):
            if m.group(1) not in codes:
                codes.append(m.group(1))
        print(f"从 doc.txt 扫到 {len(codes)} 个短链")
    main(codes)
