<script setup lang="ts">
import { computed, ref } from "vue";
import { store } from "../store";
import { tagChipStyle } from "../lib/tags";
import { phaseToNoro6Url } from "../lib/noro6export";
import type { PlanPhase } from "../lib/types";

function noro6Check(ph: PlanPhase): string | null {
  if (!store.box || !store.master) return null;
  try { return phaseToNoro6Url(ph, store.box, store.master); } catch { return null; }
}

const mapIds = computed(() => Object.keys(store.run?.maps ?? {}));
const active = ref("");
const cur = computed(() => {
  const id = active.value || mapIds.value[0];
  return id ? store.run?.maps[id] : null;
});
</script>

<template>
  <div>
    <div v-if="!mapIds.length" class="panel dim">还没有逐图结果——先在「② 运行分析」跑一次。</div>
    <template v-else>
      <div class="tabs">
        <div
          v-for="id in mapIds"
          :key="id"
          class="tab"
          :class="{ active: (active || mapIds[0]) === id }"
          @click="active = id"
        >
          {{ id }}
        </div>
      </div>

      <div v-if="cur" class="panel">
        <h2 style="margin-top: 0">{{ cur.map }}</h2>
        <p v-if="cur.map_notes" class="dim">{{ cur.map_notes }}</p>

        <div v-for="(ph, pi) in cur.phases" :key="pi" style="margin: 20px 0; border-top: 1px solid var(--border); padding-top: 12px">
          <h3>
            {{ ph.phase }}
            <span class="tag-chip" :style="tagChipStyle(ph.tag)">{{ ph.tag }}</span>
            <span class="dim" style="font-size: 12px">{{ ph.fleet_type }}</span>
          </h3>
          <p class="dim mono" style="font-size: 12px">
            路线:{{ ph.route }}<br />阵型:{{ ph.formation }}
          </p>

          <div v-for="(fl, fi) in ph.fleets" :key="fi">
            <h4 style="margin: 10px 0 4px">{{ fl.label }}</h4>
            <table>
              <thead>
                <tr>
                  <th style="width: 4%">#</th>
                  <th style="width: 18%">舰</th>
                  <th style="width: 12%">练度</th>
                  <th style="width: 42%">装备(逐槽)</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in fl.ships" :key="s.slot">
                  <td>{{ s.slot }}</td>
                  <td :class="s.owned ? '' : 'err'">{{ s.ship }}<span v-if="!s.owned"> ⚠缺</span></td>
                  <td :class="s.level_note === 'OK' ? 'ok' : 'warn'" style="font-size: 12px">{{ s.level_note }}</td>
                  <td style="font-size: 12px">
                    <div v-for="(e, ei) in s.equips" :key="ei" :class="e.owned ? '' : 'warn'">
                      {{ e.name }}<span v-if="!e.owned"> ⚠</span>
                      <span v-if="e.note" class="dim"> — {{ e.note }}</span>
                    </div>
                  </td>
                  <td class="dim" style="font-size: 12px">{{ s.why }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="ph.lbas?.length" style="margin-top: 8px">
            <b>基地航空队:</b>
            <ul style="margin: 4px 0">
              <li v-for="(b, bi) in ph.lbas" :key="bi">
                {{ b.squad }} → {{ b.target }}:{{ b.planes.join(" / ") }}
              </li>
            </ul>
          </div>
          <p v-if="ph.support"><b>支援:</b>{{ ph.support }}</p>
          <p v-if="ph.notes" class="dim">{{ ph.notes }}</p>
          <ul v-if="ph.warnings?.length">
            <li v-for="(w, wi) in ph.warnings" :key="wi" class="warn">⚠ {{ w }}</li>
          </ul>
          <p style="font-size: 12px">
            <a v-if="noro6Check(ph)" :href="noro6Check(ph)!" target="_blank">在 noro6 打开本方案(制空/索敌核算)↗</a>
            <span v-if="ph.noro6_ref && noro6Check(ph)" class="dim"> · </span>
            <a v-if="ph.noro6_ref" :href="ph.noro6_ref" target="_blank">攻略原配装(noro6)↗</a>
          </p>
        </div>
      </div>
    </template>
  </div>
</template>
