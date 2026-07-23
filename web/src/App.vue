<script setup lang="ts">
import { ref, computed } from "vue";
import { store, persist, login, logout, loadLatestRun } from "./store";
import { MODELS } from "./lib/agent";
import ImportPanel from "./components/ImportPanel.vue";
import RunPanel from "./components/RunPanel.vue";
import ResultOverview from "./components/ResultOverview.vue";
import ResultMaps from "./components/ResultMaps.vue";
import GuideView from "./components/GuideView.vue";

const tab = ref("import");

const tabs = computed(() => [
  { id: "import", label: "① 导入 Box", badge: store.box ? `${store.box.ships.length}舰` : "" },
  { id: "run", label: "② 运行分析", badge: store.running ? "运行中" : "" },
  { id: "overview", label: "③ 锁船总表", badge: store.run?.overview ? "✓" : "" },
  { id: "maps", label: "④ 逐图配装", badge: Object.keys(store.run?.maps ?? {}).length ? `${Object.keys(store.run!.maps).length}图` : "" },
  { id: "guide", label: "⑤ 攻略资料" },
]);

// 活动横幅(攻略原文配图,idx=3)
const bannerUrl = computed(() => {
  const f = store.pack?.images?.["3"]?.file;
  return f ? import.meta.env.BASE_URL + "data/img/" + f : "";
});

const repoUrl = "https://github.com/Minalinnski/kc-ai-kikaku";

// 自托管登录
const loginUser = ref("");
const loginPass = ref("");
const loginErr = ref("");
const loggingIn = ref(false);
async function doLogin() {
  loggingIn.value = true;
  loginErr.value = await login(loginUser.value.trim(), loginPass.value);
  loggingIn.value = false;
  if (!loginErr.value) loadLatestRun();
}
</script>

<template>
  <div>
    <header class="hero">
      <img v-if="bannerUrl" :src="bannerUrl" class="banner" alt="" />
      <div class="hero-inner">
        <p class="eyebrow">Kancolle Operations Planning</p>
        <h1><span class="kc">KC</span> AI 企画室</h1>
        <p class="sub">2026夏活「反撃!第三十一戦隊の戦い」— 导入 Box,AI 通读攻略,产出专属锁船表与逐图配装</p>
        <p class="src">
          攻略来源
          <a :href="store.pack?.event.guide_url" target="_blank">{{ store.pack?.event.guide_title ?? "…" }}</a>
          <span v-if="store.pack">(存档 {{ store.pack.built_at.slice(0, 10) }})</span>
        </p>
      </div>
    </header>

    <!-- 自托管模式:未登录只显示登录框 -->
    <div v-if="store.server && !store.authed" class="panel" style="max-width: 420px; margin: 40px auto">
      <h2 style="margin-top: 0">登录</h2>
      <p class="dim">输入管理员发给你的帐号密码。</p>
      <form @submit.prevent="doLogin" style="display: flex; flex-direction: column; gap: 10px">
        <input type="text" v-model="loginUser" placeholder="帐号" autocomplete="username" />
        <input type="password" v-model="loginPass" placeholder="密码" autocomplete="current-password" />
        <button :disabled="loggingIn || !loginUser || !loginPass" type="submit">
          {{ loggingIn ? "登录中…" : "进入企画室" }}
        </button>
        <p v-if="loginErr" class="err" style="margin: 0">✗ {{ loginErr }}</p>
      </form>
    </div>

    <template v-else>
    <div class="panel config">
      <span class="keystate">
        <template v-if="store.server"><span class="ok">●</span> API 由服务器托管 · {{ store.user }}</template>
        <template v-else-if="store.proxyKey"><span class="ok">●</span> API Key 已由本地代理注入(web/.env)</template>
        <template v-else>
          <span class="warn">○</span> 未配置 API Key —
          <a :href="repoUrl + '#快速开始'" target="_blank">按 README 配置 .env 后本地运行</a>
        </template>
      </span>
      <label>
        模型
        <select v-model="store.model" @change="persist()" style="margin-left: 6px">
          <option v-for="m in MODELS" :key="m.id" :value="m.id">{{ m.label }}</option>
        </select>
      </label>
      <span v-if="!store.server" class="dim" style="font-size: 12px">Key 只在你本机,请求直连 Anthropic。</span>
      <button v-if="store.server" class="secondary" style="padding: 4px 12px; font-size: 12px" @click="logout()">退出</button>
      <details v-if="!store.server && !store.proxyKey" style="margin: 0">
        <summary style="font-size: 12px">临时填写(仅本次会话,不保存)</summary>
        <input type="password" v-model="store.manualKey" placeholder="sk-ant-…" style="width: 260px; margin-top: 6px" />
      </details>
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
    </template>

    <p class="footnote">
      本工具与攻略作者无关;分析结果仅供参考,锁船前请自行核对攻略原文与最新更新。锁错船概不负责 :)
      · <a :href="repoUrl" target="_blank">GitHub</a>
    </p>
  </div>
</template>
