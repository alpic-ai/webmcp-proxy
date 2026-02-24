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
      setActiveUrl(`/cors-proxy/${encodeURIComponent(trimmed)}`);
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
        <h1 style={styles.title}>WebMCP Proxy</h1>
        <p style={styles.subtitle}>
          Connect to a remote MCP server and register its tools with the
          browser's WebMCP API.
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label htmlFor="server-url" style={styles.label}>
            MCP Server URL
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
                    ? "#f59e0b"
                    : status === "error"
                      ? "#ef4444"
                      : "#94a3b8",
            }}
          />
          <span style={styles.statusText}>
            {status === "idle" && "Not connected"}
            {status === "connecting" && "Connecting..."}
            {status === "connected" &&
              `Connected \u2014 ${tools.length} tool${tools.length !== 1 ? "s" : ""} registered`}
            {status === "error" && `Error: ${error}`}
          </span>
        </div>

        {tools.length > 0 && (
          <div style={styles.toolList}>
            <h2 style={styles.toolListTitle}>Registered Tools</h2>
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
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: 24,
  },
  card: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 16,
    padding: 40,
    width: "100%",
    maxWidth: 560,
    boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 700,
    color: "#f8fafc",
    letterSpacing: "-0.02em",
  },
  subtitle: {
    margin: "8px 0 32px",
    fontSize: 14,
    color: "#94a3b8",
    lineHeight: 1.5,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: 500,
    color: "#cbd5e1",
  },
  inputRow: {
    display: "flex",
    gap: 8,
  },
  input: {
    flex: 1,
    padding: "10px 14px",
    fontSize: 14,
    borderRadius: 8,
    border: "1px solid #475569",
    background: "#0f172a",
    color: "#f8fafc",
    outline: "none",
  },
  button: {
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 8,
    border: "none",
    background: "#3b82f6",
    color: "#fff",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  disconnectButton: {
    padding: "10px 20px",
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 8,
    border: "1px solid #475569",
    background: "transparent",
    color: "#94a3b8",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  statusRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
  },
  statusText: {
    fontSize: 13,
    color: "#cbd5e1",
  },
  toolList: {
    marginTop: 24,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  toolListTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: "#e2e8f0",
    margin: "0 0 4px",
  },
  toolCard: {
    padding: "10px 14px",
    borderRadius: 8,
    background: "#0f172a",
    border: "1px solid #334155",
  },
  toolName: {
    fontSize: 13,
    fontWeight: 600,
    color: "#60a5fa",
  },
  toolDesc: {
    margin: "4px 0 0",
    fontSize: 12,
    color: "#94a3b8",
    lineHeight: 1.4,
  },
};
