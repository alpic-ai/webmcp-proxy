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
  return { registerTool: vi.fn().mockResolvedValue(undefined) };
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
    expect(console.warn).not.toHaveBeenCalled();
    await proxy.disconnect();
    expect(polyfill.registerTool.mock.calls[0][1].signal.aborted).toBe(true);
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("uses native document.modelContext after calling the installer", async () => {
    const native = context();
    const legacy = context();
    vi.stubGlobal("document", { modelContext: native });
    vi.stubGlobal("navigator", { modelContext: legacy });

    const proxy = await createWebMcpProxy(options);

    expect(mocks.installWebMCP).toHaveBeenCalledOnce();
    expect(native.registerTool).toHaveBeenCalledOnce();
    expect(legacy.registerTool).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    await proxy.disconnect();
  });

  it("signals readiness immediately and settles only after every registration attempt", async () => {
    const native = { ...context(), waitForToolsUntil: vi.fn() };
    vi.stubGlobal("document", { modelContext: native });
    const connected = Promise.withResolvers<void>();
    const discovered = Promise.withResolvers<{ tools: typeof tool[] }>();
    const firstRegistered = Promise.withResolvers<void>();
    const lastRegistered = Promise.withResolvers<void>();
    const lastTool = { ...tool, name: "last" };
    mocks.connect.mockReturnValue(connected.promise);
    mocks.listTools.mockReturnValue(discovered.promise);
    native.registerTool
      .mockReturnValueOnce(firstRegistered.promise)
      .mockReturnValueOnce(lastRegistered.promise);

    const setup = createWebMcpProxy(options);

    expect(native.waitForToolsUntil).toHaveBeenCalledOnce();
    expect(native.waitForToolsUntil.mock.contexts[0]).toBe(native);
    expect(mocks.listTools).not.toHaveBeenCalled();
    expect(native.registerTool).not.toHaveBeenCalled();
    const readiness = native.waitForToolsUntil.mock.calls[0][0];
    const ready = vi.fn();
    readiness.then(ready);

    connected.resolve();
    await vi.waitFor(() => expect(mocks.listTools).toHaveBeenCalledOnce());
    expect(ready).not.toHaveBeenCalled();
    discovered.resolve({ tools: [tool, lastTool] });
    await vi.waitFor(() => expect(native.registerTool).toHaveBeenCalledTimes(1));
    expect(ready).not.toHaveBeenCalled();

    firstRegistered.resolve();
    await vi.waitFor(() => expect(native.registerTool).toHaveBeenCalledTimes(2));
    expect(ready).not.toHaveBeenCalled();
    lastRegistered.reject(new Error("Already registered"));
    const proxy = await setup;

    expect(await readiness).toBe(proxy);
    expect(ready).toHaveBeenCalledOnce();
    expect(proxy.tools).toEqual([tool]);
    expect(console.error).toHaveBeenCalledOnce();
    await proxy.disconnect();
  });

  it("signals each proxy setup separately, including when the polyfill supplies the API", async () => {
    const polyfill = { ...context(), waitForToolsUntil: vi.fn() };
    mocks.installWebMCP.mockImplementation(() => {
      vi.stubGlobal("document", { modelContext: polyfill });
    });

    const proxies = await Promise.all([
      createWebMcpProxy(options),
      createWebMcpProxy(options),
    ]);

    expect(polyfill.waitForToolsUntil).toHaveBeenCalledTimes(2);
    const promises = polyfill.waitForToolsUntil.mock.calls.map(([promise]) => promise);
    expect(promises[0]).not.toBe(promises[1]);
    expect(await Promise.all(promises)).toEqual(proxies);
    await Promise.all(proxies.map((proxy) => proxy.disconnect()));
  });

  it.each(["connection", "discovery"])("settles the readiness promise when %s fails", async (stage) => {
    const native = { ...context(), waitForToolsUntil: vi.fn() };
    vi.stubGlobal("document", { modelContext: native });
    const error = new Error("Setup failed");
    if (stage === "connection") mocks.connect.mockRejectedValue(error);
    else mocks.listTools.mockRejectedValue(error);

    const setup = createWebMcpProxy(options);
    const readiness = native.waitForToolsUntil.mock.calls[0][0];

    await Promise.all([
      expect(setup).rejects.toBe(error),
      expect(readiness).rejects.toBe(error),
    ]);
    expect(native.registerTool).not.toHaveBeenCalled();
  });

  it("settles readiness when the server exposes no tools", async () => {
    const native = { ...context(), waitForToolsUntil: vi.fn() };
    vi.stubGlobal("document", { modelContext: native });
    mocks.listTools.mockResolvedValue({ tools: [] });

    const proxy = await createWebMcpProxy(options);

    expect(await native.waitForToolsUntil.mock.calls[0][0]).toBe(proxy);
    expect(proxy.tools).toEqual([]);
    expect(native.registerTool).not.toHaveBeenCalled();
    await proxy.disconnect();
  });

  it("uses the polyfill instead of the deprecated navigator.modelContext API", async () => {
    const legacy = context();
    const polyfill = context();
    vi.stubGlobal("navigator", { modelContext: legacy });
    mocks.installWebMCP.mockImplementation(() => {
      vi.stubGlobal("document", { modelContext: polyfill });
    });

    const proxy = await createWebMcpProxy(options);

    expect(mocks.installWebMCP).toHaveBeenCalledOnce();
    expect(polyfill.registerTool).toHaveBeenCalledOnce();
    expect(legacy.registerTool).not.toHaveBeenCalled();
    await proxy.disconnect();
    expect(polyfill.registerTool.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("does not connect when the polyfill cannot install in an insecure context", async () => {
    const proxy = await createWebMcpProxy(options);

    expect(proxy.tools).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("HTTPS or localhost"));
    expect(mocks.connect).not.toHaveBeenCalled();
    await proxy.disconnect();
  });

  it("silently skips registration during server-side rendering", async () => {
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("navigator", undefined);

    const proxy = await createWebMcpProxy(options);

    expect(proxy.tools).toEqual([]);
    expect(console.warn).not.toHaveBeenCalled();
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
    expect(native.registerTool.mock.calls[1][1].signal.aborted).toBe(true);
  });
});
