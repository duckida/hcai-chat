import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../route";

vi.mock("@/lib/tools", async () => {
  const actual = await vi.importActual("@/lib/tools");
  return {
    ...actual,
    executeTool: vi.fn(),
    getTools: vi.fn(),
  };
});

const { executeTool, getTools } = await import("@/lib/tools");

const makeReq = (body) => ({
  json: () => Promise.resolve(body),
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/api/tools POST", () => {
  it("returns 400 when tool or parameters are missing", async () => {
    const res1 = await POST(makeReq({ tool: "x" }));
    expect(res1.status).toBe(400);
    const res2 = await POST(makeReq({ parameters: { x: 1 } }));
    expect(res2.status).toBe(400);
  });

  it("returns 401 when apiKey is missing", async () => {
    const res = await POST(
      makeReq({ tool: "web_search", parameters: { query: "x" }, apiKey: "" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns the formatted result on success", async () => {
    executeTool.mockResolvedValue({
      query: "x",
      numResults: 3,
      answer: "found it",
      citations: [{ url: "https://a" }],
      success: true,
    });
    const res = await POST(
      makeReq({
        tool: "web_search",
        parameters: { query: "x" },
        apiKey: "k",
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tool).toBe("web_search");
    expect(data.result).toBe("found it");
    expect(data.sources).toEqual([{ url: "https://a" }]);
    expect(data.metadata).toMatchObject({ query: "x", success: true });
  });

  it("falls back to result.result for calculator tools", async () => {
    executeTool.mockResolvedValue({
      expression: "2+2",
      result: 4,
      success: true,
    });
    const res = await POST(
      makeReq({
        tool: "javascript_calculator",
        parameters: { expression: "2+2" },
        apiKey: "k",
      }),
    );
    const data = await res.json();
    expect(data.result).toBe("4");
  });

  it("uses sources as a fallback when citations are missing", async () => {
    executeTool.mockResolvedValue({
      answer: "x",
      sources: [{ url: "https://b" }],
    });
    const res = await POST(
      makeReq({ tool: "web_search", parameters: {}, apiKey: "k" }),
    );
    const data = await res.json();
    expect(data.sources).toEqual([{ url: "https://b" }]);
  });

  it("returns 500 with the error message on failure", async () => {
    executeTool.mockRejectedValue(new Error("Tool failed"));
    const res = await POST(
      makeReq({ tool: "web_search", parameters: {}, apiKey: "k" }),
    );
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Tool failed");
    expect(data.tool).toBe("web_search");
  });

  it("returns 500 if the body parse fails", async () => {
    const res = await POST({ json: () => Promise.reject(new Error("bad")) });
    expect(res.status).toBe(500);
  });
});

describe("/api/tools GET", () => {
  it("returns the list of tools", async () => {
    getTools.mockReturnValue([
      { type: "function", function: { name: "x" } },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tools).toHaveLength(1);
  });

  it("returns 500 on error", async () => {
    getTools.mockImplementation(() => {
      throw new Error("nope");
    });
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
