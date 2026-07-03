import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
    proxy: {
      "/api-proxy": {
        target: "https://placeholder.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-proxy/, ""),
        router: (req) => {
          const targetUrl = req.headers["x-target-url"];
          return typeof targetUrl === "string" ? targetUrl : "https://placeholder.com";
        },
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            const targetUrl = req.headers["x-target-url"];
            if (typeof targetUrl === "string" && targetUrl.trim()) {
              try {
                const parsed = new URL(targetUrl);
                proxyReq.setHeader("Origin", parsed.origin);
                proxyReq.setHeader("Referer", parsed.origin + "/");
                proxyReq.removeHeader("sec-fetch-site");
                proxyReq.removeHeader("sec-fetch-mode");
                proxyReq.removeHeader("sec-fetch-dest");
              } catch (e) {
                console.error("Proxy URL parsing error:", e);
              }
            }
          });
        }
      }
    }
  },
}));
