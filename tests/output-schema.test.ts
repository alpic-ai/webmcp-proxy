import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Client,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/client";
import { createWebMcpProxy, type WebMcpProxyInstance } from "../src/index.js";

const { installWebMCP } = vi.hoisted(() => ({ installWebMCP: vi.fn() }));

vi.mock("@w3c/webmcp-polyfill", () => ({ installWebMCP }));

const outputSchema: NonNullable<Tool["outputSchema"]> = {
  type: "object",
  properties: {
    temperature: { type: "number" },
    conditions: { type: "string" },
  },
  required: ["temperature", "conditions"],
  additionalProperties: false,
};

const weatherTool: Tool = {
  name: "getWeather",
  description: "Returns the current weather for a city.",
  inputSchema: {
    type: "object",
    properties: { city: { type: "string" } },
    required: ["city"],
  },
  outputSchema,
};

describe("WebMCP output schemas", () => {
  let tools: Tool[];
  let result: CallToolResult;
  let registered: WebMCP.ModelContextTool[];
  let proxies: WebMcpProxyInstance[];

  beforeEach(() => {
    installWebMCP.mockReset();
    tools = [weatherTool];
    result = {
      content: [{ type: "text", text: "21 degrees, sunny" }],
      structuredContent: { temperature: 21, conditions: "sunny" },
    };
    registered = [];
    proxies = [];
    vi.stubGlobal("document", {
      modelContext: {
        registerTool: vi.fn(async (tool: WebMCP.ModelContextTool) => {
          registered.push(tool);
        }),
      },
    });
    vi.stubGlobal("navigator", {});

    // Exercise the real MCP client through a fake HTTP server.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init: RequestInit) => {
        const request = JSON.parse(init.body as string);
        if (request.id === undefined)
          return new Response(null, { status: 202 });

        let response;
        switch (request.method) {
          case "initialize":
            response = {
              protocolVersion: request.params.protocolVersion,
              capabilities: { tools: {} },
              serverInfo: { name: "weather-test", version: "1.0.0" },
            };
            break;
          case "tools/list":
            response = { tools };
            break;
          case "tools/call":
            response = result;
            break;
          default:
            throw new Error(`Unexpected MCP request: ${request.method}`);
        }
        return new Response(
          JSON.stringify({ jsonrpc: "2.0", id: request.id, result: response }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      }),
    );
  });

  afterEach(async () => {
    await Promise.all(proxies.map((proxy) => proxy.disconnect()));
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function connect() {
    const proxy = await createWebMcpProxy({
      url: "https://weather.example/mcp",
    });
    proxies.push(proxy);
    return proxy;
  }

  async function execute(signal = new AbortController().signal) {
    await connect();
    return registered[0].execute({ city: "Paris" }, { signal });
  }

  it("advertises the remote tool's output schema", async () => {
    const proxy = await connect();
    expect(registered[0]).toHaveProperty("outputSchema", outputSchema);
    expect(registered[0].inputSchema).toEqual(weatherTool.inputSchema);
    expect(proxy.tools[0].outputSchema).toEqual(outputSchema);
  });

  it("returns structured data, not the MCP response wrapper", async () => {
    expect(await execute()).toEqual({ temperature: 21, conditions: "sunny" });
  });

  it.each([
    { temperature: "warm", conditions: "sunny" },
    { temperature: 21 },
    { temperature: 21, conditions: "sunny", unexpected: true },
  ])("rejects results that do not match the cached output schema: %j", async (data) => {
    result.structuredContent = data;
    await expect(execute()).rejects.toThrow(/output schema/i);
  });

  it("rejects missing structured content instead of repairing it from text", async () => {
    result = {
      content: [
        { type: "text", text: '{"temperature":21,"conditions":"sunny"}' },
      ],
    };
    await expect(execute()).rejects.toThrow(/did not return structured content/i);
  });

  it("lets the SDK reject an unusable output schema", async () => {
    tools = [
      { ...weatherTool, outputSchema: { type: "object", $ref: "#/missing" } },
    ];
    await expect(execute()).rejects.toThrow(
      /invalid outputSchema|Failed to validate structured content/i,
    );
  });

  it("preserves MCP tool errors unchanged", async () => {
    result = {
      isError: true,
      content: [{ type: "text", text: "Weather service unavailable" }],
      structuredContent: { error: "unavailable" },
    };
    expect(await execute()).toEqual(result);
  });

  it("does not add a custom message to MCP errors without text", async () => {
    result = { isError: true, content: [] };
    expect(await execute()).toEqual(result);
  });

  it.each([false, true])(
    "leaves schema-less results unchanged (isError: %s)",
    async (isError) => {
      const { outputSchema: _schema, ...tool } = weatherTool;
      tools = [tool];
      result.isError = isError;
      expect(await execute()).toEqual(result);
      expect(registered[0]).toHaveProperty("outputSchema", undefined);
    },
  );

  it("uses callTool with the execution signal and no toolDefinition override", async () => {
    const callTool = vi.spyOn(Client.prototype, "callTool");
    const signal = new AbortController().signal;
    await execute(signal);
    expect(callTool).toHaveBeenCalledExactlyOnceWith(
      { name: "getWeather", arguments: { city: "Paris" } },
      { signal },
    );
  });

  it("leaves input-schema validation to the browser", async () => {
    const callTool = vi.spyOn(Client.prototype, "callTool");
    await connect();
    const signal = new AbortController().signal;
    expect(await registered[0].execute({ city: 42 }, { signal })).toEqual(
      result.structuredContent,
    );
    expect(callTool).toHaveBeenCalledWith(
      { name: "getWeather", arguments: { city: 42 } },
      { signal },
    );
  });

  it("does not turn cancellation into a schema error", async () => {
    const controller = new AbortController();
    controller.abort(new Error("Execution cancelled"));
    await expect(execute(controller.signal)).rejects.toThrow(
      "Execution cancelled",
    );
  });

  it("also advertises schemas when the polyfill installs document.modelContext", async () => {
    const modelContext = document.modelContext;
    vi.stubGlobal("document", {});
    installWebMCP.mockImplementation(() => {
      vi.stubGlobal("document", { modelContext });
    });
    expect(await execute()).toEqual(result.structuredContent);
    expect(installWebMCP).toHaveBeenCalledOnce();
    expect(registered[0]).toHaveProperty("outputSchema", outputSchema);
  });
});
