import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { request as httpsRequest } from "node:https";
import { request as httpRequest, type IncomingMessage } from "node:http";

const PROXY_PREFIX = "/cors-proxy/";

function corsProxyPlugin(): Plugin {
  return {
    name: "cors-proxy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(PROXY_PREFIX)) return next();

        const targetUrl = decodeURIComponent(
          req.url.slice(PROXY_PREFIX.length),
        );

        if (req.method === "OPTIONS") {
          res.writeHead(204, corsHeaders());
          res.end();
          return;
        }

        let parsed: URL;
        try {
          parsed = new URL(targetUrl);
        } catch {
          res.writeHead(400);
          res.end("Invalid target URL");
          return;
        }

        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
          if (["host", "origin", "referer", "connection"].includes(key))
            continue;
          if (value)
            headers[key] = Array.isArray(value) ? value.join(", ") : value;
        }
        headers["host"] = parsed.host;

        const doRequest =
          parsed.protocol === "https:" ? httpsRequest : httpRequest;

        const proxyReq = doRequest(
          parsed,
          { method: req.method, headers },
          (proxyRes: IncomingMessage) => {
            const respHeaders: Record<string, string | string[]> = {};
            for (const [key, value] of Object.entries(proxyRes.headers)) {
              if (value) respHeaders[key] = value;
            }
            Object.assign(respHeaders, corsHeaders());

            res.writeHead(proxyRes.statusCode ?? 502, respHeaders);
            proxyRes.pipe(res);
          },
        );

        req.pipe(proxyReq);
        proxyReq.on("error", (err) => {
          if (!res.headersSent) {
            res.writeHead(502, corsHeaders());
            res.end(`Proxy error: ${err.message}`);
          }
        });
      });
    },
  };
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "*",
    "access-control-allow-headers": "*",
    "access-control-expose-headers": "*",
  };
}

export default defineConfig({
  plugins: [corsProxyPlugin(), react()],
});
