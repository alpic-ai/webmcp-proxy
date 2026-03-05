import { useState, useCallback, type FormEvent } from "react";
import { WebMCPProxy, type McpTool } from "webmcp-proxy/react";

export function App() {
  const [url, setUrl] = useState("");
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "idle" | "connecting" | "connected" | "error"
  >("idle");
  const [tools, setTools] = useState<McpTool[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = url.trim();
      if (!trimmed) return;
      setActiveUrl(
        `${window.location.origin}/cors-proxy/${encodeURIComponent(trimmed)}`,
      );
      setStatus("connecting");
      setTools([]);
      setError(null);
    },
    [url],
  );

  const handleDisconnect = useCallback(() => {
    setActiveUrl(null);
    setStatus("idle");
    setTools([]);
    setError(null);
  }, []);

  const handleConnected = useCallback((mcpTools: McpTool[]) => {
    setStatus("connected");
    setTools(mcpTools);
  }, []);

  const handleError = useCallback((err: Error) => {
    setStatus("error");
    setError(err.message);
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.badge}>DEMO</span>
          <h1 style={styles.title}>WebMCP Proxy</h1>
        </div>
        <p style={styles.subtitle}>
          Connect to a remote MCP server and register its tools with the
          browser's WebMCP API.
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label htmlFor="server-url" style={styles.label}>
            MCP SERVER URL
          </label>
          <div style={styles.inputRow}>
            <input
              id="server-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mcp.example.com/mcp"
              required
              disabled={status === "connecting"}
              style={styles.input}
            />
            {activeUrl ? (
              <button
                type="button"
                onClick={handleDisconnect}
                style={styles.disconnectButton}
              >
                Disconnect
              </button>
            ) : (
              <button
                type="submit"
                disabled={!url.trim() || status === "connecting"}
                style={{
                  ...styles.button,
                  opacity: !url.trim() || status === "connecting" ? 0.5 : 1,
                }}
              >
                Connect
              </button>
            )}
          </div>
        </form>

        <div style={styles.statusRow}>
          <span
            style={{
              ...styles.dot,
              backgroundColor:
                status === "connected"
                  ? "#22c55e"
                  : status === "connecting"
                    ? "#fff"
                    : status === "error"
                      ? "#ef4444"
                      : "#555",
            }}
          />
          <span style={styles.statusText}>
            {status === "idle" && "Not connected"}
            {status === "connecting" && "Connecting\u2026"}
            {status === "connected" &&
              `Connected \u2014 ${tools.length} tool${tools.length !== 1 ? "s" : ""} registered`}
            {status === "error" && `Error: ${error}`}
          </span>
        </div>

        {tools.length > 0 && (
          <div style={styles.toolList}>
            <h2 style={styles.toolListTitle}>REGISTERED TOOLS</h2>
            {tools.map((tool) => (
              <div key={tool.name} style={styles.toolCard}>
                <code style={styles.toolName}>{tool.name}</code>
                {tool.description && (
                  <p style={styles.toolDesc}>{tool.description}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <a
        href="https://alpic.ai"
        target="_blank"
        rel="noopener"
        style={styles.poweredBy}
      >
        Built with ❤️ by <span style={styles.alpicName}>Alpic</span>
      </a>

      {activeUrl && (
        <WebMCPProxy
          url={activeUrl}
          onConnected={handleConnected}
          onError={handleError}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#000 url(/alpic-mountain.png) no-repeat right bottom",
    backgroundSize: "auto 60%",
    fontFamily: '"Mozilla Text", -apple-system, BlinkMacSystemFont, sans-serif',
    padding: 24,
    gap: 32,
  },
  card: {
    background: "#0a0a0a",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderRadius: 24,
    padding: "48px 44px",
    width: "100%",
    maxWidth: 560,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  badge: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.08em",
    color: "#fff",
    background: "rgba(255, 255, 255, 0.1)",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    borderRadius: 100,
    padding: "3px 10px",
  },
  title: {
    margin: 0,
    fontSize: 24,
    fontWeight: 600,
    color: "#fff",
    letterSpacing: "-0.02em",
  },
  subtitle: {
    margin: "12px 0 36px",
    fontSize: 14,
    color: "#777",
    lineHeight: 1.6,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    color: "#666",
  },
  inputRow: {
    display: "flex",
    gap: 10,
  },
  input: {
    flex: 1,
    padding: "12px 16px",
    fontSize: 14,
    borderRadius: 12,
    border: "1px solid rgba(255, 255, 255, 0.12)",
    background: "#000",
    color: "#fff",
    outline: "none",
    fontFamily: "inherit",
  },
  button: {
    padding: "10px 22px",
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 8,
    border: "1px solid #DDFFBA",
    background: "#DDFFBA",
    color: "#0a0a0a",
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontFamily: "inherit",
    transition: "opacity 0.15s",
  },
  disconnectButton: {
    padding: "10px 22px",
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 8,
    border: "1px solid rgba(221, 255, 186, 0.3)",
    background: "transparent",
    color: "#DDFFBA",
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontFamily: "inherit",
    transition: "border-color 0.15s, color 0.15s",
  },
  statusRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 24,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    flexShrink: 0,
  },
  statusText: {
    fontSize: 13,
    color: "#888",
  },
  toolList: {
    marginTop: 32,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  toolListTitle: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    color: "#666",
    margin: "0 0 8px",
  },
  toolCard: {
    padding: "14px 16px",
    borderRadius: 12,
    background: "rgba(255, 255, 255, 0.03)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
  },
  toolName: {
    fontSize: 13,
    fontWeight: 600,
    color: "#fff",
    fontFamily: '"SF Mono", "Fira Code", "Fira Mono", Menlo, monospace',
  },
  toolDesc: {
    margin: "6px 0 0",
    fontSize: 12,
    color: "#666",
    lineHeight: 1.5,
  },
  poweredBy: {
    fontSize: 12,
    color: "#555",
    textDecoration: "none",
    letterSpacing: "0.02em",
  },
  alpicName: {
    color: "#fff",
    fontWeight: 600,
  },
};
