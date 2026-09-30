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

  // Sandbox output is a setting because a transcript of every command's stdout
  // is a wall of text nobody wants. Turning it off has to actually remove it,
  // not just collapse the block.
  describe("sandbox output gating", () => {
    const sandboxMessage = {
      id: "1",
      role: "assistant",
      content: "ran it",
      sandboxResults: [
        {
          tool: "execute_code",
          code: "print('hello from the sandbox')",
          stdout: "hello from the sandbox",
          stderr: "",
          exitCode: 0,
        },
      ],
    };

    it("shows stdout when the setting is on", () => {
      renderList({
        messages: [sandboxMessage],
        settings: { showSandboxOutput: true, showSandboxCode: true },
      });
      expect(screen.getByText("hello from the sandbox")).toBeInTheDocument();
    });

    it("hides stdout when the setting is off", () => {
      renderList({
        messages: [sandboxMessage],
        settings: { showSandboxOutput: false, showSandboxCode: true },
      });
      expect(screen.queryByText("hello from the sandbox")).toBeNull();
      // The code is a separate setting and is unaffected — the two are
      // independent, and collapsing both would make the toggle a lie.
      expect(screen.getByText("print('hello from the sandbox')")).toBeInTheDocument();
    });

    it("hides stderr too, so a failing command cannot leak through", () => {
      renderList({
        messages: [
          {
            ...sandboxMessage,
            sandboxResults: [
              {
                tool: "run_command",
                command: "false",
                stdout: "",
                stderr: "Traceback: most recent call last",
                exitCode: 1,
              },
            ],
          },
        ],
        settings: { showSandboxOutput: false, showSandboxCode: true },
      });
      expect(
        screen.queryByText("Traceback: most recent call last"),
      ).toBeNull();
    });

    it("gates the live stream's output the same way", () => {
      // The committed and streaming paths are separate components; gating only
      // the committed one would leak output mid-run, which is the moment it is
      // most likely to be a wall of text.
      const turn = {
        isLoading: true,
        streamingContent: "",
        // The stream only renders for the conversation that started it, so
        // without these the block is absent for an unrelated reason and the
        // assertion below would pass without testing anything.
        streamingConversationId: "conv-1",
        streamingSandboxTools: [
          {
            index: 0,
            tool: "execute_code",
            code: "print('live output')",
            status: "complete",
            stdout: "live output",
            stderr: "",
          },
        ],
      };
      renderList({
        activeConversation: "conv-1",
        turn,
        settings: { showSandboxOutput: false, showSandboxCode: true },
      });
      expect(screen.queryByText("live output")).toBeNull();
    });

    it("shows the live stream's output when the setting is on", () => {
      renderList({
        activeConversation: "conv-1",
        turn: {
          isLoading: true,
          streamingContent: "",
          streamingConversationId: "conv-1",
          streamingSandboxTools: [
            {
              index: 0,
              tool: "execute_code",
              code: "print('live output')",
              status: "complete",
              stdout: "live output",
              stderr: "",
            },
          ],
        },
        settings: { showSandboxOutput: true, showSandboxCode: true },
      });
      expect(screen.getByText("live output")).toBeInTheDocument();
    });
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
});
