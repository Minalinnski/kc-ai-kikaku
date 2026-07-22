"""抓取石墨富文本文档 → data/shimo/<name>/{doc.txt, images/, links.json, meta.json}

石墨懒加载机制:所有 img 元素常驻 DOM,但只有滚进视口才填 src(blob:),
滚出后清空。因此:先按文档序给 img 打索引,慢滚全程逐步收割 idx→src,
配合网络响应截获拿字节,最后 DOM 遍历按索引落 [IMAGE_N] 标记。

用法:
    python pipeline/fetch_doc.py main    https://shimo.im/docs/rtk5YtznUfYtqbRH
    python pipeline/fetch_doc.py lowdiff https://shimo.im/docs/odyAOtsnVIdVPzAf/
"""
from __future__ import annotations

import datetime
import hashlib
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from shimo_common import clean_text, collect_links, new_context, save_meta

ROOT = Path(__file__).resolve().parent.parent

TAG_JS = """() => {
    const imgs = document.querySelectorAll('img');
    imgs.forEach((el, i) => { el.dataset.kcIdx = String(i); });
    window.__kcMap = window.__kcMap || {};
    // 找主滚动容器(scrollHeight 最大的可滚元素)
    let best = document.scrollingElement, bestSh = 0;
    document.querySelectorAll('*').forEach(el => {
        if (el.scrollHeight > el.clientHeight + 500 && el.clientHeight > 300
            && el.scrollHeight > bestSh) { best = el; bestSh = el.scrollHeight; }
    });
    window.__kcScroller = best;
    return {imgs: imgs.length, scrollHeight: best.scrollHeight};
}"""

CONTENT_SRC = "(src.startsWith('blob:') || src.includes('uploader.shimo.im'))"

HARVEST_JS = """() => {
    const imgs = document.querySelectorAll('img');
    imgs.forEach((el, i) => {
        if (!el.dataset.kcIdx) el.dataset.kcIdx = String(i);
        const src = el.currentSrc || el.src || '';
        if (src && %s && el.naturalWidth >= 100 && !src.includes('avatar')) {
            window.__kcMap[el.dataset.kcIdx] = {src, w: el.naturalWidth, h: el.naturalHeight};
        }
    });
    return {count: imgs.length, harvested: Object.keys(window.__kcMap).length,
            top: window.__kcScroller.scrollTop, sh: window.__kcScroller.scrollHeight};
}""" % CONTENT_SRC

SCROLL_JS = "(dy) => { window.__kcScroller.scrollTop += dy; return window.__kcScroller.scrollTop; }"

EXTRACT_JS = """() => {
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
        } else if (n.tagName === 'IMG') {
            const idx = n.dataset.kcIdx;
            if (idx !== undefined && window.__kcMap[idx]) {
                chunks.push(`\\n[IMAGE_${idx}]\\n`);
            }
        } else if (['P','DIV','LI','TR','H1','H2','H3','BR'].includes(n.tagName)) {
            chunks.push('\\n');
        }
    }
    return chunks.join('');
}"""


class ByteSink:
    """截获图片响应字节,按内容 hash 去重落盘。"""

    def __init__(self, out_dir: Path):
        self.out_dir = out_dir
        self.by_url: dict[str, str] = {}    # url → filename
        self.by_hash: dict[str, str] = {}   # sha1 → filename
        out_dir.mkdir(parents=True, exist_ok=True)

    def attach(self, page):
        page.on("response", self._on)

    def _on(self, resp):
        try:
            ct = (resp.headers or {}).get("content-type", "")
            if not ct.startswith("image/"):
                return
            if resp.url in self.by_url:
                return
            body = resp.body()
            if len(body) < 4096:
                return
            h = hashlib.sha1(body).hexdigest()[:12]
            if h in self.by_hash:
                self.by_url[resp.url] = self.by_hash[h]
                return
            ext = {"image/png": "png", "image/jpeg": "jpg", "image/gif": "gif",
                   "image/webp": "webp"}.get(ct.split(";")[0], "bin")
            name = f"{len(self.by_hash):03d}_{h}.{ext}"
            (self.out_dir / name).write_bytes(body)
            self.by_hash[h] = name
            self.by_url[resp.url] = name
        except Exception:
            pass


def fetch(name: str, url: str):
    out = ROOT / "data" / "shimo" / name
    out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser, ctx = new_context(p, viewport=(1600, 2000))
        page = ctx.new_page()
        sink = ByteSink(out / "images")
        sink.attach(page)
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(10000)

        tag_info = page.evaluate(TAG_JS)
        n_imgs = tag_info["imgs"]
        # 慢滚全程(直接推 scroller.scrollTop),逐步收割
        last_y, stall = -1, 0
        for step in range(400):
            st = page.evaluate(HARVEST_JS)
            y = page.evaluate(SCROLL_JS, 1100)
            page.wait_for_timeout(700)
            if y == last_y:
                stall += 1
                if stall >= 3:
                    break
            else:
                stall = 0
            last_y = y
        page.wait_for_timeout(1500)
        st = page.evaluate(HARVEST_JS)
        print(f"[{name}] imgs={st['count']} harvested={st['harvested']} "
              f"scrollHeight={tag_info['scrollHeight']} steps={step}")

        text = page.evaluate(EXTRACT_JS)
        harvest = page.evaluate("() => window.__kcMap")
        links = collect_links(page)
        title = page.title()
        browser.close()

    text = clean_text(text)
    resolved = {}
    missing = []
    for idx, info in (harvest or {}).items():
        f = sink.by_url.get(info["src"])
        resolved[idx] = {"file": f, "w": info["w"], "h": info["h"], "src": info["src"][:120]}
        if not f:
            missing.append(idx)
    (out / "doc.txt").write_text(text)
    (out / "images.json").write_text(json.dumps(resolved, ensure_ascii=False, indent=1))
    (out / "links.json").write_text(json.dumps(links, ensure_ascii=False, indent=1))
    save_meta(out, url=url, title=title, fetched_at=datetime.datetime.now().isoformat(),
              text_chars=len(text), imgs_total=n_imgs, imgs_harvested=len(resolved),
              files_saved=len(sink.by_hash), missing=missing)
    print(f"[{name}] title={title!r} text={len(text)} chars, harvested={len(resolved)}, "
          f"files={len(sink.by_hash)}, missing_bytes={len(missing)}")


if __name__ == "__main__":
    fetch(sys.argv[1], sys.argv[2])
