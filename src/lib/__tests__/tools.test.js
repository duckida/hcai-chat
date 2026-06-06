import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TOOLS,
  executeJavascriptCalculator,
  executeTool,
  executeWebSearch,
  getTools,
  getToolExecutors,
} from "../tools";
import { getStoredApiKey } from "../api-client";

vi.mock("../api-client", () => ({
  getStoredApiKey: vi.fn(),
}));

describe("TOOLS registry", () => {
  it("contains expected tools", () => {
    const names = TOOLS.map((t) => t.function.name);
    expect(names).toContain("web_search");
    expect(names).toContain("javascript_calculator");
  });

  it("each tool has a function name, description, and JSON schema", () => {
    for (const tool of TOOLS) {
      expect(tool.type).toBe("function");
      expect(typeof tool.function.name).toBe("string");
      expect(typeof tool.function.description).toBe("string");
      expect(tool.function.parameters.type).toBe("object");
    }
  });
});

describe("executeJavascriptCalculator", () => {
  it("evaluates simple addition", () => {
    expect(executeJavascriptCalculator("1 + 2").result).toBe(3);
  });

  it("respects operator precedence", () => {
    expect(executeJavascriptCalculator("2 + 3 * 4").result).toBe(14);
  });

  it("handles parentheses", () => {
    expect(executeJavascriptCalculator("(2 + 3) * 4").result).toBe(20);
  });

  it("handles unary minus", () => {
    expect(executeJavascriptCalculator("-5 + 3").result).toBe(-2);
    expect(executeJavascriptCalculator("-(2 + 3)").result).toBe(-5);
    expect(executeJavascriptCalculator("2 * -3").result).toBe(-6);
  });

  it("supports exponentiation (^)", () => {
    expect(executeJavascriptCalculator("2^10").result).toBe(1024);
    expect(executeJavascriptCalculator("3^2^2").result).toBe(81); // right-assoc: 3^(2^2) = 3^4
  });

  it("supports modulo (%)", () => {
    expect(executeJavascriptCalculator("10 % 3").result).toBe(1);
  });

  it("supports decimal arithmetic", () => {
    expect(executeJavascriptCalculator("0.1 + 0.2").result).toBeCloseTo(0.3);
  });

  it("supports chained operations", () => {
    expect(executeJavascriptCalculator("1 + 2 + 3 + 4").result).toBe(10);
    expect(executeJavascriptCalculator("100 / 4 / 5").result).toBe(5);
  });

  it("ignores whitespace in the expression", () => {
    expect(executeJavascriptCalculator("  1  +  2  ").result).toBe(3);
  });

  it("rejects division by zero", () => {
    expect(() => executeJavascriptCalculator("5 / 0")).toThrow(
      "Division by zero",
    );
    expect(() => executeJavascriptCalculator("5 % 0")).toThrow(
      "Division by zero",
    );
  });

  it("rejects empty expression", () => {
    expect(() => executeJavascriptCalculator("")).toThrow("Expression is required");
    expect(() => executeJavascriptCalculator("   ")).toThrow(
      "Expression is required",
    );
  });

  it("rejects non-string input", () => {
    expect(() => executeJavascriptCalculator(123)).toThrow(
      "Expression must be a string",
    );
    expect(() => executeJavascriptCalculator(null)).toThrow(
      "Expression must be a string",
    );
  });

  it("rejects mismatched parentheses", () => {
    expect(() => executeJavascriptCalculator("(1 + 2")).toThrow(
      "Mismatched parentheses",
    );
    expect(() => executeJavascriptCalculator("1 + 2)")).toThrow(
      "Mismatched parentheses",
    );
  });

  it("rejects invalid characters", () => {
    expect(() => executeJavascriptCalculator("1 + a")).toThrow(
      "Invalid character: a",
    );
  });

  it("rejects multiple decimal points", () => {
    expect(() => executeJavascriptCalculator("1.2.3 + 1")).toThrow(
      "Invalid number",
    );
  });

  it("rejects invalid operator placement (e.g., leading +)", () => {
    expect(() => executeJavascriptCalculator("+ 1 + 2")).toThrow(
      "Invalid operator placement",
    );
  });

  it("rejects malformed expressions with too many values", () => {
    expect(() => executeJavascriptCalculator("1 2")).toThrow(
      "Malformed expression",
    );
  });

  it("returns the original expression in the result object", () => {
    const r = executeJavascriptCalculator("1 + 1");
    expect(r.expression).toBe("1 + 1");
    expect(r.success).toBe(true);
  });

  it("handles nested parentheses and complex expressions", () => {
    expect(executeJavascriptCalculator("((1 + 2) * (3 + 4)) / 7").result).toBe(3);
  });
});

describe("executeWebSearch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws if no API key is provided or stored", async () => {
    getStoredApiKey.mockReturnValue(null);
    await expect(executeWebSearch("test")).rejects.toThrow(/API key/);
  });

  it("throws on invalid query", async () => {
    getStoredApiKey.mockReturnValue("test-key");
    await expect(executeWebSearch("")).rejects.toThrow(/Invalid search query/);
    await expect(executeWebSearch(null)).rejects.toThrow(/Invalid search query/);
  });

  it("returns parsed result for a successful search", async () => {
    getStoredApiKey.mockReturnValue("test-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: (h) => (h === "content-type" ? "application/json" : null) },
      text: () =>
        Promise.resolve(
          JSON.stringify({
            answer: "HCAI is Hack Club AI.",
            citations: [{ url: "https://example.com", title: "Example" }],
          }),
        ),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeWebSearch("What is HCAI?", 3);
    expect(result.query).toBe("What is HCAI?");
    expect(result.answer).toBe("HCAI is Hack Club AI.");
    expect(result.citations).toHaveLength(1);
    expect(result.numResults).toBe(3);
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ai.hackclub.com/proxy/v1/exa/answer",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
      }),
    );
  });

  it("clamps numResults to a 1-10 range", async () => {
    getStoredApiKey.mockReturnValue("key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      text: () => Promise.resolve(JSON.stringify({ answer: "ok" })),
    });
    vi.stubGlobal("fetch", fetchMock);

    await executeWebSearch("q", 999);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.numResults).toBe(10);

    await executeWebSearch("q", -1); // -1 is truthy, so `|| 5` doesn't apply, it tests clamping to 1
    const body2 = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body2.numResults).toBe(1);

    await executeWebSearch("q");
    const body3 = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(body3.numResults).toBe(5);
  });

  it("falls back to `content` when `answer` is not present", async () => {
    getStoredApiKey.mockReturnValue("key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        text: () => Promise.resolve(JSON.stringify({ content: "From content" })),
      }),
    );

    const r = await executeWebSearch("q");
    expect(r.answer).toBe("From content");
  });

  it("throws on non-JSON success response", async () => {
    getStoredApiKey.mockReturnValue("key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "text/html" },
        text: () => Promise.resolve("<html>oops</html>"),
      }),
    );
    await expect(executeWebSearch("q")).rejects.toThrow(/Invalid response type/);
  });

  it("throws on empty body", async () => {
    getStoredApiKey.mockReturnValue("key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        text: () => Promise.resolve(""),
      }),
    );
    await expect(executeWebSearch("q")).rejects.toThrow(/Empty response/);
  });

  it("uses server-provided error message on non-OK JSON response", async () => {
    getStoredApiKey.mockReturnValue("key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: { get: () => "application/json" },
        json: () => Promise.resolve({ error: "Unauthorized" }),
        text: () => Promise.resolve(""),
      }),
    );
    await expect(executeWebSearch("q")).rejects.toThrow(/Unauthorized/);
  });

  it("uses status-based message when error response is not JSON", async () => {
    getStoredApiKey.mockReturnValue("key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: () => "text/plain" },
        text: () => Promise.resolve("Internal Server Error"),
        json: () => Promise.reject(new Error("not json")),
      }),
    );
    await expect(executeWebSearch("q")).rejects.toThrow(/Internal Server Error/);
  });
});

describe("executeTool dispatcher", () => {
  it("throws for unknown tool names", async () => {
    await expect(executeTool("not_a_real_tool", {})).rejects.toThrow(
      /Unknown tool/,
    );
  });

  it("dispatches to javascript_calculator", async () => {
    const r = await executeTool("javascript_calculator", { expression: "2+2" });
    expect(r.result).toBe(4);
  });

  it("rethrows errors from inner executors", async () => {
    await expect(
      executeTool("javascript_calculator", { expression: "(1+2" }),
    ).rejects.toThrow(/Mismatched parentheses/);
  });
});

describe("getTools", () => {
  it("returns all tools by default", () => {
    const all = getTools();
    expect(all.length).toBe(TOOLS.length);
  });

  it("excludes web_search when includeWebSearch=false", () => {
    const filtered = getTools({ includeWebSearch: false });
    const names = filtered.map((t) => t.function.name);
    expect(names).not.toContain("web_search");
    expect(names).toContain("javascript_calculator");
  });
});

describe("getToolExecutors", () => {
  it("returns an array of executor objects with the right shape", () => {
    const executors = getToolExecutors();
    expect(Array.isArray(executors)).toBe(true);
    for (const exec of executors) {
      expect(typeof exec.name).toBe("string");
      expect(typeof exec.description).toBe("string");
      expect(exec.parameters).toBeDefined();
      expect(typeof exec.execute).toBe("function");
    }
  });

  it("executor wrappers can be invoked", async () => {
    const executors = getToolExecutors();
    const calc = executors.find((e) => e.name === "javascript_calculator");
    const result = await calc.execute({ expression: "10 - 4" });
    expect(result.result).toBe(6);
  });
});
