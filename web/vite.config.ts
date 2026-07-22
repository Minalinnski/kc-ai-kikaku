import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import vue from "@vitejs/plugin-vue";
import { Agent } from "node:https";

// 本地代理:浏览器请求同源 /anthropic/*,由 dev/preview 服务器转发到 Anthropic。
// - 去掉 Origin 头:绕开浏览器 CORS 与组织级 browser-access 限制
// - family:4 强制 IPv4(部分网络下 node 的 IPv6 连接会黑洞超时)
// - 浏览器只发占位 key("__proxy__"),真实 key 从 web/.env 读取后在此注入,
//   因此 key 永远不会进入前端 bundle。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "VITE_");
  const realKey = (env.VITE_ANTHROPIC_API_KEY ?? "").trim();

  const anthropicProxy: Record<string, ProxyOptions> = {
    "/anthropic": {
      target: "https://api.anthropic.com",
      changeOrigin: true,
      agent: new Agent({ family: 4, keepAlive: true }),
      rewrite: (p) => p.replace(/^\/anthropic/, ""),
      configure: (proxy) => {
        proxy.on("proxyReq", (proxyReq) => {
          proxyReq.removeHeader("origin");
          if (realKey && proxyReq.getHeader("x-api-key") === "__proxy__") {
            proxyReq.setHeader("x-api-key", realKey);
          }
        });
      },
    },
  };

  return {
    plugins: [vue()],
    base: "./",
    build: {
      chunkSizeWarningLimit: 1500,
    },
    server: { proxy: anthropicProxy },
    preview: { proxy: anthropicProxy },
  };
});
