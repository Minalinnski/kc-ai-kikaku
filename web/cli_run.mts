// CLI 跑批:直接调用 agent 库(不经浏览器),每阶段写检查点,可断点续跑。
//   cd web && node cli_run.mts [E1 E2 ...]
// 结果:/tmp/kc_run_save.json(可直接从网页「导入存档」载入展示)
import fs from "node:fs";
import os from "node:os";

// agent.ts 的 makeClient 会引用 location(浏览器环境),CLI 下打桩为非本地直连
(globalThis as any).location = { hostname: "cli", origin: "http://cli" };

const { runAgent, estimateCost } = await import("./src/lib/agent.ts");
const { detectAndParse } = await import("./src/lib/parseBox.ts");

const KEY = (() => {
  const m = fs.readFileSync(".env", "utf8").match(/VITE_ANTHROPIC_API_KEY=(.*)/);
  if (!m) throw new Error("web/.env 缺少 VITE_ANTHROPIC_API_KEY");
  return m[1].trim();
})();

const MODEL = "claude-opus-4-8";
const MAPS = process.argv.slice(2).filter((a) => /^E\d$/.test(a));
const maps = MAPS.length ? MAPS : ["E1", "E2", "E3", "E4", "E5"];
const SAVE = "/tmp/kc_run_save.json";
const TEMP = "../temp";

const master = JSON.parse(fs.readFileSync("public/data/master.json", "utf8"));
const pack = JSON.parse(fs.readFileSync("public/data/guide.json", "utf8"));

// 导入 box(noro6 双码)
let box = null as any;
({ box } = detectAndParse(fs.readFileSync(`${TEMP}/kantai.json`, "utf8"), master, null));
({ box } = detectAndParse(fs.readFileSync(`${TEMP}/equipment.json`, "utf8"), master, box));
console.log(`box: ${box.ships.length} ships / ${box.equips.length} equips`);

// 断点续跑:已有检查点则继续
let run: any = null;
if (fs.existsSync(SAVE)) {
  try {
    const prev = JSON.parse(fs.readFileSync(SAVE, "utf8"));
    if (prev.run?.overview || Object.keys(prev.run?.maps ?? {}).length) {
      run = prev.run;
      console.log(`resume: overview=${!!run.overview} maps=[${Object.keys(run.maps)}]`);
    }
  } catch {}
}
run ??= {
  model: MODEL,
  started_at: new Date().toISOString(),
  maps: {},
  errors: {},
  usage: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
};

const t0 = Date.now();
const stageT: Record<string, number> = {};
const checkpoint = () =>
  fs.writeFileSync(SAVE, JSON.stringify({ _type: "kc-event-advisor-save", box, run }));

let lastLog: Record<string, number> = {};
const result = await runAgent(KEY, MODEL, pack, box, master, maps, {
  onStage(stage, status, detail) {
    const el = ((Date.now() - t0) / 60000).toFixed(1);
    if (status === "start") stageT[stage] = Date.now();
    const dur = stageT[stage] ? ((Date.now() - stageT[stage]) / 60000).toFixed(1) : "?";
    console.log(`[${el}min] ${stage} ${status}${status !== "start" ? ` (${dur}min)` : ""} ${detail ?? ""}`);
    checkpoint();
  },
  onProgress(stage, chars) {
    if (chars - (lastLog[stage] ?? 0) >= 10000) {
      lastLog[stage] = chars;
      console.log(`  … ${stage} ${(chars / 1000).toFixed(0)}k chars`);
    }
  },
}, run);

checkpoint();
const mins = ((Date.now() - t0) / 60000).toFixed(1);
console.log(`\nFINISHED in ${mins} min (本次进程内)`);
console.log(`overview=${!!result.overview} maps=[${Object.keys(result.maps)}] errors=`, result.errors);
console.log(`usage:`, result.usage);
console.log(`estimated cost: $${estimateCost(result, MODEL).toFixed(2)}`);
console.log(`save file: ${SAVE}`);
