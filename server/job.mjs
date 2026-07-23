/**
 * 服务端 agent job 管理:每用户一个任务,进度内存态+检查点落盘,日配额。
 * agent 逻辑直接复用 web/src/lib/agent.ts(node 类型擦除加载)。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createJobManager({ apiKey, root, quotaPerDay = 4 }) {
  const runsDir = join(__dirname, "runs");
  mkdirSync(runsDir, { recursive: true });
  const quotaFile = join(runsDir, "_quota.json");
  const quota = existsSync(quotaFile) ? JSON.parse(readFileSync(quotaFile, "utf8")) : {};
  const jobs = new Map(); // user → job

  const master = JSON.parse(readFileSync(join(root, "web/public/data/master.json"), "utf8"));
  const pack = JSON.parse(readFileSync(join(root, "web/public/data/guide.json"), "utf8"));

  let libPromise = null;
  function lib() {
    if (!libPromise) {
      globalThis.location ??= { hostname: "server", origin: "http://server" };
      libPromise = import("../web/src/lib/agent.ts");
    }
    return libPromise;
  }

  const savePath = (user) => join(runsDir, `${user}.json`);

  function loadSave(user) {
    try {
      if (existsSync(savePath(user))) return JSON.parse(readFileSync(savePath(user), "utf8"));
    } catch {}
    return null;
  }

  async function start(user, { box, model, maps, fresh }) {
    if (!box?.ships?.length || !box?.equips?.length) {
      throw { code: 400, msg: "box 缺少舰娘或装备" };
    }
    if (jobs.get(user)?.status === "running") throw { code: 409, msg: "已有任务在运行中" };
    const today = new Date().toISOString().slice(0, 10);
    quota[user] ??= {};
    if ((quota[user][today] ?? 0) >= quotaPerDay) {
      throw { code: 429, msg: `今日运行额度已用完(${quotaPerDay} 次/天)` };
    }

    let run = null;
    if (!fresh) {
      const prev = loadSave(user);
      if (prev?.run?.overview || Object.keys(prev?.run?.maps ?? {}).length) run = prev.run;
    }
    run ??= {
      model,
      started_at: new Date().toISOString(),
      maps: {},
      errors: {},
      usage: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
    };

    const job = { status: "running", stages: {}, startedAt: Date.now(), model, maps, error: null };
    jobs.set(user, job);
    quota[user][today] = (quota[user][today] ?? 0) + 1;
    writeFileSync(quotaFile, JSON.stringify(quota));

    (async () => {
      try {
        const { runAgent } = await lib();
        const checkpoint = () =>
          writeFileSync(savePath(user), JSON.stringify({ _type: "kc-event-advisor-save", box, run }));
        checkpoint();
        const result = await runAgent(apiKey, model, pack, box, master, maps, {
          onStage(stage, status, detail) {
            job.stages = { ...job.stages, [stage]: { ...job.stages[stage], status, detail } };
            checkpoint();
            console.log(`[job:${user}] ${stage} ${status} ${detail ?? ""}`);
          },
          onProgress(stage, chars) {
            job.stages = { ...job.stages, [stage]: { ...job.stages[stage], status: "running", chars } };
          },
        }, run);
        run = result;
        checkpoint();
        const failed = Object.keys(result.errors ?? {}).length;
        job.status = failed ? "error" : "done";
        job.error = failed ? Object.values(result.errors).join("; ") : null;
        console.log(`[job:${user}] ${job.status} usage=${JSON.stringify(result.usage)}`);
      } catch (e) {
        job.status = "error";
        job.error = String(e?.message ?? e);
        console.error(`[job:${user}] crashed:`, job.error);
      }
    })();

    return { started: true };
  }

  function status(user) {
    const j = jobs.get(user);
    if (!j) return { status: "idle", hasRun: existsSync(savePath(user)) };
    return {
      status: j.status, stages: j.stages, startedAt: j.startedAt,
      model: j.model, maps: j.maps, error: j.error, hasRun: existsSync(savePath(user)),
    };
  }

  function latest(user) {
    return existsSync(savePath(user)) ? readFileSync(savePath(user)) : null;
  }

  return { start, status, latest };
}
