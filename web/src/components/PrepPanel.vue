<script setup lang="ts">
import { computed } from "vue";
import { store } from "../store";

const prep = computed(() => store.run?.prep ?? null);

const prioClass = (p: string) =>
  p?.startsWith("P0") ? "p0" : p?.startsWith("P1") ? "p1" : "p2";
const prioSort = <T extends { priority: string }>(rows: T[]) =>
  [...rows].sort((a, b) => (a.priority ?? "P9").localeCompare(b.priority ?? "P9"));
</script>

<template>
  <div>
    <div v-if="!prep" class="panel dim">
      尚无战前布局分析。此章节产出:舰船缺口(现捞/建造)、练度与改造缺口、装备素材缺口、开打前行动清单。
      <template v-if="store.run?.overview && !store.snapshot">
        旧存档没有此章节 — 在「② 运行分析」点「继续未完成的部分」即可补跑。</template>
      <template v-else-if="store.snapshot">此封板报告生成于该章节上线之前,重跑后重新封板即可补齐。</template>
    </div>

    <template v-else>
      <div class="panel">
        <h2 style="margin-top: 0">战前布局总评</h2>
        <p style="white-space: pre-wrap; margin-bottom: 0">{{ prep.summary }}</p>
      </div>

      <div class="panel" v-if="prep.checklist?.length">
        <h2 style="margin-top: 0">开打前行动清单</h2>
        <div v-for="(c, i) in prioSort(prep.checklist)" :key="i" class="check-row">
          <span class="prio" :class="prioClass(c.priority)">{{ c.priority }}</span>
          <span style="flex: 1">{{ c.task }}</span>
          <span class="dim" style="font-size: 12px; white-space: nowrap">{{ c.when }}</span>
        </div>
      </div>

      <div class="panel" v-if="prep.missing_ships?.length">
        <h2 style="margin-top: 0">舰船缺口</h2>
        <table>
          <thead><tr><th></th><th>舰</th><th>用途</th><th>获取途径</th><th>平替</th></tr></thead>
          <tbody>
            <tr v-for="(s, i) in prioSort(prep.missing_ships)" :key="i">
              <td><span class="prio" :class="prioClass(s.priority)">{{ s.priority }}</span></td>
              <td><b>{{ s.ship }}</b></td>
              <td>{{ s.needed_for }}</td>
              <td>{{ s.how_to_get }}</td>
              <td>{{ s.alternative }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="panel" v-if="prep.level_gaps?.length || prep.remodel_gaps?.length">
        <h2 style="margin-top: 0">练度 · 改造缺口</h2>
        <table v-if="prep.level_gaps?.length">
          <thead><tr><th></th><th>舰</th><th>当前</th><th>目标</th><th>理由</th><th>练法</th></tr></thead>
          <tbody>
            <tr v-for="(g, i) in prioSort(prep.level_gaps)" :key="i">
              <td><span class="prio" :class="prioClass(g.priority)">{{ g.priority }}</span></td>
              <td><b>{{ g.ship }}</b></td>
              <td class="mono-cell">{{ g.current }}</td>
              <td class="mono-cell">{{ g.target }}</td>
              <td>{{ g.reason }}</td>
              <td>{{ g.how }}</td>
            </tr>
          </tbody>
        </table>
        <table v-if="prep.remodel_gaps?.length">
          <thead><tr><th></th><th>舰</th><th>当前形态</th><th>目标形态</th><th>所需</th></tr></thead>
          <tbody>
            <tr v-for="(g, i) in prioSort(prep.remodel_gaps)" :key="i">
              <td><span class="prio" :class="prioClass(g.priority)">{{ g.priority }}</span></td>
              <td><b>{{ g.ship }}</b></td>
              <td>{{ g.current }}</td>
              <td>{{ g.target }}</td>
              <td>{{ g.needs }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="panel" v-if="prep.equip_gaps?.length">
        <h2 style="margin-top: 0">装备缺口</h2>
        <table>
          <thead><tr><th></th><th>装备</th><th>持有/需要</th><th>来源</th><th>临时平替</th></tr></thead>
          <tbody>
            <tr v-for="(g, i) in prioSort(prep.equip_gaps)" :key="i">
              <td><span class="prio" :class="prioClass(g.priority)">{{ g.priority }}</span></td>
              <td><b>{{ g.item }}</b></td>
              <td class="mono-cell">{{ g.have }} / {{ g.need }}</td>
              <td>{{ g.source }}</td>
              <td>{{ g.workaround }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.check-row {
  display: flex; align-items: baseline; gap: 10px;
  padding: 6px 0; border-bottom: 1px solid var(--hairline);
}
.check-row:last-child { border-bottom: none; }
.prio {
  font-family: var(--mono); font-size: 11px; padding: 1px 7px; border-radius: 10px;
  border: 1px solid var(--border); white-space: nowrap;
}
.prio.p0 { color: var(--error); border-color: color-mix(in srgb, var(--error) 45%, transparent); }
.prio.p1 { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 45%, transparent); }
.prio.p2 { color: var(--text-dim); }
.mono-cell { font-family: var(--mono); font-size: 12px; white-space: nowrap; }
</style>
