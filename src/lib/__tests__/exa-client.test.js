import { afterEach, describe, expect, it, vi } from "vitest";
import { exaSearchTool, exaFindSimilarTool, exaContentsTool, exaAnswerTool, ExaChatSystem } from "../exa-client";
import * as api from "../api-client";

vi.mock("../api-client", async () => {
  const actual = await vi.importActual("../api-client");
  return {
    ...actual,
    exaAnswer: vi.fn(),
    exaContents: vi.fn(),
    exaFindSimilar: vi.fn(),
    exaSearch: vi.fn(),
    streamExaAnswer: vi.fn(),
  };
});

describe("Exa tool definitions", () => {
  it("exaSearchTool has correct structure", () => {
    expect(exaSearchTool.type).toBe("function");
    expect(exaSearchTool.function.name).toBe("exa_search");
    expect(exaSearchTool.function.parameters.required).toContain("query");
  });

  it("exaFindSimilarTool requires url", () => {
    expect(exaFindSimilarTool.function.name).toBe("exa_find_similar");
    expect(exaFindSimilarTool.function.parameters.required).toContain("url");
  });

  it("exaContentsTool requires urls", () => {
    expect(exaContentsTool.function.name).toBe("exa_contents");
    expect(exaContentsTool.function.parameters.required).toContain("urls");
  });

  it("exaAnswerTool requires query", () => {
    expect(exaAnswerTool.function.name).toBe("exa_answer");
    expect(exaAnswerTool.function.parameters.required).toContain("query");
  });
});

describe("ExaChatSystem", () => {
  it("constructor stores the api key", () => {
    const system = new ExaChatSystem("my-key");
    expect(system.apiKey).toBe("my-key");
  });

  it("sendMessage calls exaAnswer with the message and options", async () => {
    api.exaAnswer.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ answer: "Answer", citations: [] }),
    });
    const system = new ExaChatSystem("k");
    const result = await system.sendMessage("hello", { stream: false });
    expect(api.exaAnswer).toHaveBeenCalledWith("hello", expect.objectContaining({ stream: false }));
    expect(result.content).toBe("Answer");
  });

  it("sendMessage extracts citations and sources", async () => {
    api.exaAnswer.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          answer: "x",
          citations: [{ url: "a" }],
          sources: [{ url: "b" }],
        }),
    });
    const system = new ExaChatSystem("k");
    const result = await system.sendMessage("hi");
    expect(result.citations).toEqual([{ url: "a" }]);
    expect(result.sources).toEqual([{ url: "b" }]);
  });

  it("rethrows errors from the API", async () => {
    api.exaAnswer.mockRejectedValue(new Error("API down"));
    const system = new ExaChatSystem("k");
    await expect(system.sendMessage("x")).rejects.toThrow("API down");
  });
});
