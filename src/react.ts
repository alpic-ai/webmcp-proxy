import { useEffect, useRef, useState } from "react";
import { createWebMcpProxy } from "./index.js";
import type {
  McpTool,
  WebMcpProxyInstance,
  WebMcpProxyOptions,
  WebMcpProxyStatus,
} from "./types.js";

export type {
  WebMcpProxyOptions,
  WebMcpProxyStatus,
  McpTool,
} from "./types.js";

export interface WebMCPProxyProps extends WebMcpProxyOptions {
  /**
   * Called once the proxy has connected to the MCP server and registered
   * its tools with WebMCP.
   *
   * @param tools - The list of MCP tools that were discovered and registered.
   */
  onConnected?: (tools: McpTool[]) => void;

  /**
   * Called when the proxy fails to connect to the MCP server.
   *
   * @param error - The error that occurred during connection.
   */
  onError?: (error: Error) => void;
}

/**
 * Renderless React component that connects to a remote MCP server and
 * registers its tools with the browser's WebMCP API for browsing agents.
 *
 * Tools are registered on mount and unregistered on unmount. If the `url`
 * prop changes, the previous connection is closed and a new one is opened.
 *
 * @example
 * ```tsx
 * <WebMCPProxy url="https://mcp.example.com/mcp" />
 * ```
 */
export function WebMCPProxy({
  onConnected,
  onError,
  ...options
}: WebMCPProxyProps) {
  const [status, setStatus] = useState<WebMcpProxyStatus>("disconnected");
  const proxyRef = useRef<WebMcpProxyInstance | null>(null);
  const onConnectedRef = useRef(onConnected);
  const onErrorRef = useRef(onError);
  onConnectedRef.current = onConnected;
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      setStatus("connecting");

      try {
        const instance = await createWebMcpProxy(options);

        if (cancelled) {
          await instance.disconnect();
          return;
        }

        proxyRef.current = instance;
        setStatus("connected");
        onConnectedRef.current?.(instance.tools);
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          onErrorRef.current?.(
            err instanceof Error ? err : new Error(String(err)),
          );
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      proxyRef.current?.disconnect();
      proxyRef.current = null;
    };
  }, [options.url]);

  return null;
}
