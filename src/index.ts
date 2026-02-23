import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  WebMcpProxyOptions,
  WebMcpProxyInstance,
  WebMcpToolDescriptor,
} from "./types.js";

export type {
  WebMcpProxyOptions,
  WebMcpProxyInstance,
  WebMcpProxyStatus,
  McpTool,
  McpToolResult,
  WebMcpToolDescriptor,
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
 * through the WebMCP browser API (`navigator.modelContext`).
 */
export async function createWebMcpProxy(
  options: WebMcpProxyOptions,
): Promise<WebMcpProxyInstance> {
  const noop: WebMcpProxyInstance = {
    tools: [],
    disconnect: async () => {},
  };

  if (!navigator.modelContext) {
    console.warn(
      "[webmcp-proxy] navigator.modelContext is not available in this browser. " +
        "Tools will not be registered. See https://github.com/webmachinelearning/webmcp for browser support.",
    );
    return noop;
  }

  const client = await connectWithFallback(options.url, options.headers);

  const { tools: mcpTools } = await client.listTools();

  const descriptors: WebMcpToolDescriptor[] = mcpTools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? "",
    inputSchema: tool.inputSchema as Record<string, unknown>,
    execute: async (args: Record<string, unknown>) => {
      return client.callTool({ name: tool.name, arguments: args });
    },
  }));

  for (const descriptor of descriptors) {
    navigator.modelContext.registerTool(descriptor);
  }

  return {
    tools: mcpTools,
    disconnect: async () => {
      for (const descriptor of descriptors) {
        navigator.modelContext?.unregisterTool(descriptor.name);
      }
      await client.close();
    },
  };
}
