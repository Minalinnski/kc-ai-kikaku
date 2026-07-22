import { defineConfig, type ProxyOptions } from "vite";
import vue from "@vitejs/plugin-vue";
import { Agent } from "node:https";

// 本地代理:浏览器请求同源 /anthropic/*,由 dev/preview 服务器转发到 Anthropic
// 并去掉 Origin 头 —— 绕开浏览器 CORS 与组织级 browser-access 限制。
// family:4 强制 IPv4(部分网络下 node 的 IPv6 连接会超时黑洞)。
const anthropicProxy: Record<string, ProxyOptions> = {
  "/anthropic": {
    target: "https://api.anthropic.com",
    changeOrigin: true,
    agent: new Agent({ family: 4, keepAlive: true }),
    rewrite: (p) => p.replace(/^\/anthropic/, ""),
    configure: (proxy) => {
      proxy.on("proxyReq", (proxyReq) => {
        proxyReq.removeHeader("origin");
      });
    },
  },
};

export default defineConfig({
  plugins: [vue()],
  base: "./",
  build: {
    chunkSizeWarningLimit: 1500,
  },
  server: { proxy: anthropicProxy },
  preview: { proxy: anthropicProxy },
});
