<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { store, persist, apiKey } from "../store";
import { runAgent } from "../lib/agent";
import ProgressDash from "./ProgressDash.vue";

const emit = defineEmits<{ done: [] }>();

const MAPS = ["E1", "E2", "E3", "E4", "E5"];
const selectedMaps = ref([...MAPS]);
const globalError = ref("");
const base = import.meta.env.BASE_URL;

const canRun = computed(
  () => !!apiKey() && !!store.box?.ships.length && !!store.box?.equips.length && !store.running,
);


// ── 服务器模式:发起 job + 轮询(关页无损,回来自动恢复) ──
let pollTimer: ReturnType<typeof setTimeout> | null = null;
const serverStatus = ref<any | null>(null);

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
      serverStatus.value = st;
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
        serverStatus.value = st;
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

    <ProgressDash
      v-if="store.running || store.run || Object.keys(store.stageStatus).length"
      :status="serverStatus"
      :maps="selectedMaps"
    />
    <p v-if="store.run && Object.keys(store.run.errors).length" class="err">
      <span v-for="(msg, s) in store.run.errors" :key="s">✗ {{ s }}:{{ msg }}<br /></span>
    </p>
  </div>
</template>
