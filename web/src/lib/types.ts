// ---- Master 数据 ----
export interface MasterShip {
  name: string;
  yomi: string;
  stype: number;
  ctype: number;
  speed: number;
  slots: number;
  luck: number;
  before: number;
  next: number;
  next_lv: number;
  final: number;
  orig: number;
  sort: number;
}

export interface MasterItem {
  name: string;
  type: number;
  icon: number;
  abbr: string;
}

export interface Master {
  ships: Record<string, MasterShip>;
  items: Record<string, MasterItem>;
}

// ---- 玩家 Box ----
export interface BoxShip {
  id: number; // master ship id(当前形态)
  lv: number;
  luck: number | null; // 总运(基础+改修),未知为 null
  sally: number; // api_sally_area 出击札,0=未锁
  locked: boolean; // ❤锁
}

export interface BoxEquip {
  id: number; // master slotitem id
  level: number; // 改修星级
}

export interface Box {
  ships: BoxShip[];
  equips: BoxEquip[];
  source: string; // 导入格式说明
  imported_at: string;
}

// ---- Guide pack ----
export interface GuidePack {
  event: {
    name: string;
    name_cn: string;
    started: string;
    maps: string[];
    guide_title: string;
    guide_author: string;
    guide_url: string;
  };
  built_at: string;
  main_text: string;
  lowdiff_text: string;
  lock_table: any;
  dup_table: any;
  noro6: Record<
    string,
    { section: string; url: string; summary: Noro6Summary }
  >;
  images: Record<string, { file: string; w: number; h: number }>;
}

export interface Noro6Ship {
  id: number;
  name: string;
  lv: number;
  luck: number;
  items: string[];
}

export interface Noro6Summary {
  isUnion: boolean;
  admiralLevel: number;
  fleets: Noro6Ship[][];
  airbases: { mode: number; target: number[]; items: string[] }[];
  enemy_nodes: {
    area: number;
    node: string;
    formation: number;
    enemies: { id: number; name: string }[];
  }[];
}

// ---- Agent 输出 ----
export interface LockPlanShip {
  role: string;
  pick: string;
  owned: boolean;
  level_note: string;
  alternatives: string;
  reason: string;
}

export interface LockPlanTag {
  tag: string;
  maps: string;
  ships: LockPlanShip[];
  notes: string;
}

export interface OverviewResult {
  difficulty: string;
  overview: string;
  lock_plan: LockPlanTag[];
  dup_plan: { ship: string; owned_count: number; assignment: string }[];
  prep: string[];
  risks: string[];
}

export interface PlanEquip {
  name: string;
  owned: boolean;
  note: string;
}

export interface PlanShip {
  slot: number;
  ship: string;
  owned: boolean;
  level_note: string;
  equips: PlanEquip[];
  why: string;
}

export interface PlanFleet {
  label: string;
  ships: PlanShip[];
}

export interface PlanPhase {
  phase: string;
  tag: string;
  fleet_type: string;
  route: string;
  formation: string;
  fleets: PlanFleet[];
  lbas: { squad: string; planes: string[]; target: string }[];
  support: string;
  notes: string;
  warnings: string[];
  noro6_ref: string;
}

export interface MapResult {
  map: string;
  map_notes: string;
  phases: PlanPhase[];
}

export interface AgentRun {
  model: string;
  started_at: string;
  finished_at?: string;
  overview?: OverviewResult;
  maps: Record<string, MapResult>;
  errors: Record<string, string>;
  usage: { input: number; output: number; cache_read: number; cache_write: number };
}
