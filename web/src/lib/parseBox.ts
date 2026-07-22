import type { Box, BoxShip, BoxEquip, Master } from "./types";

/**
 * 玩家 box 导入解析。支持:
 * 1. kckit box_snapshot.json  — { ships: {id: {api_ship_id, api_lv, ...}}, equips: {...} }
 * 2. 艦隊分析格式             — 舰娘: [{api_ship_id, api_lv, api_kyouka, api_exp, api_slot_ex, api_sally_area}]
 *                               装备: [{api_slotitem_id, api_level}]
 *    (两段可分别粘贴,或合并为 {ships:[...], equips:[...]})
 */

export function detectAndParse(
  text: string,
  master: Master,
  existing?: Box | null,
): { box: Box; message: string } {
  let data: any;
  try {
    data = JSON.parse(text.trim());
  } catch (e) {
    throw new Error("JSON 解析失败:" + (e as Error).message);
  }

  // kckit snapshot: 顶层 ships 为 dict 且值里有 api_ship_id
  if (
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    data.ships &&
    !Array.isArray(data.ships)
  ) {
    const shipVals = Object.values(data.ships) as any[];
    if (shipVals.length && shipVals[0].api_ship_id !== undefined) {
      return { box: parseKckitSnapshot(data, master), message: "kckit box_snapshot 格式" };
    }
  }

  // 合并的 {ships:[...], equips:[...]}
  if (data && !Array.isArray(data) && Array.isArray(data.ships)) {
    const ships = parseFleetAnalysisShips(data.ships, master);
    const equipsArr = data.equips || data.items || [];
    const equips = Array.isArray(equipsArr) ? parseFleetAnalysisEquips(equipsArr) : [];
    return {
      box: makeBox(ships, equips, "艦隊分析格式(合并)"),
      message: `艦隊分析格式:${ships.length} 舰 / ${equips.length} 装备`,
    };
  }

  // 数组:判断是舰娘还是装备
  if (Array.isArray(data) && data.length) {
    if (data[0].api_ship_id !== undefined) {
      const ships = parseFleetAnalysisShips(data, master);
      const box = makeBox(ships, existing?.equips ?? [], "艦隊分析格式");
      return {
        box,
        message: `识别为舰娘列表:${ships.length} 舰${existing?.equips.length ? "(保留已导入装备)" : ",请再粘贴装备 JSON"}`,
      };
    }
    if (data[0].api_slotitem_id !== undefined) {
      const equips = parseFleetAnalysisEquips(data);
      const box = makeBox(existing?.ships ?? [], equips, "艦隊分析格式");
      return {
        box,
        message: `识别为装备列表:${equips.length} 件${existing?.ships.length ? "(保留已导入舰娘)" : ",请再粘贴舰娘 JSON"}`,
      };
    }
  }

  throw new Error("无法识别的格式。支持:kckit box_snapshot.json / 艦隊分析格式的舰娘或装备 JSON");
}

function parseKckitSnapshot(data: any, master: Master): Box {
  const ships: BoxShip[] = [];
  for (const s of Object.values(data.ships) as any[]) {
    if (!s.api_ship_id) continue;
    ships.push({
      id: s.api_ship_id,
      lv: s.api_lv ?? 1,
      luck: Array.isArray(s.api_lucky) ? s.api_lucky[0] : null,
      sally: s.api_sally_area ?? 0,
      locked: !!s.api_locked,
    });
  }
  const equips: BoxEquip[] = [];
  for (const e of Object.values(data.equips ?? {}) as any[]) {
    if (!e.api_slotitem_id) continue;
    equips.push({ id: e.api_slotitem_id, level: e.api_level ?? 0 });
  }
  return makeBox(ships, equips, "kckit box_snapshot");
}

function parseFleetAnalysisShips(arr: any[], master: Master): BoxShip[] {
  const ships: BoxShip[] = [];
  for (const s of arr) {
    const id = s.api_ship_id;
    if (!id) continue;
    const m = master.ships[String(id)];
    // 艦隊分析: api_kyouka = [火力,雷装,対空,装甲,運,耐久,対潜]
    const kyoukaLuck = Array.isArray(s.api_kyouka) ? (s.api_kyouka[4] ?? 0) : 0;
    const baseLuck = m?.luck ?? null;
    ships.push({
      id,
      lv: s.api_lv ?? 1,
      luck: baseLuck != null ? baseLuck + kyoukaLuck : null,
      sally: s.api_sally_area ?? 0,
      locked: true,
    });
  }
  return ships;
}

function parseFleetAnalysisEquips(arr: any[]): BoxEquip[] {
  const equips: BoxEquip[] = [];
  for (const e of arr) {
    if (e.api_slotitem_id === undefined) continue;
    equips.push({ id: e.api_slotitem_id, level: e.api_level ?? 0 });
  }
  return equips;
}

function makeBox(ships: BoxShip[], equips: BoxEquip[], source: string): Box {
  return { ships, equips, source, imported_at: new Date().toISOString() };
}

/** 舰娘按舰种分组、装备按 master_id+星级聚合,生成给 agent 的紧凑文本。 */
export function compactBoxText(box: Box, master: Master): string {
  const stypeNames: Record<number, string> = {
    1: "海防舰", 2: "驱逐舰", 3: "轻巡", 4: "雷巡", 5: "重巡", 6: "航巡",
    7: "轻母", 8: "高速战舰", 9: "战舰", 10: "航战", 11: "正规空母", 12: "超弩级战舰",
    13: "潜水艇", 14: "潜水空母", 16: "水母", 17: "扬陆舰", 18: "装甲空母",
    19: "工作舰", 20: "潜水母舰", 21: "练习巡洋舰", 22: "补给舰",
  };
  const groups = new Map<number, string[]>();
  const sorted = [...box.ships].sort((a, b) => {
    const ma = master.ships[String(a.id)];
    const mb = master.ships[String(b.id)];
    return (ma?.sort ?? 0) - (mb?.sort ?? 0) || b.lv - a.lv;
  });
  for (const s of sorted) {
    const m = master.ships[String(s.id)];
    if (!m) continue;
    let entry = `${m.name}(Lv${s.lv}`;
    if (s.luck != null && s.luck >= 30) entry += `,运${s.luck}`;
    if (m.next && m.next_lv) entry += `,可改@${m.next_lv}`;
    if (s.sally) entry += `,已锁札${s.sally}`;
    entry += ")";
    const g = groups.get(m.stype) ?? [];
    g.push(entry);
    groups.set(m.stype, g);
  }
  const shipLines: string[] = [];
  for (const [stype, list] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    shipLines.push(`【${stypeNames[stype] ?? "其他" + stype}】(${list.length}) ${list.join("、")}`);
  }

  // 装备聚合: id → {star → count}
  const eqAgg = new Map<number, Map<number, number>>();
  for (const e of box.equips) {
    const stars = eqAgg.get(e.id) ?? new Map();
    stars.set(e.level, (stars.get(e.level) ?? 0) + 1);
    eqAgg.set(e.id, stars);
  }
  const eqLines: string[] = [];
  const eqSorted = [...eqAgg.entries()].sort((a, b) => {
    const ta = master.items[String(a[0])]?.type ?? 0;
    const tb = master.items[String(b[0])]?.type ?? 0;
    return ta - tb || a[0] - b[0];
  });
  for (const [id, stars] of eqSorted) {
    const m = master.items[String(id)];
    if (!m) continue;
    const parts: string[] = [];
    for (const [star, count] of [...stars.entries()].sort((a, b) => b[0] - a[0])) {
      parts.push(star > 0 ? `★${star}×${count}` : `×${count}`);
    }
    eqLines.push(`${m.name} ${parts.join(" ")}`);
  }

  return (
    `## 舰娘一览(共${box.ships.length}艘;名字即当前改造形态;「可改@N」=Lv N可继续改造尚未改;运只标注≥30)\n` +
    shipLines.join("\n") +
    `\n\n## 装备一览(共${box.equips.length}件,按 星级×数量 聚合)\n` +
    eqLines.join("\n")
  );
}
