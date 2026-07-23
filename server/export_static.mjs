/**
 * 封板静态导出:把某用户的跑批结果 + master/guide 数据全部内嵌进单个 HTML。
 * 产物离线可开(file://),只读展示 锁船总表/战前布局/逐图配装/贴条校验。
 *
 *   node server/export_static.mjs <user> [out.html]
 *
 * 依赖:web/dist 已构建(cd web && npm run build)、server/runs/<user>.json 存在。
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DIST = join(ROOT, "web", "dist");

const user = process.argv[2];
const out = process.argv[3] ?? join(ROOT, `report_${user}.html`);
const savePath = join(__dirname, "runs", `${user ?? ""}.json`);
if (!user || !existsSync(savePath)) {
  console.error("用法: node server/export_static.mjs <user> [out.html](需要 server/runs/<user>.json)");
  process.exit(1);
}
if (!existsSync(join(DIST, "index.html"))) {
  console.error("web/dist 不存在,先构建:cd web && npm run build");
  process.exit(1);
}

const save = JSON.parse(readFileSync(savePath, "utf8"));
const snapshot = {
  user,
  generated_at: new Date().toISOString(),
  box: save.box,
  run: save.run,
  master: JSON.parse(readFileSync(join(ROOT, "web/public/data/master.json"), "utf8")),
  pack: JSON.parse(readFileSync(join(ROOT, "web/public/data/guide.json"), "utf8")),
};
// </script> 防拆 + HTML 注入安全:所有 < 转成 <(合法 JSON 转义)
const snapJs = JSON.stringify(snapshot).replace(/</g, "\\u003c");

const asset = (href) => readFileSync(join(DIST, href.replace(/^\.?\//, "")), "utf8");

let html = readFileSync(join(DIST, "index.html"), "utf8");
html = html.replace(/[ \t]*<link rel="modulepreload"[^>]*>\n?/g, "");
html = html.replace(
  /<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
  (_, href) => `<style>\n${asset(href)}\n</style>`,
);
html = html.replace(
  /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,
  (_, src) =>
    `<script>window.__SNAPSHOT__=${snapJs}</script>\n<script type="module">${asset(src)}</script>`,
);
if (!html.includes("__SNAPSHOT__")) {
  console.error("注入失败:dist/index.html 结构与预期不符");
  process.exit(1);
}

writeFileSync(out, html);
console.log(`封板报告 → ${out}(${(html.length / 1e6).toFixed(1)} MB,离线单文件)`);
