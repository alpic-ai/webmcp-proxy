import {
  Client,
  StreamableHTTPClientTransport,
  SSEClientTransport,
  type Transport,
} from "@modelcontextprotocol/client";
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
  const modelContext: LegacyModelContext | undefined =
    document.modelContext ?? navigator.modelContext;

  if (!modelContext) {
    console.warn(
      "[webmcp-proxy] modelContext is not available in this browser. " +
        "Tools will not be registered. See https://github.com/webmachinelearning/webmcp for browser support.",
    );
    return noop;
  }

  const client = await connectWithFallback(options.url, options.headers);

  const { tools: mcpTools } = await client.listTools();

  const descriptors: WebMCP.ModelContextTool[] = mcpTools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? "",
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    execute: async (args, { signal }) => {
      const result = await client.callTool(
        { name: tool.name, arguments: args },
        {
          signal,
          // Validate against the same schema advertised to WebMCP, even if the
          // client's tools cache has changed since registration.
          toolDefinition: tool,
        },
      );

      if (!tool.outputSchema) return result;

      // An MCP error is not a successful output and must not be checked by
      // browsing agents against the advertised schema.
      if (result.isError) {
        const message = result.content
          .filter((content) => content.type === "text")
          .map((content) => content.text)
          .join("\n");
        throw new Error(
          `Tool "${tool.name}" failed: ${message || "The MCP server returned an error."}`,
        );
      }

      // callTool validates structuredContent (and rejects missing or invalid
      // data). WebMCP's outputSchema describes this value, not the MCP envelope.
      return result.structuredContent;
    },
  }));

  const controller = new AbortController();

  for (const descriptor of descriptors) {
    try {
      await modelContext.registerTool(descriptor, {
        signal: controller.signal,
      });
    } catch (e) {
      console.error(
        `[webmcp-proxy] Failed to register tool "${descriptor.name}":`,
        e,
      );
    }
  }

  return {
    tools: mcpTools,
    disconnect: async () => {
      // Backward-compat: also call unregisterTool if available (older browsers).
      for (const descriptor of descriptors) {
        modelContext.unregisterTool?.(descriptor.name);
      }
      controller.abort();
      await client.close();
    },
  };
}
