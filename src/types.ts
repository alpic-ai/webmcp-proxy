import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";

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

declare global {
  interface Navigator {
    modelContext?: {
      provideContext(context: { tools: WebMcpToolDescriptor[] }): void;
      registerTool(tool: WebMcpToolDescriptor): void;
      unregisterTool(name: string): void;
    };
  }
}

export interface WebMcpToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (
    args: Record<string, unknown>,
    agent: unknown,
  ) => unknown | Promise<unknown>;
}
