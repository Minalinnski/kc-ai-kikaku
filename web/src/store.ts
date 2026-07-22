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

/** API Key 来源:.env(VITE_ANTHROPIC_API_KEY,推荐)> 会话内手动填写(不落盘) */
export const envKey: string = (import.meta.env.VITE_ANTHROPIC_API_KEY ?? "").trim();

export const store = reactive({
  manualKey: "", // 仅存内存,刷新即失
  model: persisted.model,
  box: persisted.box as Box | null,
  run: persisted.run as AgentRun | null,
  master: null as Master | null,
  pack: null as GuidePack | null,
  loading: true,
  loadError: "",
  running: false,
  stageStatus: {} as Record<string, { status: string; detail?: string; chars?: number }>,
});

export function apiKey(): string {
  return envKey || store.manualKey.trim();
}

export function persist() {
  try {
    const { model, box, run } = store;
    localStorage.setItem(LS_KEY, JSON.stringify({ model, box, run }));
  } catch (e) {
    console.warn("localStorage persist failed", e);
  }
}

export async function loadStatic() {
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
