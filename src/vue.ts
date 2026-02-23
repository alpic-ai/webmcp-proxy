import {
  defineComponent,
  ref,
  watch,
  onUnmounted,
  toValue,
  type MaybeRefOrGetter,
  type PropType,
  type Ref,
} from "vue";
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

export interface UseWebMcpProxyReturn {
  /** Reactive list of MCP tools discovered and registered with WebMCP. */
  tools: Ref<McpTool[]>;
  /** Reactive connection status. */
  status: Ref<WebMcpProxyStatus>;
  /** Reactive error, set when the connection fails. */
  error: Ref<Error | null>;
}

/**
 * Vue composable that connects to a remote MCP server and registers its
 * tools with the browser's WebMCP API.
 *
 * Automatically reconnects when the `url` changes and disconnects when
 * the component is unmounted.
 *
 * @param options - Connection options (accepts a plain object, ref, or getter).
 */
export function useWebMcpProxy(
  options: MaybeRefOrGetter<WebMcpProxyOptions>,
): UseWebMcpProxyReturn {
  const tools = ref<McpTool[]>([]) as Ref<McpTool[]>;
  const status = ref<WebMcpProxyStatus>(
    "disconnected",
  ) as Ref<WebMcpProxyStatus>;
  const error = ref<Error | null>(null) as Ref<Error | null>;
  let proxy: WebMcpProxyInstance | null = null;

  async function connect() {
    proxy?.disconnect();
    proxy = null;

    status.value = "connecting";
    error.value = null;

    try {
      const opts = toValue(options);
      const instance = await createWebMcpProxy(opts);
      proxy = instance;
      tools.value = instance.tools;
      status.value = "connected";
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err));
      status.value = "error";
    }
  }

  watch(() => toValue(options).url, connect, { immediate: true });

  onUnmounted(() => {
    proxy?.disconnect();
    proxy = null;
  });

  return { tools, status, error };
}

/**
 * Renderless Vue component that connects to a remote MCP server and
 * registers its tools with the browser's WebMCP API for browsing agents.
 *
 * Tools are registered on mount and unregistered on unmount. If the `url`
 * prop changes, the previous connection is closed and a new one is opened.
 *
 * @example
 * ```vue
 * <WebMCPProxy url="https://mcp.example.com/mcp" />
 * ```
 */
export const WebMCPProxy = defineComponent({
  name: "WebMCPProxy",
  props: {
    /** URL of the remote MCP server (Streamable HTTP or SSE endpoint). */
    url: { type: String, required: true },
    /** Additional headers sent with every request to the MCP server. */
    headers: {
      type: Object as PropType<Record<string, string>>,
      default: undefined,
    },
  },
  setup(props) {
    useWebMcpProxy(() => ({
      url: props.url,
      headers: props.headers,
    }));

    return () => null;
  },
});
