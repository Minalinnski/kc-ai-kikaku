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
          <b>艦隊分析格式</b>(推荐,通用):即
          <span class="mono">[{"api_ship_id":285,"api_lv":98,"api_kyouka":[...],...}]</span>(舰娘)和
          <span class="mono">[{"api_slotitem_id":124,"api_level":10}]</span>(装备)两段 JSON。获取方式:
          <ul>
            <li>在 <a href="https://noro6.github.io/kc-web/#/manager" target="_blank">制空権シミュレータ(noro6)的「艦娘/装備管理」</a> 维护过数据的,用其反映/出力功能拿到这两段 JSON;</li>
            <li>KC3Kai 用户:設定 → データ管理/艦隊分析连携 导出;</li>
            <li>其他浏览器/工具按各自的「艦隊分析形式」导出即可。两段分两次粘贴,顺序不限,会自动合并。</li>
          </ul>
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
  </div>
</template>
