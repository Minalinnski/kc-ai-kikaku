<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { store, persist, apiKey } from "../store";
import { runAgent, estimateCost } from "../lib/agent";

const emit = defineEmits<{ done: [] }>();

const MAPS = ["E1", "E2", "E3", "E4", "E5"];
const selectedMaps = ref([...MAPS]);
const globalError = ref("");
const base = import.meta.env.BASE_URL;

const canRun = computed(
  () => !!apiKey() && !!store.box?.ships.length && !!store.box?.equips.length && !store.running,
);

const stages = computed(() => ["overview", ...selectedMaps.value, "repair"]);

function stageLabel(s: string) {
  if (s === "overview") return "锁船总方案(通读攻略+全box)";
  if (s === "repair") return "机器校验 + 自动修复";
  return `${s} 逐阶段配装`;
}

// ── 服务器模式:发起 job + 轮询(关页无损,回来自动恢复) ──
let pollTimer: ReturnType<typeof setTimeout> | null = null;

async function serverRun(fresh: boolean) {
  globalError.value = "";
  store.stageStatus = {};
  const r = await fetch(base + "api/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ box: store.box, model: store.model, maps: selectedMaps.value, fresh }),
  });
  if (!r.ok) {
    globalError.value = (await r.json().catch(() => ({}) as any)).error ?? `启动失败(${r.status})`;
    return;
  }
  store.running = true;
  pollStatus();
}

async function pollStatus() {
  if (pollTimer) clearTimeout(pollTimer);
  try {
    const r = await fetch(base + "api/run/status");
    if (r.ok) {
      const st = await r.json();
      if (st.stages) store.stageStatus = st.stages;
      if (st.status === "running") {
        store.running = true;
        pollTimer = setTimeout(pollStatus, 4000);
        return;
      }
      if (st.status === "done" || st.status === "error") {
        if (st.error) globalError.value = st.error;
        const lr = await fetch(base + "api/latest-run");
        if (lr.ok) {
          const data = await lr.json();
          if (data?.run) {
            store.run = data.run;
            persist();
          }
        }
        store.running = false;
        if (st.status === "done") emit("done");
        return;
      }
    }
  } catch {}
  store.running = false;
}

onMounted(() => {
  if (store.server) {
    fetch(base + "api/run/status")
      .then(async (r) => {
        if (!r.ok) return;
        const st = await r.json();
        if (st.status === "running") {
          store.stageStatus = st.stages ?? {};
          store.running = true;
          pollStatus();
        }
      })
      .catch(() => {});
  }
});
onUnmounted(() => {
  if (pollTimer) clearTimeout(pollTimer);
});

// ── 本地模式:浏览器内执行(dev/.env) ──
async function localRun(fresh: boolean) {
  if (!apiKey() || !store.box || !store.master || !store.pack) return;
  globalError.value = "";
  store.running = true;
  store.stageStatus = {};
  if (fresh || !store.run) {
    store.run = {
      model: store.model,
      started_at: new Date().toISOString(),
      maps: {},
      errors: {},
      usage: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
    };
  }
  try {
    const result = await runAgent(
      apiKey(), store.model, store.pack, store.box, store.master, selectedMaps.value,
      {
        onStage(stage, status, detail) {
          store.stageStatus = { ...store.stageStatus, [stage]: { ...store.stageStatus[stage], status, detail } };
          persist();
        },
        onProgress(stage, chars) {
          store.stageStatus = { ...store.stageStatus, [stage]: { ...store.stageStatus[stage], status: "running", chars } };
        },
      },
      store.run,
    );
    store.run = result;
    persist();
    if (result.overview && !Object.keys(result.errors).length) emit("done");
  } catch (e) {
    globalError.value = String((e as Error).message ?? e);
  } finally {
    store.running = false;
  }
}

function run(fresh: boolean) {
  return store.server ? serverRun(fresh) : localRun(fresh);
}

const cost = computed(() => (store.run ? estimateCost(store.run, store.run.model) : 0));
const hasPartial = computed(
  () => store.run && (Object.keys(store.run.errors).length > 0 || selectedMaps.value.some((m) => !store.run!.maps[m])),
);
</script>

<template>
  <div>
    <div class="panel">
      <h2 style="margin-top: 0">运行 AI 分析</h2>
      <p>
        Agent 通读攻略全文(锁船表/多号机表/倍卡表/全部 noro6 配装/敌配置/昵称对照)和你的完整 Box:
        先产出<b>锁船总方案</b>,再全并行生成<b>各图阶段配装</b>,最后<b>机器校验 + 自动修复</b>硬冲突。
        全程 15~25 分钟,成本约 <b>$5~8</b>(Opus)/ <b>$2~4</b>(Sonnet)。
        <template v-if="store.server"><b class="ok">任务在服务器运行,可以关闭页面,回来自动接上进度。</b></template>
        <template v-else><span class="warn">本地模式:请保持页面打开。</span></template>
      </p>
      <p>
        分析海域:
        <label v-for="m in MAPS" :key="m" style="margin-right: 10px">
          <input type="checkbox" v-model="selectedMaps" :value="m" :disabled="store.running" /> {{ m }}
        </label>
      </p>
      <p v-if="!store.box?.ships.length" class="warn">请先在「① 导入 Box」导入舰娘数据。</p>
      <p v-else-if="!store.box?.equips.length" class="warn">尚未导入装备列表,请回到「① 导入 Box」补充。</p>
      <p v-if="!apiKey()" class="warn">未检测到 API 通道——服务器模式请先登录;本地模式请按 README 配置 web/.env。</p>

      <div style="display: flex; gap: 10px">
        <button :disabled="!canRun" @click="run(true)">
          {{ store.running ? "运行中…" : store.run ? "重新完整分析" : "开始分析" }}
        </button>
        <button v-if="hasPartial && !store.running" class="secondary" @click="run(false)">
          继续未完成的部分
        </button>
      </div>
      <p v-if="globalError" class="err">✗ {{ globalError }}</p>
    </div>

    <div class="panel" v-if="store.running || store.run || Object.keys(store.stageStatus).length">
      <h3 style="margin-top: 0">进度</h3>
      <div v-for="s in stages" :key="s" class="stage-row">
        <div
          class="stage-dot"
          :class="{
            running: store.stageStatus[s]?.status === 'running' || store.stageStatus[s]?.status === 'start',
            done: store.stageStatus[s]?.status === 'done' || (s === 'overview' ? !!store.run?.overview : s !== 'repair' && !!store.run?.maps[s]),
            error: store.stageStatus[s]?.status === 'error',
          }"
        ></div>
        <div style="flex: 1">
          {{ stageLabel(s) }}
          <span v-if="store.stageStatus[s]?.chars" class="dim">
            — 已生成 {{ (store.stageStatus[s].chars! / 1000).toFixed(1) }}k 字符</span>
          <span v-if="store.stageStatus[s]?.detail" class="dim"> — {{ store.stageStatus[s].detail }}</span>
          <span v-if="store.run?.errors[s]" class="err"> — {{ store.run.errors[s] }}</span>
        </div>
      </div>
      <p v-if="store.run" class="dim" style="margin-bottom: 0">
        <template v-if="store.run.verify">
          校验:<b :class="store.run.verify.errors ? 'err' : 'ok'">{{ store.run.verify.errors }} 硬冲突</b>
          / {{ store.run.verify.warns }} 提示<span v-if="store.run.verify.repaired">(已自动修复)</span> ·
        </template>
        Token:输入 {{ (store.run.usage.input / 1000).toFixed(0) }}k · 缓存读
        {{ (store.run.usage.cache_read / 1000).toFixed(0) }}k · 缓存写
        {{ (store.run.usage.cache_write / 1000).toFixed(0) }}k · 输出
        {{ (store.run.usage.output / 1000).toFixed(0) }}k · 估算成本 ${{ cost.toFixed(2) }} ·
        模型 {{ store.run.model }}
      </p>
    </div>
  </div>
</template>
