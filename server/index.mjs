/**
 * KC AI 企画室 · 自托管服务器(零依赖,Node 18+)
 *
 *   node server/index.mjs
 *
 * 功能:托管 web/dist 静态站 + 简单帐密登录 + /anthropic 代理(服务端注入 API Key,
 * 浏览器永远接触不到 key)。配置见 server/.env(参考 server/.env.example)。
 */
import { createServer } from "node:http";
import { request as httpsRequest, Agent } from "node:https";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DIST = join(ROOT, "web", "dist");

// ── 配置 ──────────────────────────────────────────────
function loadEnvFile(p) {
  const out = {};
  if (!existsSync(p)) return out;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#")) out[m[1]] = m[2];
  }
  return out;
}
const envFile = loadEnvFile(join(__dirname, ".env"));
const webEnv = loadEnvFile(join(ROOT, "web", ".env"));

const PORT = Number(process.env.PORT || envFile.PORT || 8787);
const API_KEY =
  process.env.ANTHROPIC_API_KEY || envFile.ANTHROPIC_API_KEY || webEnv.VITE_ANTHROPIC_API_KEY || "";
const USERS = Object.fromEntries(
  (process.env.AUTH_USERS || envFile.AUTH_USERS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf(":");
      return [pair.slice(0, i), pair.slice(i + 1)];
    }),
);
const SECRET = process.env.SESSION_SECRET || envFile.SESSION_SECRET || randomBytes(32).toString("hex");
const SESSION_DAYS = 30;

if (!API_KEY) {
  console.error("✗ 缺少 ANTHROPIC_API_KEY(server/.env 或 web/.env 的 VITE_ANTHROPIC_API_KEY)");
  process.exit(1);
}
if (!Object.keys(USERS).length) {
  console.error('✗ 缺少 AUTH_USERS(server/.env,格式 AUTH_USERS=alice:pw1,bob:pw2)');
  process.exit(1);
}
if (!existsSync(DIST)) {
  console.error("✗ web/dist 不存在,先构建:cd web && npm run build:server");
  process.exit(1);
}
// 安全检查:构建产物里不允许出现真实 key 的值
for (const f of readdirSync(join(DIST, "assets"))) {
  if (f.endsWith(".js") && readFileSync(join(DIST, "assets", f), "utf8").includes(API_KEY)) {
    console.error(`✗ dist/assets/${f} 中打包进了真实 API Key!请重新 cd web && npm run build`);
    process.exit(1);
  }
}

// ── 会话 ──────────────────────────────────────────────
const sign = (s) => createHmac("sha256", SECRET).update(s).digest("base64url");
function makeCookie(user) {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const payload = `${Buffer.from(user).toString("base64url")}.${exp}`;
  return `${payload}.${sign(payload)}`;
}
function verifyCookie(raw) {
  if (!raw) return null;
  const m = /(?:^|;\s*)kcsid=([^;]+)/.exec(raw);
  if (!m) return null;
  const parts = m[1].split(".");
  if (parts.length !== 3) return null;
  const payload = `${parts[0]}.${parts[1]}`;
  const expect = sign(payload);
  const got = parts[2];
  if (expect.length !== got.length || !timingSafeEqual(Buffer.from(expect), Buffer.from(got))) return null;
  if (Number(parts[1]) < Date.now()) return null;
  return Buffer.from(parts[0], "base64url").toString();
}

// 朴素登录限速:每 IP 每分钟 8 次
const attempts = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const rec = attempts.get(ip) ?? [];
  const recent = rec.filter((t) => now - t < 60_000);
  recent.push(now);
  attempts.set(ip, recent);
  return recent.length > 8;
}

// ── 工具 ──────────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".webp": "image/webp",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain",
};
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolvep, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 1e6) { reject(new Error("body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolvep(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const upstreamAgent = new Agent({ family: 4, keepAlive: true });

// ── 服务器 ────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const path = url.pathname;
  const user = verifyCookie(req.headers.cookie);

  // API:登录/登出/状态
  if (path === "/api/login" && req.method === "POST") {
    const ip = req.socket.remoteAddress ?? "?";
    if (rateLimited(ip)) return sendJSON(res, 429, { error: "尝试过于频繁,稍后再试" });
    let body;
    try { body = JSON.parse((await readBody(req)).toString() || "{}"); } catch { body = {}; }
    const { user: u, pass } = body;
    if (u && USERS[u] !== undefined && USERS[u] === String(pass ?? "")) {
      res.writeHead(200, {
        "content-type": "application/json",
        "set-cookie": `kcsid=${makeCookie(u)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`,
      });
      return res.end(JSON.stringify({ ok: true, user: u }));
    }
    console.log(`[login-fail] ${ip} user=${u ?? "?"}`);
    return sendJSON(res, 401, { error: "帐号或密码不对" });
  }
  if (path === "/api/logout" && req.method === "POST") {
    res.writeHead(200, {
      "content-type": "application/json",
      "set-cookie": "kcsid=; Path=/; HttpOnly; Max-Age=0",
    });
    return res.end(JSON.stringify({ ok: true }));
  }
  if (path === "/api/me") {
    return sendJSON(res, 200, { server: true, auth: !!user, user: user ?? null });
  }

  // Anthropic 代理(需登录;服务端注入 key)
  if (path.startsWith("/anthropic/")) {
    if (!user) return sendJSON(res, 401, { error: "未登录" });
    const t0 = Date.now();
    res.on("close", () => {
      console.log(`[anthropic] ${user} ${req.method} ${path.slice(10)} → ${res.statusCode} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    });
    const headers = { ...req.headers };
    delete headers.host; delete headers.origin; delete headers.referer;
    delete headers.cookie; delete headers["x-api-key"]; delete headers.authorization;
    delete headers["content-length"];
    headers["x-api-key"] = API_KEY;
    const upstream = httpsRequest(
      {
        host: "api.anthropic.com",
        path: path.replace(/^\/anthropic/, "") + url.search,
        method: req.method,
        headers,
        agent: upstreamAgent,
      },
      (ur) => {
        res.writeHead(ur.statusCode ?? 502, ur.headers);
        ur.pipe(res);
      },
    );
    upstream.on("error", (e) => {
      console.error("[proxy]", e.message);
      if (!res.headersSent) sendJSON(res, 502, { error: "上游连接失败" });
      else res.end();
    });
    req.pipe(upstream);
    return;
  }

  // 静态站(登录后才可访问;未登录只放行首页壳,由前端展示登录框)
  let file = path === "/" ? "/index.html" : decodeURIComponent(path);
  if (file.includes("..")) { res.writeHead(400); return res.end(); }
  let full = join(DIST, file);
  if (!existsSync(full)) full = join(DIST, "index.html"); // SPA fallback
  try {
    const data = readFileSync(full);
    res.writeHead(200, { "content-type": MIME[extname(full)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404); res.end("not found");
  }
});

server.listen(PORT, () => {
  console.log(`⚓ KC AI 企画室 server 启动: http://localhost:${PORT}`);
  console.log(`   用户: ${Object.keys(USERS).join(", ")} · key: ${API_KEY.slice(0, 14)}…`);
});
