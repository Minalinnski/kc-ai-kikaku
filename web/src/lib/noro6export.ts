import type { Box, Master, PlanPhase } from "./types";
import { resolveShipId, resolveItemId } from "./verify";

/** 把某阶段的配装转成 noro6/制空権シミュレータ 的 predeck 链接(第三方核算/可视化) */
export function phaseToNoro6Url(
  phase: PlanPhase,
  box: Box,
  master: Master,
  hqlv = 120,
): string | null {
  const deck: any = { version: 4, hqlv };
  let anyShip = false;

  phase.fleets?.slice(0, 2).forEach((fl, fi) => {
    const f: any = {};
    fl.ships?.slice(0, 7).forEach((sh, si) => {
      const sid = resolveShipId(sh.ship, master);
      if (sid == null) return;
      // 练度取 box 中同舰(同改造线)最高练度实例
      const inst = box.ships
        .filter((b) => b.id === sid)
        .sort((a, b) => b.lv - a.lv)[0];
      const items: any = {};
      let slot = 1;
      for (const eq of sh.equips ?? []) {
        const iid = resolveItemId(eq.name, master);
        if (iid == null) continue;
        const rf = Number(/★\+?(\d+)/.exec(eq.name)?.[1] ?? 0);
        items[`i${slot}`] = { id: iid, rf };
        slot++;
        if (slot > 6) break;
      }
      f[`s${si + 1}`] = { id: String(sid), lv: inst?.lv ?? 99, items };
      anyShip = true;
    });
    deck[`f${fi + 1}`] = f;
  });

  phase.lbas?.slice(0, 3).forEach((b, bi) => {
    const items: any = {};
    b.planes?.slice(0, 4).forEach((pl, pi) => {
      const iid = resolveItemId(pl, master);
      if (iid == null) return;
      const rf = Number(/★\+?(\d+)/.exec(pl)?.[1] ?? 0);
      items[`i${pi + 1}`] = { id: iid, rf };
    });
    if (Object.keys(items).length) deck[`a${bi + 1}`] = { mode: 1, items };
  });

  if (!anyShip) return null;
  return `https://noro6.github.io/kc-web/?predeck=${encodeURIComponent(JSON.stringify(deck))}`;
}
