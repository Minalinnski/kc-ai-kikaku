import { reactive } from "vue";
import type { AgentRun, Box, GuidePack, Master } from "./lib/types";

const LS_KEY = "kc-event-advisor";

interface PersistShape {
  apiKey: string;
  model: string;
  box: Box | null;
  run: AgentRun | null;
}

function load(): PersistShape {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { model: "claude-opus-4-8", ...JSON.parse(raw) };
  } catch {}
  return { apiKey: "", model: "claude-opus-4-8", box: null, run: null };
}

const persisted = load();

export const store = reactive({
  apiKey: persisted.apiKey,
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

export function persist() {
  try {
    const { apiKey, model, box, run } = store;
    localStorage.setItem(LS_KEY, JSON.stringify({ apiKey, model, box, run }));
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
