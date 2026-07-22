// 本地冒烟:语料/box 组装检查(不调 API)。运行:node smoke.ts
// 若设置 ANTHROPIC_API_KEY 且带 --count 参数,会调用免费的 count_tokens 端点精确计数。
import fs from "node:fs";
import os from "node:os";
import { renderGuideCorpus } from "./src/lib/agent.ts";
import { detectAndParse, compactBoxText } from "./src/lib/parseBox.ts";

const master = JSON.parse(fs.readFileSync("public/data/master.json", "utf8"));
const pack = JSON.parse(fs.readFileSync("public/data/guide.json", "utf8"));

const corpus = renderGuideCorpus(pack);
console.log("guide corpus chars:", corpus.length);
fs.writeFileSync("/tmp/kc_corpus.txt", corpus);

const boxPath = os.homedir() + "/.kckit/box_snapshot.json";
if (fs.existsSync(boxPath)) {
  const { box, message } = detectAndParse(fs.readFileSync(boxPath, "utf8"), master, null);
  console.log("box import:", message, box.ships.length, "ships /", box.equips.length, "equips");
  const boxText = compactBoxText(box, master);
  console.log("box text chars:", boxText.length);
  fs.writeFileSync("/tmp/kc_boxtext.txt", boxText);
}

if (process.argv.includes("--count") && process.env.ANTHROPIC_API_KEY) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const ct = await client.messages.countTokens({
    model: "claude-opus-4-8",
    messages: [{ role: "user", content: corpus }],
  });
  console.log("corpus tokens:", ct.input_tokens);
}
