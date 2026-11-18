import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  listTools: vi.fn(),
  callTool: vi.fn(),
  close: vi.fn(),
  installWebMCP: vi.fn(),
}));

vi.mock("@modelcontextprotocol/client", () => ({
  Client: class {
    connect = mocks.connect;
    listTools = mocks.listTools;
    callTool = mocks.callTool;
    close = mocks.close;
  },
  StreamableHTTPClientTransport: class {},
  SSEClientTransport: class {},
}));

vi.mock("@w3c/webmcp-polyfill", () => ({
  installWebMCP: mocks.installWebMCP,
}));

import { createWebMcpProxy } from "../src/index.js";

const tool = {
  name: "search",
  description: "Search the catalog",
  inputSchema: { type: "object", properties: { query: { type: "string" } } },
};
const options = { url: "https://mcp.example.com/mcp" };

function context() {
  return { registerTool: vi.fn().mockResolvedValue(undefined), unregisterTool: vi.fn() };
}

describe("WebMCP proxy registration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("document", {});
    vi.stubGlobal("navigator", {});
    mocks.listTools.mockResolvedValue({ tools: [tool] });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("installs the polyfill before registering when native WebMCP is absent", async () => {
    const polyfill = context();
    mocks.installWebMCP.mockImplementation(() => {
      vi.stubGlobal("document", { modelContext: polyfill });
    });

    const proxy = await createWebMcpProxy(options);

    expect(mocks.installWebMCP).toHaveBeenCalledOnce();
    expect(polyfill.registerTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: tool.name, inputSchema: tool.inputSchema }),
      { signal: expect.any(AbortSignal) },
    );
    expect(proxy.tools).toEqual([tool]);
    await proxy.disconnect();
    expect(polyfill.registerTool.mock.calls[0][1].signal.aborted).toBe(true);
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("preserves native document.modelContext and prefers it over the legacy API", async () => {
    const native = context();
    const legacy = context();
    vi.stubGlobal("document", { modelContext: native });
    vi.stubGlobal("navigator", { modelContext: legacy });

    const proxy = await createWebMcpProxy(options);

    expect(mocks.installWebMCP).not.toHaveBeenCalled();
    expect(native.registerTool).toHaveBeenCalledOnce();
    expect(legacy.registerTool).not.toHaveBeenCalled();
    await proxy.disconnect();
  });

  it("preserves older navigator.modelContext implementations", async () => {
    const legacy = context();
    vi.stubGlobal("navigator", { modelContext: legacy });

    const proxy = await createWebMcpProxy(options);

    expect(mocks.installWebMCP).not.toHaveBeenCalled();
    expect(legacy.registerTool).toHaveBeenCalledOnce();
    await proxy.disconnect();
    expect(legacy.unregisterTool).toHaveBeenCalledWith(tool.name);
  });

  it("does not connect when the polyfill cannot install in an insecure context", async () => {
    const proxy = await createWebMcpProxy(options);

    expect(proxy.tools).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("HTTPS or localhost"));
    expect(mocks.connect).not.toHaveBeenCalled();
    await proxy.disconnect();
  });

  it("is safe to call without browser globals during server-side rendering", async () => {
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("navigator", undefined);

    const proxy = await createWebMcpProxy(options);

    expect(proxy.tools).toEqual([]);
    expect(mocks.connect).not.toHaveBeenCalled();
    await proxy.disconnect();
  });

  it("forwards tool inputs, results, and per-execution cancellation to MCP", async () => {
    const native = context();
    vi.stubGlobal("document", { modelContext: native });
    const result = { content: [{ type: "text", text: "Found it" }] };
    mocks.callTool.mockResolvedValue(result);
    const proxy = await createWebMcpProxy(options);
    const descriptor = native.registerTool.mock.calls[0][0];
    const controller = new AbortController();

    expect(await descriptor.execute({ query: "shoes" }, { signal: controller.signal })).toEqual(result);
    expect(mocks.callTool).toHaveBeenCalledWith(
      { name: tool.name, arguments: { query: "shoes" } },
      { signal: controller.signal },
    );
    controller.abort();
    expect(mocks.callTool.mock.calls[0][1].signal.aborted).toBe(true);
    await proxy.disconnect();
  });

  it("uses the tool name when a description is missing, empty, or whitespace", async () => {
    const native = context();
    vi.stubGlobal("document", { modelContext: native });
    mocks.listTools.mockResolvedValue({ tools: [
      { ...tool, name: "missing", description: undefined },
      { ...tool, name: "empty", description: "" },
      { ...tool, name: "whitespace", description: "  " },
    ] });

    const proxy = await createWebMcpProxy(options);

    expect(native.registerTool.mock.calls.map(([descriptor]) => descriptor.description))
      .toEqual(["missing", "empty", "whitespace"]);
    await proxy.disconnect();
  });

  it("reports and cleans up only successful registrations, preserving conflicting page tools", async () => {
    const native = context();
    vi.stubGlobal("document", { modelContext: native });
    const conflicting = { ...tool, name: "page-tool" };
    mocks.listTools.mockResolvedValue({ tools: [conflicting, tool] });
    native.registerTool.mockRejectedValueOnce(new Error("Already registered"));

    const proxy = await createWebMcpProxy(options);

    expect(proxy.tools).toEqual([tool]);
    expect(console.error).toHaveBeenCalledOnce();
    await proxy.disconnect();
    expect(native.unregisterTool).toHaveBeenCalledExactlyOnceWith(tool.name);
  });
});
