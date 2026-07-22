"""石墨文档抓取公共工具:浏览器上下文 + 慢滚动 + 图片响应截获。"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

# 石墨页面 chrome 噪声行(导出正文时剔除)
CHROME_LINES = {
    "文档将自动保存", "注册", "登录", "分享", "目录", "一 阅",
    "提交反馈以帮助我们改进", "石墨文档",
}


def new_context(p, viewport=(1600, 2400)):
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(
        user_agent=UA, locale="zh-CN",
        viewport={"width": viewport[0], "height": viewport[1]},
    )
    return browser, ctx


def slow_scroll(page, step=1200, pause_ms=350, max_steps=120):
    """滚到底,触发懒加载。返回滚动步数。"""
    last_y = -1
    for i in range(max_steps):
        page.mouse.wheel(0, step)
        page.wait_for_timeout(pause_ms)
        y = page.evaluate("() => window.scrollY || document.scrollingElement?.scrollTop || 0")
        if y == last_y and i > 3:
            break
        last_y = y
    return last_y


class ImageSink:
    """截获 response 里的图片字节(带鉴权/referer 的图片直连下载常失败,截获最稳)。"""

    def __init__(self, out_dir: Path, min_bytes=4096):
        self.out_dir = out_dir
        self.min_bytes = min_bytes
        self.url_to_file: dict[str, str] = {}
        out_dir.mkdir(parents=True, exist_ok=True)

    def attach(self, page):
        page.on("response", self._on_response)

    def _on_response(self, resp):
        try:
            ct = (resp.headers or {}).get("content-type", "")
            if not ct.startswith("image/"):
                return
            if resp.url in self.url_to_file:
                return
            body = resp.body()
            if len(body) < self.min_bytes:
                return
            ext = {"image/png": "png", "image/jpeg": "jpg", "image/gif": "gif",
                   "image/webp": "webp"}.get(ct.split(";")[0], "bin")
            h = hashlib.sha1(resp.url.encode()).hexdigest()[:10]
            name = f"{len(self.url_to_file):03d}_{h}.{ext}"
            (self.out_dir / name).write_bytes(body)
            self.url_to_file[resp.url] = name
        except Exception:
            pass


def extract_text_with_markers(page):
    """遍历 DOM,产出带 [IMAGE_N] 标记的正文 + 图片 src 顺序表(仿 kckit import_nga)。"""
    return page.evaluate(
        """() => {
        const imgs = [];
        const chunks = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ALL, {
            acceptNode(node) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const st = getComputedStyle(node);
                    if (st.display === 'none' || st.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
                    const tag = node.tagName;
                    if (['SCRIPT','STYLE','NOSCRIPT','HEADER','NAV'].includes(tag)) return NodeFilter.FILTER_REJECT;
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
                const src = n.currentSrc || n.src || '';
                if (src && !src.startsWith('data:')) {
                    chunks.push(`\\n[IMAGE_${imgs.length}]\\n`);
                    imgs.push({src, w: n.naturalWidth, h: n.naturalHeight});
                }
            } else if (['P','DIV','LI','TR','H1','H2','H3','BR'].includes(n.tagName)) {
                chunks.push('\\n');
            }
        }
        return {text: chunks.join(''), images: imgs};
    }"""
    )


def clean_text(text: str) -> str:
    lines = [l.rstrip() for l in text.split("\n")]
    out = []
    for l in lines:
        if l.strip() in CHROME_LINES:
            continue
        out.append(l)
    s = "\n".join(out)
    s = re.sub(r"\n{4,}", "\n\n\n", s)
    return s.strip()


def collect_links(page):
    return page.eval_on_selector_all(
        "a[href]",
        "els => els.map(e => ({href: e.href, text: (e.innerText||'').trim().slice(0,100)}))",
    )


def save_meta(out_dir: Path, **kw):
    (out_dir / "meta.json").write_text(json.dumps(kw, ensure_ascii=False, indent=1))
