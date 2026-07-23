<script setup lang="ts">
import { computed } from "vue";
import { store } from "../store";

const prep = computed(() => store.run?.prep ?? null);
const sprint = computed(() => store.run?.sprint ?? null);

const prioClass = (p: string) =>
  p?.startsWith("P0") ? "p0" : p?.startsWith("P1") ? "p1" : "p2";
const prioSort = (rows: any[]): any[] =>
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

    <!-- 冲刺计划(一次性追加分析,存在才显示) -->
    <template v-if="sprint">
      <div class="panel sprint-head">
        <h2 style="margin-top: 0">一个月冲刺计划</h2>
        <p class="dim" style="font-size: 12px">
          追加分析,生成于 {{ sprint.generated_at?.slice(0, 10) }} · 基于当时资源:{{ sprint.resources_note }}
        </p>
        <p style="white-space: pre-wrap"><b>资源判定:</b>{{ sprint.resource_assessment?.verdict }}</p>
        <p class="dim" style="white-space: pre-wrap; font-size: 13px">{{ sprint.resource_assessment?.detail }}</p>
        <table v-if="sprint.resource_assessment?.weekly_targets?.length">
          <thead><tr><th>周</th><th>主题</th><th>资源目标</th></tr></thead>
          <tbody>
            <tr v-for="(w, i) in sprint.resource_assessment.weekly_targets" :key="i">
              <td style="white-space: nowrap">{{ w.week }}</td><td>{{ w.focus }}</td><td>{{ w.resource_goal }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="panel" v-if="sprint.qa?.length">
        <h2 style="margin-top: 0">追问答疑</h2>
        <div v-for="(q, i) in sprint.qa" :key="i" style="margin-bottom: 12px">
          <p style="margin: 0 0 4px"><b>Q:{{ q.question }}</b> <span class="dim" style="font-size: 11px">(置信度 {{ q.confidence }})</span></p>
          <p style="margin: 0; white-space: pre-wrap">{{ q.answer }}</p>
        </div>
      </div>

      <div class="panel" v-if="sprint.kaishu_plan?.length">
        <h2 style="margin-top: 0">改修计划(含消耗)</h2>
        <table>
          <thead><tr><th></th><th>项目</th><th>路线</th><th>单次消耗</th><th>素材来源</th><th>二番舰</th><th>预计</th><th>说明</th></tr></thead>
          <tbody>
            <tr v-for="(k, i) in prioSort(sprint.kaishu_plan)" :key="i">
              <td><span class="prio" :class="prioClass(k.priority)">{{ k.priority }}</span></td>
              <td><b>{{ k.item }}</b></td>
              <td>{{ k.from_to }}</td>
              <td>{{ k.per_attempt_cost }}</td>
              <td>{{ k.fodder_supply }}</td>
              <td>{{ k.helper }}</td>
              <td style="white-space: nowrap">{{ k.est_days }}</td>
              <td>{{ k.note }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="panel" v-if="sprint.development_plan?.length || sprint.expedition_plan?.length">
        <h2 style="margin-top: 0">每日开发 · 远征</h2>
        <table v-if="sprint.development_plan?.length">
          <thead><tr><th>开发目标</th><th>配方</th><th>秘书舰</th><th>频次</th><th>说明</th></tr></thead>
          <tbody>
            <tr v-for="(d, i) in sprint.development_plan" :key="i">
              <td><b>{{ d.target }}</b></td><td class="mono-cell">{{ d.recipe }}</td>
              <td>{{ d.secretary }}</td><td>{{ d.cadence }}</td><td>{{ d.note }}</td>
            </tr>
          </tbody>
        </table>
        <table v-if="sprint.expedition_plan?.length">
          <thead><tr><th>远征</th><th>目的</th><th>节奏</th></tr></thead>
          <tbody>
            <tr v-for="(e, i) in sprint.expedition_plan" :key="i">
              <td><b>{{ e.name }}</b></td><td>{{ e.why }}</td><td>{{ e.cadence }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="panel" v-if="sprint.leveling_plan?.length">
        <h2 style="margin-top: 0">练级计划</h2>
        <table>
          <thead><tr><th></th><th>舰</th><th>当前→目标</th><th>练法</th><th>预计</th><th>说明</th></tr></thead>
          <tbody>
            <tr v-for="(g, i) in prioSort(sprint.leveling_plan)" :key="i">
              <td><span class="prio" :class="prioClass(g.priority)">{{ g.priority }}</span></td>
              <td><b>{{ g.ship }}</b></td>
              <td class="mono-cell">{{ g.from }} → {{ g.to }}</td>
              <td>{{ g.method }}</td>
              <td style="white-space: nowrap">{{ g.est_time }}</td>
              <td>{{ g.note }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="panel" v-if="sprint.farming_plan?.length">
        <h2 style="margin-top: 0">捞船 · 补舰机会</h2>
        <table>
          <thead><tr><th>目标</th><th>哪里补</th><th>可行性</th><th>建议</th></tr></thead>
          <tbody>
            <tr v-for="(f, i) in sprint.farming_plan" :key="i">
              <td><b>{{ f.target }}</b></td><td>{{ f.where }}</td><td>{{ f.feasibility }}</td><td>{{ f.advice }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="panel" v-if="sprint.weekly_plan?.length">
        <h2 style="margin-top: 0">周计划</h2>
        <div v-for="(w, i) in sprint.weekly_plan" :key="i" style="margin-bottom: 12px">
          <p style="margin: 0 0 4px"><b>{{ w.week }}</b> — {{ w.theme }}</p>
          <ul style="margin: 0 0 0 18px; padding: 0">
            <li v-for="(a, j) in w.actions" :key="j" style="margin: 2px 0">{{ a }}</li>
          </ul>
        </div>
      </div>

      <div class="panel" v-if="sprint.cautions?.length">
        <h2 style="margin-top: 0">翻车预警</h2>
        <ul style="margin: 0 0 0 18px; padding: 0">
          <li v-for="(c, i) in sprint.cautions" :key="i" style="margin: 4px 0">{{ c }}</li>
        </ul>
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
