"""用 Claude 视觉转录攻略配图 → data/extracted/image_notes.json(增量)。

攻略更新后,新出现的配图(陆航配置/倍卡表/编成截图等)跑这个脚本自动转录;
已有转录的序号会跳过(--force 重转全部)。需要 ANTHROPIC_API_KEY。

用法:
    python pipeline/transcribe_images.py            # 只转录缺失的
    python pipeline/transcribe_images.py 49 62      # 指定 [IMAGE_n] 序号
"""
from __future__ import annotations

import base64
import json
import re
import sys
from pathlib import Path

import anthropic

ROOT = Path(__file__).resolve().parent.parent
MAIN = ROOT / "data" / "shimo" / "main"
NOTES_F = ROOT / "data" / "extracted" / "image_notes.json"

MODEL = "claude-opus-4-8"

SYSTEM = """你是舰队Collection攻略图片转录员。输入是攻略文档里的一张配图及其上下文,输出一段中文转录文本,格式:【图片类型】+ 内容。
规则:
- 陆航/基地航空队截图:逐队列出(半径/制空值/4个机位装备名含改修星级/预期制空状态)。
- 编成截图:逐舰列出(舰名/等级/逐槽装备含星级),分舰队分组。
- 倍卡表/数据表:按分组转录成员与倍率,数值看不清标注(?)。
- 路线图:只概括(节点字母与航程数字如可读)。
- 装饰图/logo:一句话说明。
只输出转录文本本身,不要解释。看不清的部分明确标注。"""

MEDIA = {"webp": "image/webp", "png": "image/png", "jpg": "image/jpeg", "gif": "image/gif"}


def section_context(doc: str, idx: str) -> str:
    pos = doc.find(f"[IMAGE_{idx}]")
    if pos < 0:
        return ""
    return doc[max(0, pos - 400) : pos + 100]


def main():
    doc = (MAIN / "doc.txt").read_text()
    images = json.loads((MAIN / "images.json").read_text())
    notes = json.loads(NOTES_F.read_text()) if NOTES_F.exists() else {}

    force = "--force" in sys.argv
    wanted = [a for a in sys.argv[1:] if a.isdigit()]
    all_ids = sorted(
        (m.group(1) for m in re.finditer(r"\[IMAGE_(\d+)\]", doc)), key=int
    )
    targets = wanted or [i for i in all_ids if force or i not in notes]
    if not targets:
        print("无需转录(全部已有);--force 可重转")
        return

    client = anthropic.Anthropic()
    for idx in targets:
        info = images.get(idx)
        if not info or not info.get("file"):
            print(f"[{idx}] 无图片文件,跳过")
            continue
        f = MAIN / "images" / info["file"]
        ext = f.suffix.lstrip(".")
        data = base64.standard_b64encode(f.read_bytes()).decode()
        ctx = section_context(doc, idx)
        resp = client.messages.create(
            model=MODEL,
            max_tokens=4096,
            system=SYSTEM,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": f"上下文(图片在文档中的位置):\n…{ctx}…\n\n请转录这张图:"},
                    {"type": "image", "source": {"type": "base64",
                     "media_type": MEDIA.get(ext, "image/png"), "data": data}},
                ],
            }],
        )
        text = next((b.text for b in resp.content if b.type == "text"), "").strip()
        notes[idx] = text
        print(f"[{idx}] {info['file']} → {len(text)} chars")

    NOTES_F.write_text(json.dumps(notes, ensure_ascii=False, indent=1))
    print(f"已写入 {NOTES_F}(共 {len([k for k in notes if k != '_meta'])} 条)")


if __name__ == "__main__":
    main()
