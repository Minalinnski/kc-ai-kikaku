<script setup lang="ts">
import { computed } from "vue";
import { store } from "../store";
import { tagChipStyle } from "../lib/tags";

const ov = computed(() => store.run?.overview ?? null);

function mdLite(s: string): string {
  // 极简 markdown:转义 + 加粗/换行/标题
  const esc = s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc
    .replace(/^### (.*)$/gm, "<h4>$1</h4>")
    .replace(/^## (.*)$/gm, "<h3>$1</h3>")
    .replace(/^# (.*)$/gm, "<h3>$1</h3>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/^[-·] (.*)$/gm, "• $1")
    .replace(/\n/g, "<br>");
}

function exportJson() {
  if (!store.run) return;
  const blob = new Blob([JSON.stringify(store.run, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "kc-event-plan.json";
  a.click();
}
</script>

<template>
  <div>
    <div v-if="!ov" class="panel dim">还没有分析结果——先在「② 运行分析」跑一次。</div>
    <template v-else>
      <div class="panel">
        <div style="display: flex; justify-content: space-between; align-items: center">
          <h2 style="margin: 0">锁船总方案</h2>
          <button class="secondary" @click="exportJson">导出完整结果 JSON</button>
        </div>
        <p><b>推荐难度:</b>{{ ov.difficulty }}</p>
        <div class="md" v-html="mdLite(ov.overview)"></div>
      </div>

      <div class="panel">
        <h2 style="margin-top: 0">锁船表(按札)</h2>
        <div v-for="tag in ov.lock_plan" :key="tag.tag" style="margin-bottom: 18px">
          <h3>
            <span class="tag-chip" :style="tagChipStyle(tag.tag)">{{ tag.tag }}</span>
            <span class="dim" style="font-size: 12px">{{ tag.maps }}</span>
          </h3>
          <table>
            <thead>
              <tr>
                <th style="width: 22%">角色(攻略)</th>
                <th style="width: 20%">推荐锁船</th>
                <th style="width: 16%">练度/改造</th>
                <th style="width: 18%">备选</th>
                <th>理由</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(s, i) in tag.ships" :key="i">
                <td>{{ s.role }}</td>
                <td :class="s.owned ? '' : 'err'">
                  {{ s.pick }}<span v-if="s.lv" class="dim" style="font-size: 11px"> Lv{{ s.lv }}</span><span
                    v-if="s.dup_no" class="dim" style="font-size: 11px">·{{ s.dup_no }}</span><span
                    v-if="!s.owned" title="Box 中缺失"> ⚠缺</span>
                </td>
                <td :class="s.level_note === 'OK' ? 'ok' : 'warn'">{{ s.level_note }}</td>
                <td class="dim">{{ s.alternatives }}</td>
                <td class="dim">{{ s.reason }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="tag.notes" class="dim" style="margin: 4px 0 0">※ {{ tag.notes }}</p>
        </div>
      </div>

      <div class="panel" v-if="ov.dup_plan?.length">
        <h2 style="margin-top: 0">多号机分配</h2>
        <table>
          <thead><tr><th>舰</th><th style="width: 10%">持有</th><th>分配</th></tr></thead>
          <tbody>
            <tr v-for="(d, i) in ov.dup_plan" :key="i">
              <td>{{ d.ship }}</td>
              <td>{{ d.owned_count }}</td>
              <td>{{ d.assignment }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="panel">
        <h2 style="margin-top: 0">赛前准备清单</h2>
        <ol>
          <li v-for="(p, i) in ov.prep" :key="i">{{ p }}</li>
        </ol>
        <h3 class="warn">风险提示</h3>
        <ul>
          <li v-for="(r, i) in ov.risks" :key="i" class="warn">{{ r }}</li>
        </ul>
      </div>
    </template>
  </div>
</template>
