<script setup lang="ts">
import { ref, computed } from "vue";
import { store, persist, apiKey } from "../store";
import { runAgent, estimateCost } from "../lib/agent";

const emit = defineEmits<{ done: [] }>();

const MAPS = ["E1", "E2", "E3", "E4", "E5"];
const selectedMaps = ref([...MAPS]);
const globalError = ref("");

const canRun = computed(
  () => !!apiKey() && !!store.box?.ships.length && !!store.box?.equips.length && !store.running,
);

const stages = computed(() => ["overview", ...selectedMaps.value]);

function stageLabel(s: string) {
  return s === "overview" ? "锁船总方案(通读攻略+全box)" : `${s} 逐阶段配装`;
}

async function run(fresh: boolean) {
  if (!apiKey() || !store.box || !store.master || !store.pack) return;
  globalError.value = "";
  store.running = true;
  store.stageStatus = {};
  // 先把 run 对象挂到 store 上,runAgent 原地填充 —— 每个阶段完成即持久化,
  // 中途关页/断线也不丢已完成的部分。
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
      apiKey(),
      store.model,
      store.pack,
      store.box,
      store.master,
      selectedMaps.value,
      {
        onStage(stage, status, detail) {
          store.stageStatus = {
            ...store.stageStatus,
            [stage]: { ...store.stageStatus[stage], status, detail },
          };
          persist();
        },
        onProgress(stage, chars) {
          store.stageStatus = {
            ...store.stageStatus,
            [stage]: { ...store.stageStatus[stage], status: "running", chars },
          };
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
        Agent 将通读攻略全文(锁船表/多号机表/全部 noro6 配装/敌配置)和你的完整 Box,先生成
        <b>锁船总方案</b>,再逐图生成<b>各阶段配装</b>。全程约 5~15 分钟,同一攻略语料走缓存,总成本约
        <b>$1~3</b>(Opus)/ <b>$0.5~1.5</b>(Sonnet)。
      </p>
      <p>
        分析海域:
        <label v-for="m in MAPS" :key="m" style="margin-right: 10px">
          <input type="checkbox" v-model="selectedMaps" :value="m" :disabled="store.running" /> {{ m }}
        </label>
      </p>
      <p v-if="!store.box?.ships.length" class="warn">请先在「① 导入 Box」导入舰娘数据。</p>
      <p v-else-if="!store.box?.equips.length" class="warn">尚未导入装备列表,请回到「① 导入 Box」补充。</p>
      <p v-if="!apiKey()" class="warn">未检测到 API Key——请按 README 在 web/.env 配置 VITE_ANTHROPIC_API_KEY 后重启 dev server。</p>

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

    <div class="panel" v-if="store.running || store.run">
      <h3 style="margin-top: 0">进度</h3>
      <div v-for="s in stages" :key="s" class="stage-row">
        <div
          class="stage-dot"
          :class="{
            running: store.stageStatus[s]?.status === 'running' || store.stageStatus[s]?.status === 'start',
            done: store.stageStatus[s]?.status === 'done' || (s === 'overview' ? !!store.run?.overview : !!store.run?.maps[s]),
            error: store.stageStatus[s]?.status === 'error',
          }"
        ></div>
        <div style="flex: 1">
          {{ stageLabel(s) }}
          <span v-if="store.stageStatus[s]?.chars" class="dim">
            — 已生成 {{ (store.stageStatus[s].chars! / 1000).toFixed(1) }}k 字符</span
          >
          <span v-if="store.run?.errors[s]" class="err"> — {{ store.run.errors[s] }}</span>
        </div>
      </div>
      <p v-if="store.run" class="dim" style="margin-bottom: 0">
        Token:输入 {{ (store.run.usage.input / 1000).toFixed(0) }}k · 缓存读
        {{ (store.run.usage.cache_read / 1000).toFixed(0) }}k · 缓存写
        {{ (store.run.usage.cache_write / 1000).toFixed(0) }}k · 输出
        {{ (store.run.usage.output / 1000).toFixed(0) }}k · 估算成本 ${{ cost.toFixed(2) }} ·
        模型 {{ store.run.model }}
      </p>
    </div>
  </div>
</template>
