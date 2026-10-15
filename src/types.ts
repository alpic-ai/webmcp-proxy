import type { Tool, CallToolResult } from "@modelcontextprotocol/client";
import type { WebMCP } from "webmcp-types";

export type McpTool = Tool;
export type McpToolResult = CallToolResult;

export interface WebMcpProxyOptions {
  /** URL of the remote MCP server (Streamable HTTP or SSE endpoint). */
  url: string;
  /** Additional headers sent with every request to the MCP server (e.g. `Authorization`). */
  headers?: Record<string, string>;
}

export type WebMcpProxyStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export interface WebMcpProxyInstance {
  /** The list of MCP tools that were discovered and registered with WebMCP. */
  tools: McpTool[];
  /** Unregister all tools from WebMCP and close the MCP connection. */
  disconnect: () => Promise<void>;
}

export interface ModelContext extends Pick<WebMCP.ModelContext, "registerTool"> {
  /** @deprecated Use AbortSignal with registerTool() instead. */
  unregisterTool?(name: string): void;
}

declare global {
  interface Navigator {
    /** @deprecated Use `document.modelContext` instead. Removed in a future Chrome release. */
    modelContext?: ModelContext;
  }
}

export type WebMcpToolExecuteOptions = WebMCP.ToolExecuteCallbackOptions;

export interface WebMcpToolDescriptor extends WebMCP.ModelContextTool {
  inputSchema: Record<string, unknown>;
}
