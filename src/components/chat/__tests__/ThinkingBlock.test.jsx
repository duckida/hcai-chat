import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import ThinkingBlock, { splitThinking } from "@/components/chat/message/ThinkingBlock";

/**
 * The chips are event positions in the reasoning, not render positions:
 * `at` is the thinking buffer's length when the call arrived. Everything
 * this file pins comes from that one rule — order, clamping, keys, and
 * the interleave the user sees when they expand the block.
 */

describe("splitThinking", () => {
  it("returns the whole text as one segment when there are no chips", () => {
    expect(splitThinking("just reasoning", [])).toEqual([
      { kind: "text", text: "just reasoning", key: "t0" },
    ]);
    expect(splitThinking("", [])).toEqual([]);
    expect(splitThinking("plain", null)).toEqual([
      { kind: "text", text: "plain", key: "t0" },
    ]);
  });

  it("splits text around a chip, in the order the model produced them", () => {
    const segments = splitThinking("before middle after", [
      { tool: "javascript_calculator", at: 7 },
    ]);

    expect(segments).toEqual([
      { kind: "text", text: "before ", key: "t0" },
      {
        kind: "chip",
        chip: { tool: "javascript_calculator", at: 7 },
        key: "c7-0",
      },
      { kind: "text", text: "middle after", key: "t7" },
    ]);
  });

  it("sorts delivery order out of display order", () => {
    const segments = splitThinking("abcd", [
      { tool: "second", at: 3 },
      { tool: "first", at: 1 },
    ]);

    expect(segments.map((s) => s.kind)).toEqual([
      "text",
      "chip",
      "text",
      "chip",
      "text",
    ]);
    expect(segments.filter((s) => s.kind === "chip").map((s) => s.chip.tool)).toEqual([
      "first",
      "second",
    ]);
    expect(segments.map((s) => s.text ?? s.chip.tool)).toEqual([
      "a",
      "first",
      "bc",
      "second",
      "d",
    ]);
  });

  it("clamps offsets so a chip can never fall out of the block", () => {
    const late = splitThinking("ab", [{ tool: "late", at: 99 }]);
    expect(late).toEqual([
      { kind: "text", text: "ab", key: "t0" },
      { kind: "chip", chip: { tool: "late", at: 99 }, key: "c2-0" },
    ]);

    const early = splitThinking("ab", [{ tool: "early", at: -3 }]);
    expect(early[0].kind).toBe("chip");

    // A malformed offset is pushed to the end rather than throwing.
    const garbage = splitThinking("ab", [{ tool: "x", at: "nope" }]);
    expect(garbage[garbage.length - 1].kind).toBe("chip");
    expect(garbage.map((s) => s.text ?? "").join("")).toBe("ab");
  });

  it("sits back-to-back calls side by side with no text between", () => {
    const segments = splitThinking("once", [
      { tool: "a", at: 4 },
      { tool: "b", at: 4 },
    ]);

    expect(segments.map((s) => s.kind)).toEqual(["text", "chip", "chip"]);
    // Keys derive from at + arrival order, so a growing tail can never
    // renumber an earlier chip.
    expect(segments.map((s) => s.key)).toEqual(["t0", "c4-0", "c4-1"]);
  });
});

describe("ThinkingBlock", () => {
  const renderOpen = (props) =>
    render(<ThinkingBlock defaultView="open" {...props} />);

  it("renders nothing when there is no thinking, no chip, and no stream", () => {
    const { container } = render(<ThinkingBlock thinking="" chips={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("starts closed and expands on click", async () => {
    render(
      <ThinkingBlock thinking="secret reasoning" chips={[]} />,
    );
    const toggle = screen.getByRole("button", { name: /thinking/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("secret reasoning")).not.toBeInTheDocument();

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("secret reasoning")).toBeInTheDocument();
  });

  it("interleaves the calculator's expression inside the reasoning", () => {
    renderOpen({
      thinking: "I should compute that. So the answer follows.",
      chips: [{ tool: "javascript_calculator", at: 23, label: "5 + 5" }],
    });

    const body = document.body.textContent;
    expect(body).toContain("I should compute that.");
    expect(body).toContain("5 + 5");
    expect(body).toContain("So the answer follows.");
    // DOM order is the order the model produced them: the pill sits between
    // the reasoning before the call and the reasoning after it.
    expect(body.indexOf("I should compute that.")).toBeLessThan(
      body.indexOf("5 + 5"),
    );
    expect(body.indexOf("5 + 5")).toBeLessThan(body.indexOf("So the answer follows."));
  });

  it("shows the query pill until the search's sites come back", () => {
    renderOpen({
      thinking: "Looking.",
      chips: [
        {
          tool: "web_search",
          at: 8,
          label: "opencode vs claude",
          // no sources yet
        },
      ],
    });

    expect(screen.getByText("opencode vs claude")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("turns search sources into one link pill per site", () => {
    renderOpen({
      thinking: "Looking.",
      chips: [
        {
          tool: "web_search",
          at: 8,
          label: "opencode vs claude",
          sources: ["reddit.com", "example.org"],
        },
      ],
    });

    const reddit = screen.getByRole("link", { name: "reddit.com" });
    expect(reddit).toHaveAttribute("href", "https://reddit.com");
    expect(screen.getByRole("link", { name: "example.org" })).toHaveAttribute(
      "href",
      "https://example.org",
    );
    // The query pill steps aside once the domains are here — the sketch
    // shows sites, not the search string.
    expect(screen.queryByText("opencode vs claude")).not.toBeInTheDocument();
  });

  it("labels a source pill by its domain but links to the full result URL", () => {
    renderOpen({
      thinking: "Looking.",
      chips: [
        {
          tool: "web_search",
          at: 8,
          label: "opencode vs claude",
          sources: [
            { domain: "reddit.com", href: "https://reddit.com/r/blahsdjdl" },
            { domain: "txt.com", href: "https://txt.com/search?q=hi" },
          ],
        },
      ],
    });

    // A path in the label would make pills unusably wide; a domain-only
    // target would throw away what the search actually returned.
    const reddit = screen.getByRole("link", { name: "reddit.com" });
    expect(reddit).toHaveAttribute("href", "https://reddit.com/r/blahsdjdl");
    expect(screen.getByRole("link", { name: "txt.com" })).toHaveAttribute(
      "href",
      "https://txt.com/search?q=hi",
    );
  });

  it("still renders a block when only a chip exists", () => {
    renderOpen({
      thinking: "",
      chips: [{ tool: "javascript_calculator", at: 0, label: "2 * 2" }],
    });

    expect(screen.getByText("2 * 2")).toBeInTheDocument();
  });
});
