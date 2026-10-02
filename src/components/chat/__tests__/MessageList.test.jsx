import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import MessageList from "../MessageList";
import { resetSettings, settingsStore } from "@/stores/settings";
import { resetTurn, turnStore } from "@/stores/turn";

/**
 * The thread reads the turn and settings stores, so a test sets the world up
 * the way the app does — seed the stores, then render — instead of describing
 * the same conversation twice, once as props and once as state.
 */
function renderList({
  messages = [],
  activeConversation = null,
  turn,
  settings,
} = {}) {
  resetTurn();
  resetSettings();
  if (turn) turnStore.setState(turn);
  if (settings) settingsStore.setState(settings);
  return render(
    <MessageList
      messages={messages}
      activeConversation={activeConversation}
    />,
  );
}

/** Move the turn on mid-test, the way a live stream would. */
const seedTurn = (turn) => act(() => turnStore.setState(turn));

describe("MessageList", () => {
  it("exposes the thread as a labelled, focusable scroll region", () => {
    renderList({ messages: [] });

    const thread = screen.getByRole("region", { name: "Conversation" });
    // A scrollable area that is not focusable cannot be scrolled without a
    // pointing device, and an unlabelled one is invisible to landmark
    // navigation.
    expect(thread).toHaveAttribute("tabindex", "0");
    expect(thread.className).toContain("overflow-y-auto");
  });

  it("renders an empty state when no messages are present", () => {
    renderList({ messages: [] });
    expect(screen.getByText(/hack club ai/i)).toBeInTheDocument();
    expect(
      screen.getByText(/what do you need help with/i),
    ).toBeInTheDocument();
  });

  it("renders a user text message", () => {
    renderList({ messages: [{ role: "user", content: "Hello there" }] });
    expect(screen.getByText("Hello there")).toBeInTheDocument();
  });

  it("renders an assistant message", () => {
    renderList({ messages: [{ role: "assistant", content: "Hi friend" }] });
    expect(screen.getByText("Hi friend")).toBeInTheDocument();
  });

  it("renders streaming content", () => {
    renderList({
      messages: [],
      turn: { streamingContent: "partial response" },
    });
    expect(screen.getByText("partial response")).toBeInTheDocument();
  });

  it("shows the streaming indicator when streamingThinking is set with thinkingEnabled", () => {
    renderList({
      messages: [],
      turn: { streamingThinking: "thinking..." },
      settings: { thinkingEnabled: true },
    });
    expect(screen.getByText(/thinking/i)).toBeInTheDocument();
  });

  it("hides the streaming thinking block when thinking is turned off", () => {
    renderList({
      messages: [],
      turn: { streamingThinking: "thinking..." },
      settings: { thinkingEnabled: false },
    });
    expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument();
  });

  it("renders an error message when a message has an error", () => {
    const error = { title: "Oops", details: "Something failed" };
    renderList({
      messages: [{ role: "assistant", error }],
    });
    expect(screen.getByText("Oops")).toBeInTheDocument();
    expect(screen.getByText("Something failed")).toBeInTheDocument();
  });

  it("renders the partial answer above the error card when a failed turn has one", () => {
    // A turn that died mid-answer commits its partial with the error. The
    // text the user already read must stay on screen next to the card.
    renderList({
      messages: [
        {
          role: "assistant",
          content: "Half an answer that never fin",
          error: { title: "Oops", details: "Something failed" },
        },
      ],
    });
    expect(screen.getByText("Half an answer that never fin")).toBeInTheDocument();
    expect(screen.getByText("Oops")).toBeInTheDocument();
    expect(screen.getByText("Something failed")).toBeInTheDocument();
  });

  it("filters out empty user messages", () => {
    const messages = [
      { id: "1", role: "user", content: "hello" },
      { id: "2", role: "user", content: "", _files: [] },
      { id: "3", role: "assistant", content: "hi" },
    ];
    const view = renderList({ messages });

    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.getByText("hi")).toBeInTheDocument();
    // Two rows, not three: an empty message that rendered would leave a bare
    // avatar with nothing beside it.
    expect(view.container.querySelectorAll(".msg-row")).toHaveLength(2);
  });

  it("filters out tool messages", () => {
    renderList({
      messages: [
        { role: "tool", content: "tool result" },
        { role: "user", content: "user message" },
      ],
    });
    expect(screen.queryByText("tool result")).not.toBeInTheDocument();
    expect(screen.getByText("user message")).toBeInTheDocument();
  });

  it("renders an assistant message containing HTML artifacts", () => {
    const content = "Here:\n```html\n<div>hi</div>\n```";
    renderList({
      messages: [{ role: "assistant", content }],
      settings: { artifactsEnabled: true },
    });
    // The HTML block is removed from visible text
    expect(screen.queryByText("<div>hi</div>")).not.toBeInTheDocument();
    expect(screen.getByText("Here:")).toBeInTheDocument();
  });

  it("does not strip HTML fences when artifacts are disabled", () => {
    const content = "Here:\n```html\n<div>hi</div>\n```";
    renderList({ messages: [{ role: "assistant", content }] });
    // With artifacts off, the raw HTML block (including fences) is shown as text
    const matcher = (_text, node) =>
      node.children.length === 0 && node.textContent.includes("```html");
    expect(screen.getByText(matcher)).toBeInTheDocument();
  });

  it("renders streaming content with HTML fences as plain text when artifacts are disabled", () => {
    renderList({
      messages: [],
      turn: { streamingContent: "Here:\n```html\n<div>hi</div>" },
    });
    const matcher = (_text, node) =>
      node.children.length === 0 && node.textContent.includes("```html");
    expect(screen.getByText(matcher)).toBeInTheDocument();
    expect(
      screen.queryByText("Generating artifact..."),
    ).not.toBeInTheDocument();
  });

  it("shows the generating artifact state only when artifacts are enabled", () => {
    renderList({
      messages: [],
      turn: { streamingContent: "```html\n<div>partial</div>" },
      settings: { artifactsEnabled: true },
    });
    expect(screen.getByText("Generating artifact...")).toBeInTheDocument();
  });

  it("shows the Web Search indicator when webSearchEnabled is set during streaming", () => {
    renderList({
      messages: [],
      turn: { streamingContent: "searching" },
      settings: { webSearchEnabled: true },
    });
    expect(screen.getByText(/searching the web/i)).toBeInTheDocument();
  });

  it("renders an image attachment for user messages", () => {
    const messages = [
      {
        id: "1",
        role: "user",
        content: [
          { type: "text", text: "look" },
          { type: "image", image: "data:image/png;base64,123" },
        ],
      },
    ];
    renderList({ messages });
    const img = screen.getByRole("img");
    expect(img).toBeInTheDocument();
  });

  it("renders a file bubble for non-image attachments", () => {
    const messages = [
      {
        role: "user",
        content: "here's the doc",
        _files: [
          { id: "1", name: "doc.txt", type: "text/plain", size: 1024 },
        ],
      },
    ];
    renderList({ messages });
    expect(screen.getByText("doc.txt")).toBeInTheDocument();
  });

  it("renders a thinking block when thinking is present", () => {
    renderList({
      messages: [
        { role: "assistant", content: "answer", thinking: "hmm let me think" },
      ],
    });
    expect(screen.getByText(/thinking/i)).toBeInTheDocument();
  });

  it("renders sources when message has sources", () => {
    renderList({
      messages: [
        {
          role: "assistant",
          content: "see links",
          sources: [{ url: "https://a.example", title: "A" }],
        },
      ],
    });
    expect(screen.getByText(/sources \(1\)/i)).toBeInTheDocument();
  });

  it("renders a completed web-search message without dropping the thinking block", () => {
    // The web-search badge only renders on a *completed* assistant message.
    // An unimported icon there throws during render and the whole message —
    // including the thinking block — unmounts.
    renderList({
      messages: [
        {
          role: "assistant",
          content: "here is the answer",
          thinking: "I considered the search results",
          webSearch: true,
        },
      ],
    });
    expect(screen.getByText(/thinking/i)).toBeInTheDocument();
    expect(screen.getByText("here is the answer")).toBeInTheDocument();
    expect(screen.getByText(/web search/i)).toBeInTheDocument();
  });

  it("reports the thinking block as a collapsed disclosure that opens", async () => {
    const user = userEvent.setup();
    renderList({
      messages: [
        { role: "assistant", content: "answer", thinking: "hmm let me think" },
      ],
      settings: { showThinking: false },
    });

    const toggle = screen.getByRole("button", { name: /thinking/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("reports the sources list as a collapsed disclosure that opens", async () => {
    const user = userEvent.setup();
    renderList({
      messages: [
        {
          role: "assistant",
          content: "see links",
          sources: [{ url: "https://a.example", title: "A" }],
        },
      ],
    });

    const toggle = screen.getByRole("button", { name: /sources \(1\)/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("does not render a stale streaming tail once the turn is persisted", () => {
    const view = renderList({
      messages: [],
      turn: { streamingContent: "stale tail" },
    });

    seedTurn({ streamingContent: "", streamingThinking: "", isLoading: false });
    view.rerender(
      <MessageList
        messages={[
          { role: "user", content: "question" },
          { role: "assistant", content: "", thinking: "fresh thinking" },
        ]}
      />,
    );

    expect(screen.queryByText("stale tail")).not.toBeInTheDocument();
    expect(screen.getByText(/thinking/i)).toBeInTheDocument();
  });

  it("does not render a stale streaming tail beside an error card", () => {
    const view = renderList({
      messages: [],
      turn: { streamingContent: "stale tail" },
    });

    seedTurn({ streamingContent: "", isLoading: false });
    view.rerender(
      <MessageList
        messages={[
          {
            role: "assistant",
            content: "",
            error: { title: "Boom", details: "request failed" },
          },
        ]}
      />,
    );

    expect(screen.getByText("Boom")).toBeInTheDocument();
    expect(screen.queryByText("stale tail")).not.toBeInTheDocument();
  });

  it("hides the stream, its text, and its placeholder when they belong to another conversation", () => {
    renderList({
      messages: [{ role: "user", content: "hello" }],
      activeConversation: "conv-b",
      turn: {
        streamingConversationId: "conv-a",
        isLoading: true,
        streamingContent: "other chat text",
      },
      settings: { thinkingEnabled: true },
    });
    expect(screen.queryByText("other chat text")).not.toBeInTheDocument();
    expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("shows the placeholder for the active conversation's stream before content arrives", () => {
    renderList({
      messages: [{ role: "user", content: "hello" }],
      activeConversation: "conv-a",
      turn: { streamingConversationId: "conv-a", isLoading: true },
      settings: { thinkingEnabled: true },
    });
    expect(screen.getByText(/thinking/i)).toBeInTheDocument();
  });

  it("renders a persisted thinking chip inside the expanded block", () => {
    renderList({
      messages: [
        {
          role: "assistant",
          content: "answer",
          thinking: "I should compute that. So it is done.",
          thinkingChips: [
            { tool: "javascript_calculator", at: 23, label: "5 + 5" },
          ],
        },
      ],
      settings: { showThinking: true },
    });

    const body = document.body.textContent;
    expect(body).toContain("5 + 5");
    // The pill sits between the reasoning before the call and after it.
    expect(body.indexOf("I should compute that.")).toBeLessThan(
      body.indexOf("5 + 5"),
    );
    expect(body.indexOf("5 + 5")).toBeLessThan(body.indexOf("So it is done."));
  });

  it("renders live streaming chips for the active conversation", () => {
    renderList({
      messages: [{ role: "user", content: "hello" }],
      activeConversation: "conv-a",
      turn: {
        streamingConversationId: "conv-a",
        isLoading: true,
        streamingThinking: "computing. ",
        streamingToolChips: [
          {
            index: 0,
            tool: "javascript_calculator",
            at: 11,
            args: "",
            label: "5 + 5",
          },
        ],
      },
      settings: { thinkingEnabled: true, showThinking: true },
    });

    expect(screen.getByText(/computing/)).toBeInTheDocument();
    expect(screen.getByText("5 + 5")).toBeInTheDocument();
  });

  it("shows a chips-only stream without a second thinking placeholder", () => {
    renderList({
      messages: [{ role: "user", content: "hello" }],
      activeConversation: "conv-a",
      turn: {
        streamingConversationId: "conv-a",
        isLoading: true,
        streamingToolChips: [
          { index: 0, tool: "javascript_calculator", at: 0, label: "5 + 5" },
        ],
      },
      settings: { thinkingEnabled: true, showThinking: true },
    });

    expect(screen.getByText("5 + 5")).toBeInTheDocument();
    // The chip's own block is the thinking block. The empty indicator
    // placeholder is for a stream with nothing to show yet — with a chip
    // already on screen it would be a second "Thinking" for no reason.
    expect(
      screen.getAllByRole("button", { name: /thinking/i }),
    ).toHaveLength(1);
  });

  it("keeps a message whose only content is a chip renderable", () => {
    // The gates (hasRenderableContent in the list, hasVisibleBody in the
    // row) both had to learn about chips: a tool call can arrive before the
    // model writes a single reasoned word, and dropping the row would drop
    // the only trace of what the model did.
    renderList({
      messages: [
        {
          role: "assistant",
          content: "",
          thinkingChips: [
            { tool: "javascript_calculator", at: 0, label: "5 + 5" },
          ],
        },
      ],
      settings: { showThinking: true },
    });

    expect(screen.getByText("5 + 5")).toBeInTheDocument();
  });

  it("hides live chips that belong to another conversation", () => {
    renderList({
      messages: [{ role: "user", content: "hello" }],
      activeConversation: "conv-b",
      turn: {
        streamingConversationId: "conv-a",
        isLoading: true,
        streamingThinking: "other chat reasoning",
        streamingToolChips: [
          { index: 0, tool: "javascript_calculator", at: 0, label: "9 * 9" },
        ],
      },
      settings: { thinkingEnabled: true, showThinking: true },
    });

    expect(screen.queryByText("9 * 9")).not.toBeInTheDocument();
    expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });
});
