"""构建舰娘/装备 master 数据。

源:制空権シミュレータ(kc-web)的 master.json(公开 firebase)。
kc-web 精简格式:ships(玩家舰,含 before=前形态id/next_lv=改造等级)、
items(装备)、enemies(深海舰,id>=1501)。改造前向指针 next 由 before 反推。

产物:
    data/master_full.json            管线用(含深海舰名)
    web/public/data/master.json      前端用(玩家舰+装备)
"""
from __future__ import annotations

import json
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
SRC = "https://firebasestorage.googleapis.com/v0/b/development-74af0.appspot.com/o/master.json?alt=media"


def main():
    print("downloading kc-web master.json ...")
    r = requests.get(SRC, timeout=60)
    r.raise_for_status()
    m = json.loads(r.content.decode("utf-8"))

    ships_raw = m["ships"]
    items_raw = m["items"]
    enemies_raw = m.get("enemies", [])
    print(f"ships={len(ships_raw)} items={len(items_raw)} enemies={len(enemies_raw)}")

    # before(前形态) → 反推 next(改造后继)
    next_of: dict[int, int] = {}
    for s in ships_raw:
        b = s.get("before") or 0
        if b:
            next_of[b] = s["id"]

    ships = {}
    for s in ships_raw:
        sid = s["id"]
        ships[str(sid)] = {
            "name": s["name"],
            "yomi": s.get("yomi", ""),
            "stype": s.get("type"),
            "ctype": s.get("type2"),
            "speed": s.get("speed"),
            "slots": s.get("s_count"),
            "luck": s.get("luck"),
            "before": s.get("before") or 0,
            "next": next_of.get(sid, 0),
            "next_lv": s.get("next_lv") or 0,
            "final": s.get("final"),
            "orig": s.get("orig"),
            "sort": s.get("sort"),
        }
    for e in enemies_raw:
        ships[str(e["id"])] = {"name": e.get("name", f"#{e['id']}"),
                               "stype": e.get("type"), "enemy": True}

    items = {}
    for it in items_raw:
        items[str(it["id"])] = {
            "name": it["name"],
            "type": it.get("type"),
            "icon": it.get("itype"),
            "abbr": it.get("abbr", ""),
        }

    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "data" / "master_full.json").write_text(
        json.dumps({"ships": ships, "items": items}, ensure_ascii=False))

    web_ships = {k: v for k, v in ships.items() if not v.get("enemy")}
    out = ROOT / "web" / "public" / "data"
    out.mkdir(parents=True, exist_ok=True)
    (out / "master.json").write_text(
        json.dumps({"ships": web_ships, "items": items}, ensure_ascii=False))

    # 自检:改造链正确性
    def chain(sid):
        names = []
        cur = str(sid)
        while cur and cur in ships and len(names) < 10:
            names.append(ships[cur]["name"])
            nxt = ships[cur].get("next") or 0
            cur = str(nxt) if nxt else None
        return " → ".join(names)

    for probe in (1, 45, 115):  # 睦月 / 夕張? / ?
        print(f"chain({probe}):", chain(probe))
    by_name = {v["name"]: k for k, v in ships.items() if not v.get("enemy")}
    for nm in ("夕張", "秋月", "最上", "Richelieu"):
        if nm in by_name:
            print(f"chain({nm}):", chain(by_name[nm]))
    print(f"master_full: {len(ships)} ships / {len(items)} items; web: {len(web_ships)}")


if __name__ == "__main__":
    main()
