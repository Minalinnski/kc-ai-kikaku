"""从攻略语料自动蒸馏「中文昵称 → 图鉴舰名」别名库(证据对齐法)。

原理:攻略正文的昵称(如"鸭""蜜瓜""3V")与 noro6 机读配置、锁船表原文出现在
相同的战术位置上,让 Claude 只输出**有语料证据**的映射,并逐条给出证据;
产物再用 master 图鉴名单校验,匹配不上的丢弃。杜绝"AWW=秋津洲"式的音译瞎猜。

需要 API key(web/.env 或 ANTHROPIC_API_KEY)。产物: data/extracted/cn_aliases.json
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

import anthropic

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "extracted" / "cn_aliases.json"
MODEL = "claude-opus-4-8"


def get_key() -> str:
    if os.environ.get("ANTHROPIC_API_KEY"):
        return os.environ["ANTHROPIC_API_KEY"]
    envf = ROOT / "web" / ".env"
    m = re.search(r"VITE_ANTHROPIC_API_KEY=(.+)", envf.read_text())
    if not m:
        raise SystemExit("需要 ANTHROPIC_API_KEY 或 web/.env")
    return m.group(1).strip()


SYSTEM = """你是舰队Collection中文社区黑话考据员。给你:①活动攻略全文 ②锁船表/多号机表转录 ③攻略内全部noro6配装的机读数据(精确舰名)。
任务:找出攻略中出现的所有**舰娘中文昵称/简称/黑话**,输出到官方日文舰名(不含改造后缀的基础名)的映射。
铁律:
- 每条映射必须有语料内证据(该昵称出现的原句 + 对应noro6配置或锁船表原文中的精确舰名),没有证据的宁可不输出;
- 禁止音译/联想猜测;禁止输出装备昵称(只要舰);
- canonical 必须是图鉴基础舰名(如「阿武隈」「三隈」「Richelieu」),不带改/改二。
输出 JSON:{"aliases":[{"alias":"鸭","canonical":"Iowa","evidence":"原文『武藏/鸭iowa』+noro6配置Iowa改"}]}"""


def main():
    client = anthropic.Anthropic(api_key=get_key())
    pack = json.loads((ROOT / "web" / "public" / "data" / "guide.json").read_text())
    master = json.loads((ROOT / "data" / "master_full.json").read_text())

    noro6_txt = []
    for code, cfg in pack["noro6"].items():
        ships = [s["name"] for f in cfg["summary"]["fleets"] for s in f]
        noro6_txt.append(f"[{cfg['section']}] {' / '.join(ships)}")

    corpus = (
        "# 锁船表转录\n" + json.dumps(pack["lock_table"]["tags"], ensure_ascii=False)
        + "\n\n# 多号机表转录\n" + json.dumps(pack["dup_table"]["by_owned_count"], ensure_ascii=False)
        + "\n\n# noro6 机读配置(精确舰名)\n" + "\n".join(noro6_txt)
        + "\n\n# 攻略正文\n" + pack["main_text"]
    )

    with client.messages.stream(
        model=MODEL,
        max_tokens=32000,
        thinking={"type": "adaptive"},
        system=SYSTEM,
        output_config={"format": {"type": "json_schema", "schema": {
            "type": "object", "additionalProperties": False, "required": ["aliases"],
            "properties": {"aliases": {"type": "array", "items": {
                "type": "object", "additionalProperties": False,
                "required": ["alias", "canonical", "evidence"],
                "properties": {"alias": {"type": "string"}, "canonical": {"type": "string"},
                               "evidence": {"type": "string"}}}}}}}},
        messages=[{"role": "user", "content": corpus}],
    ) as stream:
        resp = stream.get_final_message()
    print("stop_reason:", resp.stop_reason, "| blocks:", [b.type for b in resp.content])
    text = "".join(b.text for b in resp.content if b.type == "text")
    if not text:
        raise SystemExit(f"无文本输出 stop_reason={resp.stop_reason}")
    Path("/tmp/aliases_raw.txt").write_text(text)
    aliases = json.loads(text)["aliases"]

    # master 校验:canonical 必须能在图鉴中找到(基础名或任意形态前缀)
    names = {s["name"] for s in master["ships"].values() if not s.get("enemy")}
    ok, dropped = [], []
    for a in aliases:
        c = a["canonical"].strip()
        if c in names or any(n.startswith(c) for n in names):
            ok.append(a)
        else:
            dropped.append(a)
    OUT.write_text(json.dumps({"_meta": {"source": "语料证据对齐蒸馏", "model": MODEL},
                               "aliases": ok}, ensure_ascii=False, indent=1))
    print(f"aliases: {len(ok)} 收录, {len(dropped)} 因图鉴校验失败丢弃")
    for d in dropped:
        print("  dropped:", d["alias"], "→", d["canonical"])
    print(f"usage: in={resp.usage.input_tokens} out={resp.usage.output_tokens}")


if __name__ == "__main__":
    main()
