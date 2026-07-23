import type { AgentRun, Box, Master } from "./types";

/** 确定性一致性校验:装备不超持有量、舰娘贴条不冲突、多号机不超持有数。 */

export interface Violation {
  level: "error" | "warn";
  where: string;
  msg: string;
}

export interface TagRow {
  tag: string;
  pick: string;
  resolved: boolean;
  lv: number | null;
  sallyNow: number | null; // 游戏内已贴札(box导入时的 area)
  role: string;
  maps: string;
  conflict: string; // 非空=红牌
}

export interface VerifyResult {
  violations: Violation[];
  tagBoard: TagRow[];
  stats: { ships: number; tags: number; errors: number; warns: number };
}

// ---- 名称解析 ----

function stripShipName(raw: string): string[] {
  // 生成候选:原文 → 逐层剥尾部修饰(括号 / 空格Lv后缀 / N号机)直到收敛
  const cands = [raw.trim()];
  let s = raw.trim();
  for (let i = 0; i < 6; i++) {
    const prev = s;
    const m = s.match(/^(.*?)[((][^(()))]*[))]\s*$/);
    if (m) s = m[1].trim();
    // 「鳳翔改二 Lv145」「北上改二 Lv129 2号机」式空格后缀
    s = s.replace(/\s+Lv\.?\s*\d+.*$/i, "").replace(/\s+\d+号[机機]?\s*$/, "").trim();
    if (s === prev) break;
    if (s) cands.push(s);
  }
  return cands;
}

export function resolveShipId(raw: string, master: Master): number | null {
  const byName = shipNameIndex(master);
  for (const c of stripShipName(raw)) {
    const id = byName.get(c);
    if (id) return id;
  }
  return null;
}

let _shipIdx: Map<string, number> | null = null;
function shipNameIndex(master: Master): Map<string, number> {
  if (_shipIdx) return _shipIdx;
  _shipIdx = new Map();
  for (const [id, s] of Object.entries(master.ships)) {
    if (!(s as any).enemy) _shipIdx.set(s.name, Number(id));
  }
  return _shipIdx;
}

let _itemIdx: Map<string, number> | null = null;
function itemNameIndex(master: Master): Map<string, number> {
  if (_itemIdx) return _itemIdx;
  _itemIdx = new Map();
  for (const [id, it] of Object.entries(master.items)) _itemIdx.set(it.name, Number(id));
  return _itemIdx;
}

export function resolveItemId(raw: string, master: Master): number | null {
  const idx = itemNameIndex(master);
  let s = raw.trim().replace(/^\[补强\]/, "").replace(/★\+?\d+\s*$/, "").trim();
  // 全形空白与尾注
  s = s.replace(/\s*[((]仅\d+[))]\s*$/, "").trim();
  return idx.get(s) ?? idx.get(raw.trim()) ?? null;
}

/** 同一改造线的基准id(orig 链) */
export function origOf(master: Master, id: number): number {
  const s = master.ships[String(id)];
  if (!s) return id;
  if (s.orig) return s.orig;
  // 兜底:向前走 before 链
  let cur = s, curId = id, guard = 0;
  while (cur && cur.before && guard++ < 12) {
    curId = cur.before;
    cur = master.ships[String(curId)];
  }
  return curId;
}

// ---- 主校验 ----

/** 日文汉字/简体归一,用于札名模糊比对 */
function normTag(s: string): string {
  const map: Record<string, string> = { "増": "增", "強": "强", "隊": "队", "戰": "战", "戦": "战", "艦": "舰", "聯": "联", "國": "国" };
  return s.replace(/[増強隊戰戦艦聯國]/g, (c) => map[c] ?? c);
}
function tagMatches(phaseTag: string, lockTag: string): boolean {
  const p = normTag(phaseTag);
  const l = normTag(lockTag).slice(0, 4);
  // 阶段札可能是「联合舰队(+增强三十一战队做H点)」之类的复合描述,拆词后任一命中即可
  return p.split(/[\/+()()·、]/).some((tok) => tok.includes(l) || l.includes(tok.slice(0, 4)));
}

export function verifyRun(run: AgentRun, box: Box, master: Master): VerifyResult {
  _shipIdx = null; _itemIdx = null;
  const violations: Violation[] = [];
  const tagBoard: TagRow[] = [];

  // box 索引
  const ownedByOrig = new Map<number, { id: number; lv: number; sally: number }[]>();
  for (const s of box.ships) {
    const o = origOf(master, s.id);
    const arr = ownedByOrig.get(o) ?? [];
    arr.push({ id: s.id, lv: s.lv, sally: s.sally });
    ownedByOrig.set(o, arr);
  }
  for (const arr of ownedByOrig.values()) arr.sort((a, b) => b.lv - a.lv);
  const equipCount = new Map<number, number>();
  for (const e of box.equips) equipCount.set(e.id, (equipCount.get(e.id) ?? 0) + 1);

  // 1) 锁船表:orig → 出现的札列表
  const origTags = new Map<number, { tag: string; pick: string }[]>();
  const ov = run.overview;
  if (ov) {
    for (const tag of ov.lock_plan) {
      for (const ship of tag.ships) {
        if (!ship.owned) continue;
        const id = resolveShipId(ship.pick, master);
        const row: TagRow = {
          tag: tag.tag, pick: ship.pick, resolved: id != null,
          lv: null, sallyNow: null, role: ship.role, maps: tag.maps, conflict: "",
        };
        if (id == null) {
          row.conflict = "舰名无法解析,请人工核对";
          violations.push({ level: "warn", where: `锁船表·${tag.tag}`, msg: `「${ship.pick}」无法对应图鉴舰名` });
        } else {
          const o = origOf(master, id);
          const list = origTags.get(o) ?? [];
          list.push({ tag: tag.tag, pick: ship.pick });
          origTags.set(o, list);
          const insts = ownedByOrig.get(o) ?? [];
          const idxInTag = list.length - 1; // 第几艘同名(跨札第N次出现→用练度第N高的实例)
          const inst = insts[idxInTag];
          row.lv = inst?.lv ?? null;
          row.sallyNow = inst && inst.sally > 0 ? inst.sally : null;
          if (!insts.length) {
            row.conflict = "box中没有该舰";
            violations.push({ level: "error", where: `锁船表·${tag.tag}`, msg: `「${ship.pick}」box中未持有` });
          } else if (list.length > insts.length) {
            row.conflict = `需第${list.length}艘,仅持有${insts.length}艘`;
            violations.push({
              level: "error", where: `锁船表·${tag.tag}`,
              msg: `${master.ships[String(o)]?.name ?? ship.pick} 被分配到 ${list.length} 个札(${list.map((x) => x.tag).join("/")}),但仅持有 ${insts.length} 艘`,
            });
          }
        }
        tagBoard.push(row);
      }
    }
  }

  // 2) 逐图阶段:阶段内装备用量 ≤ 持有量;阶段内同舰线用量 ≤ 持有数;札一致性
  for (const [mapId, mr] of Object.entries(run.maps ?? {})) {
    for (const ph of mr.phases ?? []) {
      const where = `${mapId}·${ph.phase}`;
      const usePerItem = new Map<number, { n: number; name: string }>();
      const usePerOrig = new Map<number, { n: number; name: string }>();
      for (const fl of ph.fleets ?? []) {
        for (const sh of fl.ships ?? []) {
          const sid = sh.owned ? resolveShipId(sh.ship, master) : null;
          if (sid != null) {
            const o = origOf(master, sid);
            const rec = usePerOrig.get(o) ?? { n: 0, name: sh.ship };
            rec.n++;
            usePerOrig.set(o, rec);
            // 札一致性(soft)
            const tags = origTags.get(o);
            if (tags?.length && !tags.some((t) => tagMatches(ph.tag, t.tag))) {
              violations.push({
                level: "warn", where,
                msg: `${sh.ship} 用于札「${ph.tag}」,但锁船表分配在「${tags.map((t) => t.tag).join("/")}」`,
              });
            }
          }
          for (const eq of sh.equips ?? []) {
            if (!eq.owned) continue;
            const iid = resolveItemId(eq.name, master);
            if (iid == null) continue; // 解析不了的不硬报错
            const rec = usePerItem.get(iid) ?? { n: 0, name: eq.name };
            rec.n++;
            usePerItem.set(iid, rec);
          }
        }
      }
      for (const b of ph.lbas ?? []) {
        for (const pl of b.planes ?? []) {
          const iid = resolveItemId(pl, master);
          if (iid == null) continue;
          const rec = usePerItem.get(iid) ?? { n: 0, name: pl };
          rec.n++;
          usePerItem.set(iid, rec);
        }
      }
      for (const [iid, rec] of usePerItem) {
        const have = equipCount.get(iid) ?? 0;
        if (rec.n > have) {
          violations.push({
            level: "error", where,
            msg: `装备「${master.items[String(iid)]?.name}」单阶段需 ${rec.n} 件,box 仅有 ${have} 件`,
          });
        }
      }
      for (const [o, rec] of usePerOrig) {
        const have = ownedByOrig.get(o)?.length ?? 0;
        if (rec.n > have) {
          violations.push({
            level: "error", where,
            msg: `${master.ships[String(o)]?.name} 同一阶段编入 ${rec.n} 艘,box 仅有 ${have} 艘`,
          });
        }
      }
    }
  }

  const errors = violations.filter((v) => v.level === "error").length;
  return {
    violations,
    tagBoard,
    stats: { ships: tagBoard.length, tags: ov?.lock_plan.length ?? 0, errors, warns: violations.length - errors },
  };
}
