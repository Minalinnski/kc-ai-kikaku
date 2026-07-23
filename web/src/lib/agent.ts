import Anthropic from "@anthropic-ai/sdk";
import type {
  AgentRun,
  Box,
  GuidePack,
  Master,
  MapResult,
  OverviewResult,
  PrepResult,
} from "./types";
import { compactBoxText } from "./parseBox.ts";
import { verifyRun } from "./verify.ts";

export const MODELS = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8(推荐,质量最高)" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6(便宜约 40%)" },
];

const SYSTEM_PROMPT = `你是资深舰队Collection提督兼活动攻略参谋。用户提供了:①2026夏活(反撃!第三十一戦隊の戦い,E1-E5+E6)的中文社区攻略全文——含锁船推荐表、多号机推荐表、每阶段推荐编成的精确noro6配装数据(舰+装备改修+基地航空队+敌方配置);②玩家自己的完整box(全部舰娘与装备)。你的任务是把通用攻略"个性化":基于玩家实际拥有的舰、练度、改造状态、装备,给出这个玩家应该采用的锁船方案和逐图配装方案。

核心原则:
- 攻略是绝对主线:优先照抄攻略推荐;玩家没有该舰/该装备/练度不足时,先用攻略文中明确给出的替换逻辑降级;攻略未覆盖的替换才用你自己的游戏知识,并标注「攻略外推断」。
- 锁船是不可逆决策,宁可保守:同名舰多号机的分配严格参考「多号机推荐」表(按玩家实际持有数取对应列);拿不准时提示玩家风险,不要武断。
- 练度与改造红线:关键位练度明显不足要预警;「可改@N」表示该舰还能继续改造(未到最终/攻略所需形态),若攻略需要改后形态必须提醒先改造并评估等级差距。
- 装备只能用玩家box里实际存在的;同一装备多处需要时指出数量冲突;改修星级不足按攻略阈值提醒;基地航空队配置按玩家实际陆攻/陆战/陆侦库存现实化。
- 中文回答。舰名/装备名一律用游戏内原名(日文,与box一致),攻略中文昵称首次出现时在括号里保留以便对照。

攻略黑话对照:倍卡=特效加成;一号机/二号机/多号机=同名舰第1/2/N艘;札/条=出击海域锁定标签;混条=两个札可共同出击;开路=解锁路线的前置任务;削甲=破甲机制;摸/Touch=特殊攻击(ネルソンタッチ/大和一斉射等);鸭/鸭滑=Iowa;武大=武蔵+大和;长陆=長門+陸奥;蜜瓜=夕張;rj=龍驤;sara=Saratoga;wasp=Wasp;无畏=Intrepid;tst/塔斯特=Commandant Teste(法国水母);莫加=Mogador;标枪=Javelin;哥特兰=Gotland;英勇=Valiant;厌战=Warspite;谢菲=Sheffield;基洛夫=Киров;兰利=Langley;独立=Independence;轮椅=Colorado级BIG7摸(以上下文为准);J驱=Jervis/Janus/Javelin等英国J级驱逐;flc=Fletcher级;一拳dd=可对陆一击(大发+战车三件套)的驱逐;大发dd=可带大発動艇的驱逐;内火dd=可带特二式内火艇的驱逐;水见=水雷戦隊熟練見張員;先反=先制反潜;拉烟=発煙装置;打洞=开补强增设;喂运=运改修;婚舰=Lv100+;糊墙=高改修;金币弹=特四式内火艇等打洞消耗特攻;守家=基地防空;沟=索敌/编成条件不满足绕路;3V=三隈(三隈改二为水母,「3V一号/2号」=三隈第1/2艘);百一=第百一号輸送艦;AWW=阿武隈(阿武喂=阿武隈改二,先制雷击CL,与夕張2号互替)。任何昵称拿不准时,必须与锁船表原文该列的上下文和noro6机读数据交叉确认后再写入结果,严禁凭音译猜测。
黑话理解拿不准时,以攻略上下文和noro6配装数据(机读、精确)为准。`;

// ---------- 输出 JSON Schema ----------

function obj(props: Record<string, any>): any {
  return {
    type: "object",
    additionalProperties: false,
    required: Object.keys(props),
    properties: props,
  };
}
const str = { type: "string" };
const bool = { type: "boolean" };
const num = { type: "number" };
const arr = (items: any) => ({ type: "array", items });

const LOCK_SHIP_SCHEMA = obj({
  role: str,
  pick: str,
  owned: bool,
  level_note: str,
  alternatives: str,
  reason: str,
});

const OVERVIEW_SCHEMA = obj({
  difficulty: str,
  overview: str,
  lock_plan: arr(
    obj({
      tag: str,
      maps: str,
      ships: arr(LOCK_SHIP_SCHEMA),
      notes: str,
    }),
  ),
  dup_plan: arr(obj({ ship: str, owned_count: num, assignment: str })),
  prep: arr(str),
  risks: arr(str),
});

const PHASE_SCHEMA =
    obj({
      phase: str,
      tag: str,
      fleet_type: str,
      route: str,
      formation: str,
      fleets: arr(
        obj({
          label: str,
          ships: arr(
            obj({
              slot: num,
              ship: str,
              owned: bool,
              level_note: str,
              equips: arr(obj({ name: str, owned: bool, note: str })),
              why: str,
            }),
          ),
        }),
      ),
      lbas: arr(obj({ squad: str, planes: arr(str), target: str })),
      support: str,
      notes: str,
      warnings: arr(str),
      noro6_ref: str,
    });

const MAP_SCHEMA = obj({
  map: str,
  map_notes: str,
  phases: arr(PHASE_SCHEMA),
});

const PREP_SCHEMA = obj({
  summary: str,
  missing_ships: arr(
    obj({ ship: str, needed_for: str, how_to_get: str, alternative: str, priority: str }),
  ),
  level_gaps: arr(
    obj({ ship: str, current: str, target: str, reason: str, how: str, priority: str }),
  ),
  remodel_gaps: arr(obj({ ship: str, current: str, target: str, needs: str, priority: str })),
  equip_gaps: arr(
    obj({ item: str, have: num, need: num, source: str, workaround: str, priority: str }),
  ),
  checklist: arr(obj({ task: str, when: str, priority: str })),
});

const PREP_TASK = `# 任务:活动战前布局 —— 缺口清单与准备建议

以上面的锁船总方案为基准,对照 box 逐项盘点开打前要补的功课,输出可执行清单:

1. missing_ships 舰船缺口:方案/攻略点名但 box 未持有(或多号机数量不足)的舰。注明用途(哪张札/哪阶段)、获取途径(本活动海域可捞的优先——语料中E6捞船/各图掉落信息;其次通常海域掉落、建造/大建),来不及就给 box 内平替。
2. level_gaps 练度缺口:锁船方案 level_note 里标了练度不足/勉强的舰,给目标等级、理由与练法(远征旗舰/3-2/7-1/演习)。
3. remodel_gaps 改造缺口:需要的形态还没改到(改二/特/丙等),注明当前形态→目标形态、还差多少级、是否需要设计图/催化剂/战报等素材。
4. equip_gaps 装备缺口:逐图统计后紧张或缺失的关键装备,注明 have/need 数量、获取来源(开发公式/改修更新线/任务/活动段位奖励)与临时平替。
5. checklist 开打前行动清单:按优先级排序,每项给建议完成时点(活动 2026-07-08 已开,考虑剩余日程)。

规则:
- priority 统一用 P0(不做会卡关)/P1(显著降险)/P2(锦上添花);
- 数量核对以 box 为准,不要把已持有的报成缺口;练度以 box 实际 Lv 为准;
- 素材类只在攻略语料或明确常识支持时提及,不要臆造掉落率/公式。`;

const REPAIR_SCHEMA = obj({
  phase_patches: arr(obj({ map: str, phase: str, patched: PHASE_SCHEMA })),
  lock_patches: arr(obj({ tag: str, ships: arr(LOCK_SHIP_SCHEMA) })),
  notes: arr(str),
});

// ---------- Guide 语料渲染 ----------

export function renderGuideCorpus(pack: GuidePack): string {
  const parts: string[] = [];
  parts.push(
    `# 活动:${pack.event.name}(开始于 ${pack.event.started})\n攻略来源:${pack.event.guide_title}(${pack.event.guide_author}),抓取于 ${pack.built_at.slice(0, 10)}`,
  );

  // 锁船表
  const lt = pack.lock_table;
  parts.push(`\n# 锁船推荐表(原表逐格转录;括号内=可自选同功能船;斜线=可替换)`);
  parts.push((lt.notes as string[]).map((n: string) => `> ${n}`).join("\n"));
  for (const tag of lt.tags) {
    const phases = Object.entries(tag.phases_by_map)
      .map(([m, p]) => `${m}: ${p}`)
      .join(";");
    parts.push(`\n## 札「${tag.name}」(适用: ${phases})\n${tag.ships.join("\n")}`);
  }

  // 多号机表
  const dt = pack.dup_table;
  parts.push(`\n# 多号机推荐表(按持有数分配)`);
  parts.push((dt.notes as string[]).map((n: string) => `> ${n}`).join("\n"));
  for (const row of dt.by_owned_count) {
    const cols = ["1", "2", "3", "4/4+"]
      .filter((k) => row[k])
      .map((k) => `${k}号机→${row[k]}`)
      .join(";");
    parts.push(`- ${row.ship}: ${cols}`);
  }
  parts.push(`大发/一拳分配优先级: ${dt.daihatsu_priority}`);
  const dd = dt.daihatsu_dd_table;
  parts.push(
    `大发dd分级表 — 内火: ${dd["内火"].join("、")} / 一拳: ${dd["一拳"].join("、")} / 大发: ${dd["大发"].join("、")}`,
  );

  // 昵称对照(语料证据蒸馏,带证据)
  if (pack.cn_aliases?.length) {
    parts.push(
      `\n# 舰娘昵称对照表(从本攻略语料蒸馏,均有证据;遇到昵称以此表为准)\n` +
      pack.cn_aliases.map((a) => `${a.alias} = ${a.canonical}`).join(";"),
    );
  }

  // 主攻略全文(配图占位替换为视觉转录)
  const notes = pack.image_notes ?? {};
  const mainText = pack.main_text.replace(/\[IMAGE_(\d+)\]/g, (_m, idx) => {
    const n = notes[idx];
    return n ? `\n${n}\n` : "[配图:路线图或编成截图,编成精确数据见noro6机读数据]";
  });
  parts.push(
    `\n# 攻略正文全文(原文配图已替换为【】内的视觉转录;倍卡表数值为截图转录,个别小数可能有误,分组成员可信)\n${mainText}`,
  );

  // noro6 机读配装
  parts.push(`\n# noro6 机读配装数据(攻略中各短链的精确解码;★N=改修星级;[补强]=补强增设槽)`);
  for (const [code, cfg] of Object.entries(pack.noro6)) {
    const s = cfg.summary;
    const lines: string[] = [`\n## [${cfg.section}] ${cfg.url}${s.isUnion ? "(联合舰队)" : ""}`];
    s.fleets.forEach((fleet, i) => {
      if (!fleet.length) return;
      lines.push(`第${i + 1}舰队:`);
      for (const ship of fleet) {
        lines.push(`  ${ship.name} Lv${ship.lv}${ship.luck ? ` 运${ship.luck}` : ""} | ${ship.items.join(" / ")}`);
      }
    });
    if (s.airbases.length) {
      s.airbases.forEach((ab, i) => {
        lines.push(`基地航空队${i + 1}(mode${ab.mode},目标${JSON.stringify(ab.target)}): ${ab.items.join(" / ")}`);
      });
    }
    if (s.enemy_nodes.length) {
      const en = s.enemy_nodes
        .map((n) => `${n.node}[${n.enemies.map((e) => e.name).join(",")}]`)
        .join(" ");
      lines.push(`敌配置: ${en}`);
    }
    parts.push(lines.join("\n"));
  }

  // 低难度文档
  parts.push(`\n# 附:低难度解密&参考配置&奖励性价比(甲打不过/没时间才参考)\n${pack.lowdiff_text}`);

  return parts.join("\n");
}

// ---------- Agent 调用 ----------

export interface RunCallbacks {
  onStage: (stage: string, status: "start" | "done" | "error", detail?: string) => void;
  onProgress: (stage: string, chars: number) => void;
}

function makeClient(key: string): Anthropic {
  // 占位 key("__server__"/"__proxy__"):走同源 /anthropic 代理,真实 key 由服务端注入。
  if (key.startsWith("__")) {
    return new Anthropic({
      apiKey: key,
      baseURL: location.origin + "/anthropic",
      dangerouslyAllowBrowser: true,
    });
  }
  // 手动填写的真实 key:本地走代理(绕 CORS/组织限制),线上部署回退直连。
  const isLocal = /^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname);
  const baseURL = isLocal ? location.origin + "/anthropic" : undefined;
  // sk-ant-oat…= OAuth token(Bearer + oauth beta 头);sk-ant-api…= 标准 API Key
  if (key.startsWith("sk-ant-oat")) {
    return new Anthropic({
      authToken: key,
      baseURL,
      dangerouslyAllowBrowser: true,
      defaultHeaders: { "anthropic-beta": "oauth-2025-04-20" },
    });
  }
  return new Anthropic({ apiKey: key, baseURL, dangerouslyAllowBrowser: true });
}

async function callStructured(
  client: Anthropic,
  model: string,
  guideCorpus: string,
  boxText: string,
  extraContext: string | null,
  task: string,
  schema: any,
  maxTokens: number,
  onProgress: (chars: number) => void,
  onFirstToken?: () => void,
): Promise<{ result: any; usage: any }> {
  const content: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: `<攻略语料>\n${guideCorpus}\n</攻略语料>`,
      cache_control: { type: "ephemeral", ttl: "1h" },
    },
    {
      type: "text",
      text: `<玩家box>\n${boxText}\n</玩家box>`,
      cache_control: { type: "ephemeral", ttl: "1h" },
    },
  ];
  if (extraContext) {
    content.push({
      type: "text",
      text: extraContext,
      cache_control: { type: "ephemeral", ttl: "1h" },
    });
  }
  content.push({ type: "text", text: task });

  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    thinking: { type: "adaptive", display: "summarized" },
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } },
    ],
    output_config: { format: { type: "json_schema", schema } },
    messages: [{ role: "user", content }],
  } as any);

  // 进度=思考摘要+正文字符数(思考阶段也让用户看到在动)
  let chars = 0;
  let started = false;
  stream.on("streamEvent", (ev: any) => {
    if (!started && ev.type === "message_start") {
      started = true;
      onFirstToken?.(); // 服务端已开始响应 = 缓存前缀已写入,可放行并行请求
    }
    if (ev.type === "content_block_delta") {
      const d = ev.delta;
      chars += (d?.text?.length ?? 0) + (d?.thinking?.length ?? 0);
      onProgress(chars);
    }
  });
  const final = await stream.finalMessage();
  if (final.stop_reason === "max_tokens") {
    throw new Error("输出超长被截断,请重试(或换 Opus 模型)");
  }
  if (final.stop_reason === "refusal") {
    throw new Error("请求被安全策略拒绝,请重试");
  }
  const text = final.content.find((b: any) => b.type === "text") as any;
  if (!text) throw new Error("未返回文本内容");
  return { result: JSON.parse(text.text), usage: final.usage };
}

function accUsage(run: AgentRun, usage: any) {
  run.usage.input += usage.input_tokens ?? 0;
  run.usage.output += usage.output_tokens ?? 0;
  run.usage.cache_read += usage.cache_read_input_tokens ?? 0;
  run.usage.cache_write += usage.cache_creation_input_tokens ?? 0;
}

const OVERVIEW_TASK = `# 任务:个性化锁船总方案

通读上方全部攻略语料和玩家box,输出这个玩家的锁船总方案:

1. difficulty — 推荐难度选择(结合box强度评估,如「全甲」「E4乙其余甲」),附一句话理由。
2. overview — 全局分析(markdown,600~1500字):这个box打本次活动的强弱点;攻略点名的关键倍卡舰/摸手持有情况;关键多号机持有情况(黎塞留/让巴尔、大和武藏、矢矧、秋月初月、莫加多尔、J驱等);与攻略默认阵容的主要差异和整体策略。
3. lock_plan — 按攻略锁船表的全部13个札逐一输出:tag=札名;maps=适用海域阶段;ships=该札每个位置(覆盖攻略原表的所有行):role=攻略原文的角色描述,pick=推荐这个玩家锁的具体舰(用box中的确切形态名),owned=box里是否有可用舰,level_note=练度/改造评估(如「Lv55偏低,建议练到70+」「需先改造,当前Lv48/需50」,没问题则写「OK」),alternatives=box内可行的备选,reason=选择理由(引用攻略逻辑);notes=该札整体注意事项。
4. dup_plan — 攻略多号机表涉及的舰,按玩家实际持有数给出分配(ship=舰名,owned_count=持有数,assignment=分配方案)。
5. prep — 开打前准备清单,按优先级排列(练级/改造/改修/远征攒资源等,具体到舰名和目标等级)。
6. risks — 风险与注意事项(锁船不可逆的高风险点、数量冲突、攻略更新可能影响的点)。

要求:锁船表必须完整覆盖攻略原表的所有札与位置;玩家缺失的位置给出降级替代,或明确写「放弃该位」并说明影响。`;

function mapTask(mapId: string, overviewJson: string): string {
  return `# 任务:${mapId} 个性化配装方案

已确定的锁船总方案(前一步输出,舰位分配以此为准):
<锁船总方案>
${overviewJson}
</锁船总方案>

现在为 ${mapId} 的每个阶段输出具体编成与配装。覆盖攻略中 ${mapId} 的全部小节:各开路(P*开路)、各正攻阶段(P1/P2/...)、解密、削甲。要求:

- phases[].phase=阶段名(与攻略小节一致);tag=所贴的札;fleet_type=单舰队/游击/联合(水打/机动/运输);route=路线(照抄攻略,含节点类型);formation=阵型序列。
- fleets=每支舰队逐位落实:ship=玩家box中的确切舰名形态;equips=逐槽装备(用box里的确切装备名,标注建议星级,owned=玩家是否有该装备;没有则给box内最接近替代并在note说明损失);why=该位选择理由(倍卡/带路/工具人等,引用攻略)。开路/解密等简单阶段可给简化编成(舰种要求+推荐舰),但正攻阶段必须逐槽配装。
- lbas=基地航空队,按玩家实际陆攻库存现实化(squad=第N队,planes=4机位,target=目标点/防空)。
- support=支援舰队建议;notes=该阶段其他要点(制空阈值/索敌/拉烟/退避等,照抄攻略数字);warnings=这个玩家在该阶段的具体缺口;noro6_ref=对应的攻略noro6链接(如有)。
- map_notes=该图整体注意(削甲是否推荐、与其他图的锁船联动)。

装备分配注意:同一装备在多个阶段复用没问题(不同时出击),但与其他图的关键需求冲突时要在warnings里提示。`;
}

export async function runAgent(
  apiKey: string,
  model: string,
  pack: GuidePack,
  box: Box,
  master: Master,
  maps: string[],
  callbacks: RunCallbacks,
  existingRun?: AgentRun | null,
): Promise<AgentRun> {
  const client = makeClient(apiKey);
  const guideCorpus = renderGuideCorpus(pack);
  const boxText = compactBoxText(box, master);

  const run: AgentRun = existingRun ?? {
    model,
    started_at: new Date().toISOString(),
    maps: {},
    errors: {},
    usage: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
  };

  // 阶段1:总览+锁船
  if (!run.overview) {
    callbacks.onStage("overview", "start");
    try {
      const { result, usage } = await callStructured(
        client, model, guideCorpus, boxText, null,
        OVERVIEW_TASK, OVERVIEW_SCHEMA, 64000,
        (c) => callbacks.onProgress("overview", c),
      );
      run.overview = result as OverviewResult;
      accUsage(run, usage);
      delete run.errors["overview"];
      callbacks.onStage("overview", "done");
    } catch (e) {
      run.errors["overview"] = String((e as Error).message ?? e);
      callbacks.onStage("overview", "error", run.errors["overview"]);
      return run; // 总览失败则不继续
    }
  }

  // 阶段2:逐图配装(DAG:全部依赖锁船总方案;共享前缀走 prompt cache)
  const overviewJson = JSON.stringify(run.overview);
  const runMap = async (mapId: string, onFirstToken?: () => void) => {
    callbacks.onStage(mapId, "start");
    try {
      const { result, usage } = await callStructured(
        client, model, guideCorpus, boxText,
        `<锁船总方案参考>\n${overviewJson}\n</锁船总方案参考>`,
        mapTask(mapId, "(见上方锁船总方案参考)"),
        MAP_SCHEMA, 64000,
        (c) => callbacks.onProgress(mapId, c),
        onFirstToken,
      );
      run.maps[mapId] = result as MapResult;
      accUsage(run, usage);
      delete run.errors[mapId];
      callbacks.onStage(mapId, "done");
    } catch (e) {
      run.errors[mapId] = String((e as Error).message ?? e);
      callbacks.onStage(mapId, "error", run.errors[mapId]);
    }
  };
  // 战前布局:与逐图同级并行(同样只依赖锁船总方案,共享热缓存)
  const runPrep = async () => {
    callbacks.onStage("prep", "start");
    try {
      const { result, usage } = await callStructured(
        client, model, guideCorpus, boxText,
        `<锁船总方案参考>\n${overviewJson}\n</锁船总方案参考>`,
        PREP_TASK, PREP_SCHEMA, 64000,
        (c) => callbacks.onProgress("prep", c),
      );
      run.prep = result as PrepResult;
      accUsage(run, usage);
      delete run.errors["prep"];
      callbacks.onStage("prep", "done");
    } catch (e) {
      run.errors["prep"] = String((e as Error).message ?? e);
      callbacks.onStage("prep", "error", run.errors["prep"]);
    }
  };
  const pending = maps.filter((m) => !run.maps[m]);
  const needPrep = !run.prep;
  if (pending.length) {
    // 全并行(首token门控):首图请求一旦开始响应,缓存前缀即已写入,
    // 立刻放行其余图并行 —— 兼得缓存读价与最大并行度。
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const first = runMap(pending[0], release);
    await Promise.race([gate, first]); // 出错提前结束也放行
    await Promise.all([
      first,
      ...pending.slice(1).map((m) => runMap(m)),
      ...(needPrep ? [runPrep()] : []),
    ]);
  } else if (needPrep) {
    await runPrep();
  }

  // 阶段3:机器校验 → 自动修复回路(只改冲突位)→ 复检
  try {
    let v = verifyRun(run, box, master);
    let hard = v.violations.filter((x) => x.level === "error");
    run.verify = { errors: hard.length, warns: v.violations.length - hard.length };
    // 按图分批并行修复(每批只回写本图补丁,输出小、缓存热、单批失败不拖累其他批);
    // 修复可能引入次生冲突(替代装备再超量),最多迭代3轮收敛
    for (let repairIter = 0; repairIter < 3 && hard.length && run.overview; repairIter++) {
      callbacks.onStage("repair", "start", `第${repairIter + 1}轮,${hard.length} 个冲突分批并行`);
      const batches = new Map<string, typeof hard>();
      for (const x of hard) {
        const m = x.where.match(/^(E\d+)·/);
        const key = m ? m[1] : "lock";
        if (!batches.has(key)) batches.set(key, []);
        batches.get(key)!.push(x);
      }
      const progress = new Map<string, number>();
      const report = () =>
        callbacks.onProgress("repair", [...progress.values()].reduce((a, b) => a + b, 0));
      const repairBatch = async (key: string, list: typeof hard) => {
        const affectedPhases: any[] = [];
        for (const where of new Set(list.map((x) => x.where))) {
          const m = where.match(/^(E\d+)·(.+)$/);
          if (!m) continue;
          const ph = run.maps[m[1]]?.phases.find((p) => p.phase === m[2]);
          if (ph) affectedPhases.push({ map: m[1], phase: ph });
        }
        const lockTags = new Set(
          list.map((x) => x.where.match(/^锁船表·(.+)$/)?.[1]).filter(Boolean),
        );
        const affectedLocks = run.overview!.lock_plan.filter((t) => lockTags.has(t.tag));
        const repairTask = `# 任务:修复机器校验发现的硬冲突(仅 ${key === "lock" ? "锁船总表" : key})

下面是对你此前方案的确定性校验结果(装备/舰娘持有量为box精确统计,不可能出错),以及受影响部分的当前方案JSON。请只修改冲突相关的位置,其余内容原样保留:

<硬冲突清单>
${list.map((x) => `[${x.where}] ${x.msg}`).join("\n")}
</硬冲突清单>

<受影响的阶段方案>
${JSON.stringify(affectedPhases)}
</受影响的阶段方案>

<受影响的锁船条目>
${JSON.stringify(affectedLocks)}
</受影响的锁船条目>

修复规则:
- 装备超量:改用box内确实存在的替代装备(参考攻略平替逻辑),或在多舰间重新分配;修改处在 note/why 里注明「机器校验修正」及原因。
- 舰娘超量/重复:换成box内的可用替代舰,同步保持与锁船表一致。
- 每个 phase_patch 输出该阶段完整JSON(patched),lock_patch 输出该札完整 ships 数组。
- 只处理上面清单里的冲突,不要输出无关阶段;无法修复的冲突写入 notes 说明取舍。`;
        const { result, usage } = await callStructured(
          client, model, guideCorpus, boxText,
          `<锁船总方案参考>\n${overviewJson}\n</锁船总方案参考>`,
          repairTask, REPAIR_SCHEMA, 64000,
          (c) => { progress.set(key, c); report(); },
        );
        return { result, usage };
      };
      const settled = await Promise.allSettled(
        [...batches.entries()].map(([k, list]) => repairBatch(k, list)),
      );
      const failed: string[] = [];
      settled.forEach((s, i) => {
        const key = [...batches.keys()][i];
        if (s.status === "rejected") { failed.push(key); return; }
        const { result, usage } = s.value;
        for (const p of result.phase_patches ?? []) {
          const arrp = run.maps[p.map]?.phases;
          const idx = arrp ? arrp.findIndex((x) => x.phase === p.phase) : -1;
          if (arrp && idx >= 0) arrp[idx] = p.patched;
        }
        for (const lp of result.lock_patches ?? []) {
          const t = run.overview!.lock_plan.find((x) => x.tag === lp.tag);
          if (t) t.ships = lp.ships;
        }
        accUsage(run, usage);
      });
      v = verifyRun(run, box, master);
      hard = v.violations.filter((x) => x.level === "error");
      run.verify = { errors: hard.length, warns: v.violations.length - hard.length, repaired: true };
      callbacks.onStage(
        "repair", "done",
        `第${repairIter + 1}轮修复后剩余硬冲突 ${hard.length}` +
          (failed.length ? `(${failed.join("/")} 批失败,下轮重试)` : ""),
      );
    }
  } catch (e) {
    callbacks.onStage("repair", "error", String((e as Error).message ?? e));
  }

  run.finished_at = new Date().toISOString();
  return run;
}

/** 粗略成本估算(美元) */
export function estimateCost(run: AgentRun, model: string): number {
  const price =
    model === "claude-opus-4-8"
      ? { in: 5, out: 25 }
      : { in: 3, out: 15 };
  return (
    (run.usage.input * price.in +
      run.usage.cache_write * price.in * 1.25 +
      run.usage.cache_read * price.in * 0.1 +
      run.usage.output * price.out) /
    1e6
  );
}
