<script setup lang="ts">
import { computed, ref } from "vue";
import { store } from "../store";
import { tagChipStyle } from "../lib/tags";

const sub = ref("lock");
const pack = computed(() => store.pack);

const guideHtml = computed(() => {
  if (!pack.value) return "";
  const base = import.meta.env.BASE_URL;
  const esc = pack.value.main_text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc.replace(/\[IMAGE_(\d+)\]/g, (_m, idx) => {
    const img = pack.value!.images[idx];
    if (!img) return "";
    return `<img src="${base}data/img/${img.file}" loading="lazy" style="max-width:100%;border-radius:8px;margin:6px 0" />`;
  });
});

const noro6List = computed(() =>
  Object.entries(pack.value?.noro6 ?? {}).map(([code, v]) => ({ code, ...v })),
);
</script>

<template>
  <div v-if="pack">
    <div class="tabs">
      <div class="tab" :class="{ active: sub === 'lock' }" @click="sub = 'lock'">锁船表原文</div>
      <div class="tab" :class="{ active: sub === 'text' }" @click="sub = 'text'">攻略正文</div>
      <div class="tab" :class="{ active: sub === 'noro6' }" @click="sub = 'noro6'">noro6 配装索引</div>
    </div>

    <div v-show="sub === 'lock'">
      <div class="panel">
        <p class="dim">
          转录自
          <a :href="pack.lock_table.source.url" target="_blank">攻略锁船表</a>
          ({{ pack.lock_table.source.captured_at }});原表的加粗(重点)与斜体(可替换)样式未保留,拿不准时以原表为准。
        </p>
        <div v-for="tag in pack.lock_table.tags" :key="tag.name" style="margin-bottom: 14px">
          <h3>
            <span class="tag-chip" :style="tagChipStyle(tag.name)">{{ tag.name }}</span>
            <span class="dim" style="font-size: 12px">
              {{ Object.entries(tag.phases_by_map).map(([m, p]) => `${m}: ${p}`).join(" ; ") }}
            </span>
          </h3>
          <p style="margin: 4px 0">{{ tag.ships.join("、") }}</p>
        </div>
      </div>
      <div class="panel">
        <h3 style="margin-top: 0">多号机推荐</h3>
        <table>
          <thead><tr><th>舰</th><th>1号机</th><th>2号机</th><th>3号机</th><th>4号机+</th></tr></thead>
          <tbody>
            <tr v-for="row in pack.dup_table.by_owned_count" :key="row.ship">
              <td>{{ row.ship }}</td>
              <td>{{ row["1"] ?? "" }}</td>
              <td>{{ row["2"] ?? "" }}</td>
              <td>{{ row["3"] ?? "" }}</td>
              <td>{{ row["4/4+"] ?? "" }}</td>
            </tr>
          </tbody>
        </table>
        <p><b>大发/一拳优先级:</b>{{ pack.dup_table.daihatsu_priority }}</p>
        <p class="dim" style="font-size: 12px">
          内火:{{ pack.dup_table.daihatsu_dd_table["内火"].join("、") }}<br />
          一拳:{{ pack.dup_table.daihatsu_dd_table["一拳"].join("、") }}<br />
          大发:{{ pack.dup_table.daihatsu_dd_table["大发"].join("、") }}
        </p>
      </div>
    </div>

    <div v-show="sub === 'text'" class="panel">
      <p>
        <a :href="pack.event.guide_url" target="_blank">攻略原文 ↗</a>
        <span class="dim">(以下为 {{ pack.built_at.slice(0, 10) }} 抓取的存档,含原文配图)</span>
      </p>
      <pre class="guide-text" v-html="guideHtml"></pre>
    </div>

    <div v-show="sub === 'noro6'" class="panel">
      <table>
        <thead><tr><th style="width: 24%">攻略章节</th><th>配装链接</th><th style="width: 40%">编成概要</th></tr></thead>
        <tbody>
          <tr v-for="n in noro6List" :key="n.code">
            <td>{{ n.section }}</td>
            <td><a :href="n.url" target="_blank" class="mono">{{ n.url.replace("https://", "") }}</a></td>
            <td class="dim" style="font-size: 12px">
              {{ n.summary.fleets.map((f) => f.map((s) => s.name).join("/")).join(" + ") }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
