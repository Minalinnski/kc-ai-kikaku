<script setup lang="ts">
import { computed } from "vue";
import { store } from "../store";
import { verifyRun } from "../lib/verify";
import { tagChipStyle } from "../lib/tags";

const result = computed(() => {
  if (!store.run?.overview || !store.box || !store.master) return null;
  try {
    return verifyRun(store.run, store.box, store.master);
  } catch (e) {
    console.error("verify failed", e);
    return null;
  }
});

const groupByShip = computed(() => {
  if (!result.value) return [];
  // 同一舰(pick 前缀)聚合,标记多札
  return result.value.tagBoard;
});
</script>

<template>
  <div>
    <div v-if="!result" class="panel dim">需要先有分析结果(② 运行分析)和 Box 才能校验。</div>
    <template v-else>
      <div class="panel">
        <h2 style="margin-top: 0">机器校验(确定性,非AI)</h2>
        <p>
          对 AI 方案做硬约束核查:锁船多号机不超持有量 · 单阶段装备用量不超 box 持有 ·
          单阶段同舰不重复 · 阶段贴条与锁船表一致。
          <b :class="result.stats.errors ? 'err' : 'ok'">
            {{ result.stats.errors ? `✗ ${result.stats.errors} 个硬冲突` : "✓ 无硬冲突" }}</b>
          <span v-if="result.stats.warns" class="warn"> · {{ result.stats.warns }} 个提示</span>
        </p>
        <ul v-if="result.violations.length" style="margin: 6px 0">
          <li v-for="(v, i) in result.violations" :key="i" :class="v.level === 'error' ? 'err' : 'warn'">
            [{{ v.where }}] {{ v.msg }}
          </li>
        </ul>
        <p class="dim" style="font-size: 12px">
          ※ 校验基于图鉴名精确解析;解析不了的名字只提示不计错。AI 的黑话理解错误(如舰名张冠李戴)
          无法被机器识别,请对照「⑤ 攻略资料」的锁船表原文抽查。
        </p>
      </div>

      <div class="panel">
        <h2 style="margin-top: 0">舰娘 → 贴条 对照板</h2>
        <p class="dim">
          左=计划锁船的每一艘;「游戏内已贴」来自你导入 box 时的札状态(area),
          出击前后重新导入 box 即可对照实际贴条是否与计划一致。
        </p>
        <table>
          <thead>
            <tr>
              <th style="width: 22%">舰(计划)</th>
              <th style="width: 8%">练度</th>
              <th style="width: 18%">计划札</th>
              <th style="width: 14%">适用海域</th>
              <th style="width: 10%">游戏内已贴</th>
              <th>角色 / 冲突</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in groupByShip" :key="i">
              <td :class="r.resolved ? '' : 'warn'">{{ r.pick }}</td>
              <td class="mono">{{ r.lv ? "Lv" + r.lv : "—" }}</td>
              <td><span class="tag-chip" :style="tagChipStyle(r.tag)">{{ r.tag }}</span></td>
              <td class="dim" style="font-size: 12px">{{ r.maps }}</td>
              <td class="mono" :class="r.sallyNow ? 'warn' : 'dim'">
                {{ r.sallyNow ? "札#" + r.sallyNow : "未贴" }}
              </td>
              <td style="font-size: 12px">
                <span class="dim">{{ r.role }}</span>
                <span v-if="r.conflict" class="err"> ⚠ {{ r.conflict }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
