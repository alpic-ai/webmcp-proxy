import {
  Client,
  StreamableHTTPClientTransport,
  SSEClientTransport,
  type Transport,
} from "@modelcontextprotocol/client";
import { installWebMCP } from "@w3c/webmcp-polyfill";
import type {
  WebMcpProxyOptions,
  WebMcpProxyInstance,
  LegacyModelContext,
} from "./types.js";

export type {
  WebMcpProxyOptions,
  WebMcpProxyInstance,
  WebMcpProxyStatus,
  McpTool,
  McpToolResult,
} from "./types.js";

async function connectWithFallback(
  url: string,
  headers?: Record<string, string>,
): Promise<Client> {
  const client = new Client({ name: "webmcp-proxy", version: "0.0.1" });
  const parsedUrl = new URL(url);
  const requestInit = headers ? { headers } : undefined;

  let transport: Transport;

  try {
    transport = new StreamableHTTPClientTransport(
      parsedUrl,
      requestInit ? { requestInit } : undefined,
    );
    await client.connect(transport);
    return client;
  } catch {
    // Streamable HTTP failed — fall back to legacy SSE transport.
  }

  transport = new SSEClientTransport(
    parsedUrl,
    requestInit ? { requestInit } : undefined,
  );
  await client.connect(transport);
  return client;
}

/**
 * Connect to a remote MCP server and expose its tools to browsing agents
 * through the WebMCP browser API (`document.modelContext`).
 */
export async function createWebMcpProxy(
  options: WebMcpProxyOptions,
): Promise<WebMcpProxyInstance> {
  const noop: WebMcpProxyInstance = {
    tools: [],
    disconnect: async () => {},
  };

  // The `modelContext` getter moved from `Navigator` to `Document` (WebMCP
  // Issue 173 / PR #184). Prefer `document.modelContext` and fall back to the
  // deprecated `navigator.modelContext` for older browsers.
  let modelContext: LegacyModelContext | undefined =
    typeof document === "undefined"
      ? undefined
      : document.modelContext ?? navigator.modelContext;

  if (!modelContext) {
    installWebMCP();
    modelContext =
      typeof document === "undefined" ? undefined : document.modelContext;
  }

  if (!modelContext) {
    console.warn(
      "[webmcp-proxy] modelContext is not available in this browser. " +
        "Tools will not be registered. WebMCP requires a secure browser context (HTTPS or localhost).",
    );
    return noop;
  }

  const client = await connectWithFallback(options.url, options.headers);

  const { tools: mcpTools } = await client.listTools();

  const descriptors: WebMCP.ModelContextTool[] = mcpTools.map((tool) => ({
    name: tool.name,
    description: tool.description?.trim() ? tool.description : tool.name,
    inputSchema: tool.inputSchema,
    execute: async (args, { signal }) => {
      return client.callTool({ name: tool.name, arguments: args }, {
        signal,
      });
    },
  }));

  const controller = new AbortController();
  const registeredTools: typeof mcpTools = [];

  for (const [index, descriptor] of descriptors.entries()) {
    try {
      await modelContext.registerTool(descriptor, {
        signal: controller.signal,
      });
      registeredTools.push(mcpTools[index]);
    } catch (e) {
      console.error(
        `[webmcp-proxy] Failed to register tool "${descriptor.name}":`,
        e,
      );
    }
  }

  return {
    tools: registeredTools,
    disconnect: async () => {
      // Backward-compat: also call unregisterTool if available (older browsers).
      for (const tool of registeredTools) {
        modelContext.unregisterTool?.(tool.name);
      }
      controller.abort();
      await client.close();
    },
  };
}
