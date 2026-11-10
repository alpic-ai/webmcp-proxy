import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Client,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/client";
import { createWebMcpProxy, type WebMcpProxyInstance } from "../src/index.js";

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

    // Exercise the real MCP client and its validator through a fake HTTP server.
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
    expect(registered[0].outputSchema).toEqual(outputSchema);
    expect(registered[0].inputSchema).toEqual(weatherTool.inputSchema);
    expect(proxy.tools[0].outputSchema).toEqual(outputSchema);
  });

  it("returns validated structured data, not the MCP response wrapper", async () => {
    expect(await execute()).toEqual({ temperature: 21, conditions: "sunny" });
  });

  it.each([
    { temperature: "warm", conditions: "sunny" },
    { temperature: 21 },
    { temperature: 21, conditions: "sunny", unexpected: true },
  ])("rejects data that does not match the schema: %j", async (data) => {
    result.structuredContent = data;
    await expect(execute()).rejects.toThrow(
      /does not match the tool's output schema/i,
    );
  });

  it("rejects missing structured content even when text contains valid JSON", async () => {
    result = {
      content: [
        { type: "text", text: '{"temperature":21,"conditions":"sunny"}' },
      ],
    };
    await expect(execute()).rejects.toThrow(
      /did not return structured content/i,
    );
  });

  it("rejects an unusable schema rather than forwarding unchecked data", async () => {
    tools = [
      { ...weatherTool, outputSchema: { type: "object", $ref: "#/missing" } },
    ];
    await expect(execute()).rejects.toThrow(
      /invalid outputSchema|failed to validate/i,
    );
  });

  it.each([21, "warm"])(
    "validates nested schema references (temperature: %s)",
    async (temperature) => {
      tools = [
        {
          ...weatherTool,
          outputSchema: {
            type: "object",
            $defs: { reading: outputSchema },
            properties: { weather: { $ref: "#/$defs/reading" } },
            required: ["weather"],
          },
        },
      ];
      result.structuredContent = {
        weather: { temperature, conditions: "sunny" },
      };
      if (typeof temperature === "number") {
        expect(await execute()).toEqual(result.structuredContent);
      } else {
        await expect(execute()).rejects.toThrow(
          /does not match the tool's output schema/i,
        );
      }
    },
  );

  it("rejects null structured content for an object schema", async () => {
    result.structuredContent = null;
    await expect(execute()).rejects.toThrow(
      /expected record, received null/i,
    );
  });

  it("propagates MCP tool errors without treating them as schema violations", async () => {
    result = {
      isError: true,
      content: [{ type: "text", text: "Weather service unavailable" }],
      structuredContent: { error: "unavailable" },
    };
    await expect(execute()).rejects.toThrow(
      'Tool "getWeather" failed: Weather service unavailable',
    );
  });

  it("provides a fallback message for MCP errors without text", async () => {
    result = { isError: true, content: [] };
    await expect(execute()).rejects.toThrow(
      "The MCP server returned an error.",
    );
  });

  it.each([false, true])(
    "leaves schema-less results unchanged (isError: %s)",
    async (isError) => {
      const { outputSchema: _schema, ...tool } = weatherTool;
      tools = [tool];
      result.isError = isError;
      expect(await execute()).toEqual(result);
      expect(registered[0]).not.toHaveProperty("outputSchema");
    },
  );

  it("keeps forwarding the execution signal and uses the advertised tool definition", async () => {
    const callTool = vi.spyOn(Client.prototype, "callTool");
    const signal = new AbortController().signal;
    await execute(signal);
    expect(callTool).toHaveBeenCalledWith(
      { name: "getWeather", arguments: { city: "Paris" } },
      { signal, toolDefinition: expect.objectContaining({ outputSchema }) },
    );
  });

  it("does not turn cancellation into a schema error", async () => {
    const controller = new AbortController();
    controller.abort(new Error("Execution cancelled"));
    await expect(execute(controller.signal)).rejects.toThrow(
      "Execution cancelled",
    );
  });

  it("also advertises and validates schemas with the legacy navigator API", async () => {
    const modelContext = document.modelContext;
    vi.stubGlobal("document", {});
    vi.stubGlobal("navigator", { modelContext });
    expect(await execute()).toEqual(result.structuredContent);
    expect(registered[0].outputSchema).toEqual(outputSchema);
  });
});
