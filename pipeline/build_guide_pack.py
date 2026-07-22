"""汇编 guide pack → web/public/data/guide.json + 图片拷贝。

输入:
    data/shimo/main/{doc.txt, images.json, images/}
    data/shimo/lowdiff/doc.txt
    data/noro6/*.json (fetch_noro6 产物)
    data/extracted/{lock_table.json, dup_table.json}
输出:
    web/public/data/guide.json
    web/public/data/img/<file>   (攻略原文引用的图片)
"""
from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "public" / "data"

EVENT = {
    "name": "2026夏イベ「反撃!第三十一戦隊の戦い」",
    "name_cn": "2026夏活",
    "started": "2026-07-08",
    "maps": ["E1", "E2", "E3", "E4", "E5", "E6"],
    "guide_title": "2026夏攻略【秋月改二牧场开荒组】",
    "guide_author": "微博@天真善良可爱的秋月酱 / B站@HanabiOfficial",
    "guide_url": "https://shimo.im/docs/rtk5YtznUfYtqbRH",
}

# 章节标题识别:短行 + E图阶段/已知章节名
SECTION_RE = re.compile(
    r"^(E\d(P\d)?\S*|削甲|支援参考|刷陆航熟练|锁船分析|锁船推荐|倍卡表|奖励统计"
    r"|友军舰队.*|低难度解密.*|写在前面|自己打用的配置|P\d解密.*|E\d（捞）)$")


def section_of(lines: list[str], pos: int) -> str:
    """返回 pos 行之前最近的章节标题。"""
    for i in range(pos, -1, -1):
        l = lines[i].strip()
        if l and SECTION_RE.match(l) and len(l) <= 20:
            return l
    return ""


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    main_dir = ROOT / "data" / "shimo" / "main"
    doc = (main_dir / "doc.txt").read_text()
    lowdiff = (ROOT / "data" / "shimo" / "lowdiff" / "doc.txt").read_text()
    lock_table = json.loads((ROOT / "data" / "extracted" / "lock_table.json").read_text())
    dup_table = json.loads((ROOT / "data" / "extracted" / "dup_table.json").read_text())
    images = json.loads((main_dir / "images.json").read_text())

    # noro6 配置:code → {section, summary}
    lines = doc.split("\n")
    noro6 = {}
    for i, l in enumerate(lines):
        for m in re.finditer(r"kc\.noro6\.net/s/([A-Za-z0-9]+)", l):
            code = m.group(1)
            f = ROOT / "data" / "noro6" / f"{code}.json"
            if not f.exists():
                print(f"!! noro6/{code}.json 缺失")
                continue
            j = json.loads(f.read_text())
            if code not in noro6:
                noro6[code] = {"section": section_of(lines, i),
                               "url": f"https://kc.noro6.net/s/{code}",
                               "summary": j["summary"]}

    # 图片拷贝 + 标记映射(只保留成功截获的)
    img_dir = OUT / "img"
    img_dir.mkdir(exist_ok=True)
    img_map = {}
    for idx, info in images.items():
        if info.get("file"):
            src = main_dir / "images" / info["file"]
            if src.exists():
                shutil.copy2(src, img_dir / info["file"])
                img_map[idx] = {"file": info["file"], "w": info["w"], "h": info["h"]}

    pack = {
        "event": EVENT,
        "built_at": __import__("datetime").datetime.now().isoformat(),
        "main_text": doc,
        "lowdiff_text": lowdiff,
        "lock_table": lock_table,
        "dup_table": dup_table,
        "noro6": noro6,
        "images": img_map,
    }
    out_f = OUT / "guide.json"
    out_f.write_text(json.dumps(pack, ensure_ascii=False))
    n_img = len(img_map)
    size = out_f.stat().st_size
    print(f"guide.json: {size/1024:.0f} KB, noro6={len(noro6)}, images={n_img}")
    secs = {}
    for c, v in noro6.items():
        secs.setdefault(v["section"] or "?", []).append(c)
    for s, cs in secs.items():
        print(f"  {s}: {' '.join(cs)}")


if __name__ == "__main__":
    main()
