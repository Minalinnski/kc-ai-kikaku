"""快速检测攻略是否有更新(不重新归档,只比对正文快照 hash)。

用法:
    python pipeline/check_update.py            # 检查 main + lowdiff
退出码:0=无变化, 1=有变化(需要重跑 fetch_doc + build_guide_pack), 2=检查失败
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from shimo_common import clean_text, new_context

ROOT = Path(__file__).resolve().parent.parent

DOCS = {
    "main": "https://shimo.im/docs/rtk5YtznUfYtqbRH",
    "lowdiff": "https://shimo.im/docs/odyAOtsnVIdVPzAf/",
}

TEXT_ONLY_JS = """() => {
    const chunks = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ALL, {
        acceptNode(node) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const tag = node.tagName;
                if (['SCRIPT','STYLE','NOSCRIPT','HEADER','NAV'].includes(tag)) return NodeFilter.FILTER_REJECT;
                const st = getComputedStyle(node);
                if (st.display === 'none' || st.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
        }
    });
    let n;
    while ((n = walker.nextNode())) {
        if (n.nodeType === Node.TEXT_NODE) {
            const t = n.textContent;
            if (t && t.trim()) chunks.push(t);
        } else if (['P','DIV','LI','TR','H1','H2','H3','BR'].includes(n.tagName)) {
            chunks.push('\\n');
        }
    }
    return chunks.join('');
}"""


def text_hash(text: str) -> str:
    # 去掉 IMAGE 标记差异的影响:快照与快速抓取都不含标记时直接比正文
    normalized = "\n".join(
        l for l in text.split("\n") if l.strip() and not l.strip().startswith("[IMAGE_")
    )
    return hashlib.sha1(normalized.encode()).hexdigest()


def main() -> int:
    changed = False
    with sync_playwright() as p:
        browser, ctx = new_context(p, viewport=(1600, 1200))
        for name, url in DOCS.items():
            snap_f = ROOT / "data" / "shimo" / name / "doc.txt"
            if not snap_f.exists():
                print(f"[{name}] 无本地快照,需要先 fetch_doc")
                changed = True
                continue
            page = ctx.new_page()
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=60000)
                page.wait_for_timeout(9000)
                live = clean_text(page.evaluate(TEXT_ONLY_JS))
            except Exception as e:
                print(f"[{name}] 抓取失败: {e}")
                return 2
            finally:
                page.close()
            old = text_hash(snap_f.read_text())
            new = text_hash(live)
            if old == new:
                print(f"[{name}] 无变化 (chars={len(live)})")
            else:
                print(f"[{name}] ⚠ 有更新! 快照 {len(snap_f.read_text())} chars → 线上 {len(live)} chars")
                changed = True
        browser.close()
    if changed:
        print("\n→ 重跑: fetch_doc / fetch_sheet / fetch_noro6 / (核对 extracted) / build_guide_pack")
    return 1 if changed else 0


if __name__ == "__main__":
    sys.exit(main())
