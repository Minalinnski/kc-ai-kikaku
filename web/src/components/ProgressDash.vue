<script setup lang="ts">
/**
 * 运行仪表盘:流水线泳道(总览 → 五图并行 → 校验修复)+ 每阶段进度条/计时 +
 * 总耗时/用量/成本 + 活动日志。兼容三种数据源:
 *  - 新版服务器 status(带 t0/t1/events/usage/verify)
 *  - 旧版服务器 status(仅 status/chars)→ 本地补记时间戳与日志
 *  - 本地浏览器模式(store.stageStatus)
 */
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { store } from "../store";

const props = defineProps<{ status: any | null; maps: string[] }>();

const now = ref(Date.now());
let tick: ReturnType<typeof setInterval>;
onMounted(() => { tick = setInterval(() => (now.value = Date.now()), 1000); });
onUnmounted(() => clearInterval(tick));

// 进度基准(来自历史实测:总览~61k、单图20-42k、修复~20k 字符)
const BASELINE: Record<string, number> = { overview: 62000, repair: 22000, prep: 25000 };
const baseFor = (s: string) => BASELINE[s] ?? 34000;

const mapIds = computed<string[]>(() => props.status?.maps ?? props.maps);
// 并行泳道 = 逐图 + 战前布局(与图同级并行)
const laneIds = computed<string[]>(() => [...mapIds.value, "prep"]);
const stages = computed<Record<string, any>>(
  () => props.status?.stages ?? store.stageStatus ?? {},
);

// 旧版/本地模式:本地补记 t0/t1 + 合成事件流
const marks = ref<Record<string, { t0?: number; t1?: number }>>({});
const localFeed = ref<Array<{ t: number; stage: string; status: string; detail?: string | null }>>([]);
watch(
  () => Object.fromEntries(Object.entries(stages.value).map(([k, v]: any) => [k, v?.status])),
  (cur, prev) => {
    for (const [k, s] of Object.entries(cur)) {
      if (!s || prev?.[k] === s) continue;
      const m = (marks.value[k] ??= {});
      if (!m.t0) m.t0 = Date.now();
      if (s === "done" || s === "error") m.t1 ??= Date.now();
      localFeed.value.push({ t: Date.now(), stage: k, status: s as string, detail: stages.value[k]?.detail });
      if (localFeed.value.length > 100) localFeed.value.shift();
    }
  },
);

function st(s: string) { return stages.value[s] ?? {}; }
function effStatus(s: string): string {
  const x = st(s).status;
  if (x) return x;
  // 无进行中任务时,从已有结果推断(展示上一次运行的形态)
  if (s === "overview" && store.run?.overview) return "done";
  if (s === "prep" && store.run?.prep) return "done";
  if (s === "repair" && store.run?.verify?.repaired) return "done";
  if (store.run?.maps?.[s]) return "done";
  return "pending";
}
function pct(s: string): number {
  const e = effStatus(s);
  if (e === "done") return 100;
  const c = st(s).chars ?? 0;
  if (e === "pending") return 0;
  return Math.max(3, Math.min(96, Math.round((c / baseFor(s)) * 100)));
}
function stageT0(s: string): number | undefined { return st(s).t0 ?? marks.value[s]?.t0; }
function stageT1(s: string): number | undefined { return st(s).t1 ?? marks.value[s]?.t1; }
function stageElapsed(s: string): string {
  const t0 = stageT0(s);
  if (!t0) return "";
  const e = effStatus(s);
  const end = stageT1(s) ?? (e === "running" || e === "start" ? now.value : undefined);
  return end ? fmtDur(end - t0) : "";
}
function fmtDur(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
const fmtK = (n?: number) => (n ? (n / 1000).toFixed(1) + "k" : "");

// ── 顶部汇总 ──
const running = computed(() => store.running || props.status?.status === "running");
const startedAt = computed<number | null>(() => {
  if (props.status?.startedAt) return props.status.startedAt;
  if (store.run?.started_at) return Date.parse(store.run.started_at);
  return null;
});
const elapsed = computed(() => {
  if (!startedAt.value) return "";
  const end = running.value
    ? now.value
    : store.run?.finished_at
      ? Date.parse(store.run.finished_at)
      : now.value;
  return fmtDur(end - startedAt.value);
});
const allStages = computed(() => ["overview", ...mapIds.value, "prep", "repair"]);
const doneCount = computed(() => allStages.value.filter((s) => effStatus(s) === "done").length);
const totalChars = computed(() =>
  allStages.value.reduce((a, s) => a + (st(s).chars ?? 0), 0),
);
const usage = computed(() => props.status?.usage ?? store.run?.usage ?? null);
const model = computed<string>(() => props.status?.model ?? store.run?.model ?? store.model);
const cost = computed(() => {
  const u = usage.value;
  if (!u) return null;
  const p = model.value === "claude-opus-4-8"
    ? { in: 5, out: 25, cr: 0.5, cw: 6.25 }
    : { in: 3, out: 15, cr: 0.3, cw: 3.75 };
  return (u.input * p.in + u.output * p.out + u.cache_read * p.cr + u.cache_write * p.cw) / 1e6;
});
const verify = computed(() => props.status?.verify ?? store.run?.verify ?? null);

// 产出速率(全局字符/分,基于最近采样窗口)
const samples = ref<Array<{ t: number; c: number }>>([]);
watch(totalChars, (c) => {
  samples.value.push({ t: Date.now(), c });
  if (samples.value.length > 30) samples.value.shift();
});
const rate = computed(() => {
  const w = samples.value;
  if (w.length < 2) return 0;
  const dt = (w[w.length - 1].t - w[0].t) / 60000;
  return dt > 0.1 ? Math.round((w[w.length - 1].c - w[0].c) / dt) : 0;
});

// ── 活动日志 ──
const STAGE_LABEL: Record<string, string> = { overview: "总览锁船", prep: "战前布局", repair: "校验修复" };
const label = (s: string) => STAGE_LABEL[s] ?? `${s} 配装`;
const STATUS_TXT: Record<string, string> = { start: "开始", running: "生成中", done: "完成 ✓", error: "失败 ✗" };
const feed = computed(() => {
  const src: any[] = props.status?.events?.length ? props.status.events : localFeed.value;
  return [...src].reverse().slice(0, 30);
});
const fmtClock = (t: number) =>
  new Date(t).toLocaleTimeString("zh-CN", { hour12: false });

const dotClass = (s: string) => {
  const e = effStatus(s);
  return { run: e === "running" || e === "start", ok: e === "done", err: e === "error" };
};
</script>

<template>
  <div class="dash panel">
    <!-- 汇总条 -->
    <div class="dash-head">
      <span class="big mono">⏱ {{ elapsed || "—" }}</span>
      <span class="chip">阶段 {{ doneCount }}/{{ allStages.length }}</span>
      <span class="chip mono" v-if="totalChars">Σ {{ fmtK(totalChars) }} 字符</span>
      <span class="chip mono" v-if="rate && running">{{ fmtK(rate) }}/分</span>
      <span class="chip mono" v-if="cost != null">≈ ${{ cost.toFixed(2) }}</span>
      <span class="chip dim">{{ model.includes("opus") ? "Opus 4.8" : model }}</span>
      <span class="chip" v-if="verify" :class="verify.errors ? 'bad' : 'good'">
        校验 {{ verify.errors ? verify.errors + " 冲突" : "✓ 无冲突" }} · {{ verify.warns }} 提示
      </span>
      <span class="chip good" v-if="!running && doneCount === allStages.length">已完成</span>
      <span class="chip run-chip" v-else-if="running">运行中</span>
    </div>

    <!-- 流水线 -->
    <div class="pipe">
      <!-- 总览 -->
      <div class="node">
        <span class="dot" :class="dotClass('overview')"></span>
        <div class="node-body">
          <div class="node-title">
            {{ label("overview") }}
            <span class="mono dim sm">{{ fmtK(st("overview").chars) }}</span>
            <span class="mono dim sm" v-if="stageElapsed('overview')">· {{ stageElapsed("overview") }}</span>
            <span class="dim sm" v-if="st('overview').detail"> — {{ st("overview").detail }}</span>
          </div>
          <div class="bar"><div class="fill" :class="{ anim: effStatus('overview') === 'running' }" :style="{ width: pct('overview') + '%' }"></div></div>
        </div>
      </div>

      <!-- 并行泳道 -->
      <div class="lane">
        <div class="lane-tag mono">并行 ×{{ laneIds.length }}</div>
        <div class="lane-grid">
          <div v-for="m in laneIds" :key="m" class="node map-node">
            <span class="dot" :class="dotClass(m)"></span>
            <div class="node-body">
              <div class="node-title">
                {{ m === "prep" ? "战前布局" : m }}
                <span class="mono dim sm">{{ fmtK(st(m).chars) }}</span>
                <span class="mono dim sm" v-if="stageElapsed(m)">· {{ stageElapsed(m) }}</span>
              </div>
              <div class="bar"><div class="fill" :class="{ anim: effStatus(m) === 'running' }" :style="{ width: pct(m) + '%' }"></div></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 校验修复 -->
      <div class="node">
        <span class="dot" :class="dotClass('repair')"></span>
        <div class="node-body">
          <div class="node-title">
            {{ label("repair") }}
            <span class="mono dim sm">{{ fmtK(st("repair").chars) }}</span>
            <span class="mono dim sm" v-if="stageElapsed('repair')">· {{ stageElapsed("repair") }}</span>
            <span class="dim sm" v-if="st('repair').detail"> — {{ st("repair").detail }}</span>
          </div>
          <div class="bar"><div class="fill" :class="{ anim: effStatus('repair') === 'running' }" :style="{ width: pct('repair') + '%' }"></div></div>
        </div>
      </div>
    </div>

    <!-- 活动日志 -->
    <div class="feed" v-if="feed.length">
      <div class="feed-title mono">活动日志</div>
      <div v-for="(e, i) in feed" :key="i" class="feed-row mono">
        <span class="dim">{{ fmtClock(e.t) }}</span>
        <span :class="{ ok: e.status === 'done', err: e.status === 'error' }">
          {{ label(e.stage) }} {{ STATUS_TXT[e.status] ?? e.status }}</span>
        <span class="dim" v-if="e.detail">— {{ e.detail }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dash { margin-top: 14px; }
.mono { font-family: var(--mono); }
.dim { color: var(--text-dim); }
.sm { font-size: 11px; }
.ok { color: var(--ok); }
.err { color: var(--error); }

.dash-head {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  padding-bottom: 12px; border-bottom: 1px solid var(--hairline); margin-bottom: 14px;
}
.dash-head .big { font-size: 20px; color: var(--brass-soft); letter-spacing: 0.04em; }
.chip {
  font-size: 12px; padding: 2px 9px; border: 1px solid var(--border);
  border-radius: 20px; background: var(--panel2); white-space: nowrap;
}
.chip.good { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 40%, transparent); }
.chip.bad { color: var(--error); border-color: color-mix(in srgb, var(--error) 40%, transparent); }
.run-chip { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 45%, transparent); animation: pulse 1.6s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: 0.45; } }

.pipe { position: relative; padding-left: 7px; }
.pipe::before {
  content: ""; position: absolute; left: 12px; top: 10px; bottom: 10px;
  width: 2px; background: var(--hairline);
}
.node { display: flex; gap: 10px; align-items: flex-start; position: relative; padding: 7px 0; }
.dot {
  width: 12px; height: 12px; border-radius: 50%; margin-top: 3px; flex: none;
  background: var(--panel2); border: 2px solid var(--border); z-index: 1;
}
.dot.run { border-color: var(--warn); background: color-mix(in srgb, var(--warn) 35%, var(--panel2)); animation: pulse 1.2s ease-in-out infinite; }
.dot.ok { border-color: var(--ok); background: color-mix(in srgb, var(--ok) 45%, var(--panel2)); }
.dot.err { border-color: var(--error); background: color-mix(in srgb, var(--error) 45%, var(--panel2)); }
.node-body { flex: 1; min-width: 0; }
.node-title { font-size: 13px; display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap; }
.bar {
  height: 6px; margin-top: 5px; border-radius: 4px; overflow: hidden;
  background: var(--panel2); border: 1px solid var(--hairline);
}
.fill {
  height: 100%; border-radius: 4px; background: var(--brass);
  transition: width 0.8s ease;
}
.fill.anim {
  background: repeating-linear-gradient(-45deg, var(--brass), var(--brass) 8px, var(--brass-soft) 8px, var(--brass-soft) 16px);
  background-size: 200% 100%;
  animation: slide 1.2s linear infinite;
}
@keyframes slide { to { background-position: -23px 0; } }

.lane {
  margin: 4px 0 4px 24px; padding: 8px 10px 4px;
  border: 1px dashed var(--border); border-radius: 8px; position: relative;
  background: color-mix(in srgb, var(--panel2) 40%, transparent);
}
.lane-tag {
  position: absolute; top: -9px; left: 10px; font-size: 10px; letter-spacing: 0.18em;
  color: var(--brass); background: var(--panel); padding: 0 7px;
}
.lane-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); column-gap: 18px; }
.map-node { padding: 5px 0; }
.lane .dot { width: 10px; height: 10px; }

.feed { margin-top: 14px; border-top: 1px solid var(--hairline); padding-top: 10px; }
.feed-title { font-size: 10px; letter-spacing: 0.22em; color: var(--brass); text-transform: uppercase; margin-bottom: 6px; }
.feed-row { font-size: 11.5px; line-height: 1.8; display: flex; gap: 10px; flex-wrap: wrap; }
.feed { max-height: 220px; overflow-y: auto; }
</style>
