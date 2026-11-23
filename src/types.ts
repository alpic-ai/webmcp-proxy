import type { Tool, CallToolResult } from "@modelcontextprotocol/client";

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
  /** The original MCP tool descriptions successfully registered with WebMCP, not browser WebMCP.Tool objects. */
  tools: McpTool[];
  /** Unregister all tools from WebMCP and close the MCP connection. */
  disconnect: () => Promise<void>;
}
