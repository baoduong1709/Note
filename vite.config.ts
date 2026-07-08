import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
function apiProxyMiddleware() {
  return {
    name: "local-api-proxy",
    configureServer(server) {
      server.middlewares.use("/api-proxy", async (req, res) => {
        try {
          const targetOrigin = req.headers["x-target-url"];
          if (typeof targetOrigin !== "string" || !targetOrigin.trim()) {
            res.statusCode = 400;
            res.end("Missing x-target-url header");
            return;
          }

          const target = new URL(req.url || "/", targetOrigin);
          const chunks = [];
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
          const headers = new Headers();

          const skippedHeaders = new Set([
            "host",
            "connection",
            "content-length",
            "x-target-url",
            "accept-encoding",
            "sec-fetch-site",
            "sec-fetch-mode",
            "sec-fetch-dest"
          ]);

          for (const [key, value] of Object.entries(req.headers)) {
            if (!value || skippedHeaders.has(key.toLowerCase())) {
              continue;
            }
            headers.set(key, Array.isArray(value) ? value.join(", ") : value);
          }

          headers.set(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
          );
          headers.set("Accept-Language", "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7");
          headers.set("Accept-Encoding", "identity");

          const upstream = await fetch(target, {
            method: req.method,
            headers,
            body: req.method === "GET" || req.method === "HEAD" ? undefined : body
          });

          res.statusCode = upstream.status;
          upstream.headers.forEach((value, key) => {
            if (!["content-encoding", "transfer-encoding", "connection"].includes(key.toLowerCase())) {
              res.setHeader(key, value);
            }
          });

          const buffer = Buffer.from(await upstream.arrayBuffer());
          res.end(buffer);
        } catch (error) {
          console.error("API proxy error:", error);
          res.statusCode = 502;
          res.end("API proxy error");
        }
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), apiProxyMiddleware()],

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
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:3001',
        ws: true,
      },
    },
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    }
  },
}));
