import { reactive } from "vue";
import type { AgentRun, Box, GuidePack, Master } from "./lib/types";

const LS_KEY = "kc-event-advisor";

interface PersistShape {
  model: string;
  box: Box | null;
  run: AgentRun | null;
}

function load(): PersistShape {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { model: "claude-opus-4-8", ...JSON.parse(raw) };
  } catch {}
  return { model: "claude-opus-4-8", box: null, run: null };
}

const persisted = load();

/** 封板静态导出:构建产物内嵌 window.__SNAPSHOT__ = {user, generated_at, box, run, master, pack} */
const SNAP: any = (globalThis as any).__SNAPSHOT__ ?? null;

/** 占位 key:真实 key 永远不进前端 —— 由本地 vite 代理(.env)或自托管服务器注入 */
export const SERVER_KEY = "__server__";
export const PROXY_KEY = "__proxy__";

export const store = reactive({
  manualKey: "", // 仅存内存,刷新即失
  model: persisted.model,
  box: (SNAP?.box ?? persisted.box) as Box | null,
  run: (SNAP?.run ?? persisted.run) as AgentRun | null,
  master: null as Master | null,
  pack: null as GuidePack | null,
  snapshot: !!SNAP,
  snapshotMeta: SNAP ? { user: SNAP.user as string, generated_at: SNAP.generated_at as string } : null,
  loading: true,
  loadError: "",
  running: false,
  stageStatus: {} as Record<string, { status: string; detail?: string; chars?: number }>,
  // 自托管服务器模式
  server: false,
  authed: false,
  user: "" as string | null,
  // 本地 vite 代理已配置 .env key
  proxyKey: false,
});

export function apiKey(): string {
  if (store.server) return store.authed ? SERVER_KEY : "";
  if (store.proxyKey) return PROXY_KEY;
  return store.manualKey.trim();
}

export async function probeServer() {
  if (store.snapshot) return;
  try {
    const r = await fetch(import.meta.env.BASE_URL + "api/me");
    if (r.ok) {
      const me = await r.json();
      if (me && me.server) {
        store.server = true;
        store.authed = !!me.auth;
        store.user = me.user;
        return;
      }
    }
  } catch {}
  // 非自托管:探测本地 vite 代理是否配置了 .env key
  try {
    const r = await fetch(location.origin + "/anthropic/v1/models?limit=1", {
      headers: { "x-api-key": PROXY_KEY, "anthropic-version": "2023-06-01" },
    });
    if (r.ok) store.proxyKey = true;
  } catch {}
}

export async function login(user: string, pass: string): Promise<string> {
  const r = await fetch(import.meta.env.BASE_URL + "api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user, pass }),
  });
  const data = await r.json().catch(() => ({}));
  if (r.ok && data.ok) {
    store.authed = true;
    store.user = data.user;
    return "";
  }
  return data.error ?? `登录失败(${r.status})`;
}

export async function logout() {
  await fetch(import.meta.env.BASE_URL + "api/logout", { method: "POST" }).catch(() => {});
  store.authed = false;
  store.user = null;
}

/** 本地没有结果时,自动载入服务器上最近一次跑批(cli_run.mts 产物) */
export async function loadLatestRun() {
  if (!store.server || !store.authed || store.run) return;
  try {
    const r = await fetch(import.meta.env.BASE_URL + "api/latest-run");
    if (!r.ok) return;
    const data = await r.json();
    if (data?._type === "kc-event-advisor-save" && data.run?.overview) {
      if (!store.box && data.box) store.box = data.box;
      store.run = data.run;
      persist();
      console.log("已自动载入服务器跑批结果");
    }
  } catch {}
}

export function persist() {
  if (store.snapshot) return;
  try {
    const { model, box, run } = store;
    localStorage.setItem(LS_KEY, JSON.stringify({ model, box, run }));
  } catch (e) {
    console.warn("localStorage persist failed", e);
  }
}

export async function loadStatic() {
  if (SNAP) {
    store.master = SNAP.master;
    store.pack = SNAP.pack;
    store.loading = false;
    return;
  }
  try {
    const base = import.meta.env.BASE_URL;
    const [master, pack] = await Promise.all([
      fetch(base + "data/master.json").then((r) => {
        if (!r.ok) throw new Error("master.json " + r.status);
        return r.json();
      }),
      fetch(base + "data/guide.json").then((r) => {
        if (!r.ok) throw new Error("guide.json " + r.status);
        return r.json();
      }),
    ]);
    store.master = master;
    store.pack = pack;
  } catch (e) {
    store.loadError = "静态数据加载失败:" + (e as Error).message;
  } finally {
    store.loading = false;
  }
}
