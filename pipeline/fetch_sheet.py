"""抓取石墨表格(canvas 渲染)→ 平铺视口截图,供视觉提取。

用法:
    python pipeline/fetch_sheet.py lock https://shimo.im/sheets/GvhogtzTADp1mo1Q/MODOC/

对每个底部 tab:回到 A1,横向/纵向分片滚动截图 → data/shimo/<name>/tab<i>_<tab名>/tile_r<row>_c<col>.png
"""
from __future__ import annotations

import datetime
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from shimo_common import new_context, save_meta

ROOT = Path(__file__).resolve().parent.parent
VIEW_W, VIEW_H = 3000, 2200   # 超宽视口:canvas 随视口渲染,整表一屏拍全
H_TILES = 1
V_TILES = 2   # 纵向两片,防长表
H_STEP = 2400
V_STEP = 1800


def capture_tab(page, out: Path, tag: str):
    out.mkdir(parents=True, exist_ok=True)
    # 网格中心(避开顶部工具栏/左侧行号)
    cx, cy = VIEW_W // 2, VIEW_H // 2
    page.mouse.move(cx, cy)
    # 回到左上
    page.mouse.wheel(-20000, -20000)
    page.wait_for_timeout(1500)
    for r in range(V_TILES):
        # 每行开始:横向回零
        page.mouse.wheel(-20000, 0)
        page.wait_for_timeout(1200)
        for c in range(H_TILES):
            page.wait_for_timeout(800)
            path = out / f"tile_r{r}_c{c}.png"
            page.screenshot(path=str(path))
            if c < H_TILES - 1:
                page.mouse.wheel(H_STEP, 0)
                page.wait_for_timeout(900)
        if r < V_TILES - 1:
            page.mouse.wheel(-20000, 0)
            page.wait_for_timeout(1000)
            page.mouse.wheel(0, V_STEP)
            page.wait_for_timeout(900)
    print(f"  [{tag}] tiles -> {out}")


def fetch(name: str, url: str):
    out = ROOT / "data" / "shimo" / name
    out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser, ctx = new_context(p, viewport=(VIEW_W, VIEW_H))
        page = ctx.new_page()
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(15000)
        title = page.title()

        # 底部 tab 名
        tabs = page.eval_on_selector_all(
            "[class*='sheet-tab'], [class*='tab-item'], [class*='tabItem']",
            "els => els.map(e => (e.innerText||'').trim()).filter(t => t && t.length < 30)",
        )
        # 去重保持顺序
        seen, tab_names = set(), []
        for t in tabs:
            if t not in seen:
                seen.add(t)
                tab_names.append(t)
        if not tab_names:
            tab_names = ["default"]
        print(f"[{name}] title={title!r} tabs={tab_names}")

        for i, tab in enumerate(tab_names):
            if tab != "default":
                try:
                    page.get_by_text(tab, exact=True).first.click(timeout=5000)
                    page.wait_for_timeout(4000)
                except Exception as e:
                    print(f"  tab {tab!r} click failed: {e}")
                    continue
            safe = re.sub(r"[^\w一-鿿-]", "_", tab)
            capture_tab(page, out / f"tab{i}_{safe}", tab)

        save_meta(out, url=url, title=title, tabs=tab_names,
                  fetched_at=datetime.datetime.now().isoformat(),
                  grid=dict(h_tiles=H_TILES, v_tiles=V_TILES, h_step=H_STEP,
                            v_step=V_STEP, view=[VIEW_W, VIEW_H]))
        browser.close()


if __name__ == "__main__":
    fetch(sys.argv[1], sys.argv[2])
