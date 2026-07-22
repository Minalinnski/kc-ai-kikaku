<script setup lang="ts">
import { ref, computed } from "vue";
import { store, persist } from "../store";
import { detectAndParse } from "../lib/parseBox";

const pasteText = ref("");
const message = ref("");
const error = ref("");

function doImport(text: string) {
  error.value = "";
  message.value = "";
  if (!store.master) return;
  try {
    const { box, message: msg } = detectAndParse(text, store.master, store.box);
    store.box = box;
    // 换 box 后旧分析结果作废
    store.run = null;
    persist();
    message.value = msg;
    pasteText.value = "";
  } catch (e) {
    error.value = (e as Error).message;
  }
}

async function onFile(ev: Event) {
  const f = (ev.target as HTMLInputElement).files?.[0];
  if (!f) return;
  doImport(await f.text());
  (ev.target as HTMLInputElement).value = "";
}

function exportSave() {
  const blob = new Blob(
    [JSON.stringify({ _type: "kc-event-advisor-save", box: store.box, run: store.run }, null, 1)],
    { type: "application/json" },
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "kc-advisor-save.json";
  a.click();
}

async function importSave(ev: Event) {
  const f = (ev.target as HTMLInputElement).files?.[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data._type !== "kc-event-advisor-save") throw new Error("不是本工具的存档文件");
    store.box = data.box ?? null;
    store.run = data.run ?? null;
    persist();
    message.value = "存档已恢复(Box + 分析结果)";
    error.value = "";
  } catch (e) {
    error.value = "存档导入失败:" + (e as Error).message;
  }
  (ev.target as HTMLInputElement).value = "";
}

const summary = computed(() => {
  if (!store.box || !store.master) return null;
  const b = store.box;
  const stype = new Map<number, number>();
  for (const s of b.ships) {
    const m = store.master.ships[String(s.id)];
    if (m) stype.set(m.stype, (stype.get(m.stype) ?? 0) + 1);
  }
  const locked = b.ships.filter((s) => s.sally > 0).length;
  return { ships: b.ships.length, equips: b.equips.length, locked, source: b.source, at: b.imported_at.slice(0, 16).replace("T", " ") };
});
</script>

<template>
  <div>
    <div class="panel">
      <h2 style="margin-top: 0">导入你的舰队 Box</h2>
      <p>支持以下两种来源,把 JSON 粘贴到下方或选择文件:</p>
      <ul>
        <li>
          <b>noro6 制空権シミュレータ导出</b>(推荐):打开
          <a href="https://noro6.github.io/kc-web/#/manager" target="_blank">「艦娘/装備管理」</a>
          (数据未反映过的先按页面指引把游戏数据反映进去)→ 出力/共有 中复制
          <b>艦娘コード</b>(形如 <span class="mono">[{"id":1,"ship_id":285,"lv":98,"st":[...],"area":0,...}]</span>)和
          <b>装備コード</b>(形如 <span class="mono">[{"id":124,"lv":10}]</span>),两段分别粘贴到下面,顺序不限自动合并。
          舰娘的运改修、活动札(area)都会一并识别。
        </li>
        <li>
          <b>艦隊分析格式</b>(api_*,通用):舰娘
          <span class="mono">[{"api_ship_id":…,"api_lv":…,"api_kyouka":[…],…}]</span> +
          装备 <span class="mono">[{"api_slotitem_id":…,"api_level":…}]</span>,KC3Kai 等工具可导出。
        </li>
        <li><b>kckit box_snapshot.json</b>:poi + kckit 插件用户,直接选择 <span class="mono">~/.kckit/box_snapshot.json</span> 文件,一次导入全部。</li>
      </ul>

      <textarea
        v-model="pasteText"
        rows="7"
        placeholder='在此粘贴 JSON…(艦隊分析舰娘段形如 [{"api_ship_id":285,"api_lv":98,...}],装备段形如 [{"api_slotitem_id":124,"api_level":10}])'
      ></textarea>
      <div style="margin-top: 8px; display: flex; gap: 10px; align-items: center">
        <button :disabled="!pasteText.trim()" @click="doImport(pasteText)">导入粘贴内容</button>
        <label class="secondary" style="cursor: pointer">
          <input type="file" accept=".json,application/json" style="display: none" @change="onFile" />
          <span style="border: 1px solid var(--border); border-radius: 8px; padding: 8px 14px; background: var(--panel2)">选择 JSON 文件…</span>
        </label>
      </div>
      <p v-if="message" class="ok">✓ {{ message }}</p>
      <p v-if="error" class="err">✗ {{ error }}</p>
    </div>

    <div v-if="summary" class="panel">
      <h3 style="margin-top: 0">当前已导入</h3>
      <p>
        舰娘 <b>{{ summary.ships }}</b> 艘 · 装备 <b>{{ summary.equips }}</b> 件
        <span v-if="summary.locked" class="warn"> · 已有 {{ summary.locked }} 艘带活动札</span>
        <span class="dim"> · 来源:{{ summary.source }} · {{ summary.at }}</span>
      </p>
      <p v-if="!summary.equips" class="warn">⚠ 尚未导入装备列表,配装推荐将不可用——请再粘贴装备 JSON。</p>
      <p class="dim">导入新 Box 会清空已有的分析结果。</p>
    </div>

    <div class="panel">
      <h3 style="margin-top: 0">存档(跨设备迁移)</h3>
      <p class="dim">
        数据默认只存在当前浏览器(localStorage)。换设备/浏览器时,导出存档文件再导入即可,
        包含 Box 和分析结果(不含 API Key)。
      </p>
      <div style="display: flex; gap: 10px">
        <button class="secondary" :disabled="!store.box" @click="exportSave">导出存档</button>
        <label style="cursor: pointer">
          <input type="file" accept=".json" style="display: none" @change="importSave" />
          <span style="border: 1px solid var(--border); border-radius: 8px; padding: 8px 14px; background: var(--panel2); display: inline-block">导入存档…</span>
        </label>
      </div>
    </div>
  </div>
</template>
