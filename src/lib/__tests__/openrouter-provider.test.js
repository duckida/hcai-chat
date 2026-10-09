import { describe, expect, it } from "vitest";
import { isValidOpenRouterProviderSlug } from "../openrouter-provider";

describe("OpenRouter provider slugs", () => {
  it.each([
    "deepseek",
    "deepinfra/turbo",
    "baidu/fp8",
    "provider-name/v1.2",
    " baidu/fp8 ",
  ])("accepts %s", (slug) => {
    expect(isValidOpenRouterProviderSlug(slug)).toBe(true);
  });

  it.each([
    "",
    " /fp8",
    "baidu/",
    "baidu//fp8",
    "baidu /fp8",
    "a".repeat(65),
  ])("rejects malformed slug %j", (slug) => {
    expect(isValidOpenRouterProviderSlug(slug)).toBe(false);
  });
});
