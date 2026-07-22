<script setup lang="ts">
import { ref, computed } from "vue";
import { store, persist } from "./store";
import { MODELS } from "./lib/agent";
import ImportPanel from "./components/ImportPanel.vue";
import RunPanel from "./components/RunPanel.vue";
import ResultOverview from "./components/ResultOverview.vue";
import ResultMaps from "./components/ResultMaps.vue";
import GuideView from "./components/GuideView.vue";

const tab = ref("import");
const showKey = ref(false);

const tabs = computed(() => [
  { id: "import", label: "① 导入 Box", badge: store.box ? `${store.box.ships.length}舰` : "" },
  { id: "run", label: "② 运行分析", badge: store.running ? "运行中" : "" },
  { id: "overview", label: "③ 锁船总表", badge: store.run?.overview ? "✓" : "" },
  { id: "maps", label: "④ 逐图配装", badge: Object.keys(store.run?.maps ?? {}).length ? `${Object.keys(store.run!.maps).length}图` : "" },
  { id: "guide", label: "⑤ 攻略资料" },
]);

function onKeyInput() {
  persist();
}
</script>

<template>
  <div>
    <h1>⚓ 舰C活动参谋 <span class="dim" style="font-size: 14px">2026夏活「反撃!第三十一戦隊の戦い」</span></h1>
    <p class="dim" style="margin: 4px 0 12px">
      导入你的舰队 Box → AI 通读攻略全文 → 生成专属锁船表与逐图配装。攻略来源:
      <a :href="store.pack?.event.guide_url" target="_blank">{{ store.pack?.event.guide_title ?? "…" }}</a>
      <span v-if="store.pack">(数据抓取于 {{ store.pack.built_at.slice(0, 10) }})</span>
    </p>

    <div class="panel" style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap">
      <label>
        Anthropic API Key
        <input
          :type="showKey ? 'text' : 'password'"
          v-model="store.apiKey"
          @change="onKeyInput"
          placeholder="sk-ant-..."
          style="width: 260px; margin-left: 6px"
        />
      </label>
      <button class="secondary" style="padding: 4px 10px" @click="showKey = !showKey">{{ showKey ? "隐藏" : "显示" }}</button>
      <label>
        模型
        <select v-model="store.model" @change="onKeyInput" style="margin-left: 6px">
          <option v-for="m in MODELS" :key="m.id" :value="m.id">{{ m.label }}</option>
        </select>
      </label>
      <span class="dim" style="font-size: 12px">Key 仅保存在你的浏览器本地,请求直连 Anthropic,不经过任何第三方服务器。</span>
    </div>

    <div v-if="store.loading" class="panel">静态数据加载中…</div>
    <div v-else-if="store.loadError" class="panel err">{{ store.loadError }}</div>

    <template v-else>
      <div class="tabs">
        <div
          v-for="t in tabs"
          :key="t.id"
          class="tab"
          :class="{ active: tab === t.id }"
          @click="tab = t.id"
        >
          {{ t.label }}<span v-if="t.badge" class="badge">{{ t.badge }}</span>
        </div>
      </div>

      <ImportPanel v-show="tab === 'import'" />
      <RunPanel v-show="tab === 'run'" @done="tab = 'overview'" />
      <ResultOverview v-show="tab === 'overview'" />
      <ResultMaps v-show="tab === 'maps'" />
      <GuideView v-show="tab === 'guide'" />
    </template>

    <p class="dim" style="margin-top: 40px; font-size: 12px">
      本工具与攻略作者无关;分析结果仅供参考,锁船前请自行核对攻略原文与最新更新。锁错船概不负责 :)
    </p>
  </div>
</template>
