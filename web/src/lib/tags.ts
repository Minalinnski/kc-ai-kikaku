/** 札 → 游戏内札牌配色(取自锁船表/游戏内札图标的主色) */
const TAG_COLORS: [string, string][] = [
  ["增强第三十一", "#8d99a6"],
  ["第三十一", "#aab4bd"],
  ["多号", "#d9a62e"],
  ["联合", "#6fbf73"],
  ["乌利西", "#4fc3d9"],
  ["第六", "#5b8ddb"],
  ["法第三", "#e8927c"],
  ["法地中海", "#e06c75"],
  ["第二轻型", "#45b8ac"],
  ["英国救援", "#a5c94f"],
  ["强袭", "#e5484d"],
  ["Force", "#9d7cd8"],
  ["ForceH", "#9d7cd8"],
  ["欧洲联合", "#3fb6a8"],
];

export function tagColor(name: string): string {
  for (const [key, color] of TAG_COLORS) {
    if (name.includes(key)) return color;
  }
  return "#7a8794";
}

/** chip 的内联样式(底色加透明度,文字用原色提亮) */
export function tagChipStyle(name: string): Record<string, string> {
  const c = tagColor(name);
  return {
    background: c + "22",
    borderColor: c + "66",
    color: c,
  };
}
