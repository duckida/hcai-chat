import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatApp from "@/components/chat/ChatApp";
import { getAllConversations } from "@/lib/db";
import { resetConversations } from "@/stores/conversations";
import { resetModels } from "@/stores/models";
import { resetSettings, setSetting } from "@/stores/settings";
import { resetTurn, turnStore } from "@/stores/turn";

/**
 * What the panel does is only observable through the row: ChatApp decides
 * whether it is open, ChatLayout spends that as the third grid track, and
 * ArtifactPanel renders only when it has something to show. All three have to
 * agree, so these cases assert on the track *and* on what painted — a track
 * paid for a panel that rendered nothing is the bug this file exists for.
 */

const ARTIFACT = "<div>hello artifact</div>";

const artifactConversation = () => ({
  id: "conv-artifact",
  title: "Artifact chat",
  createdAt: "2026-01-01T00:00:00.000Z",
  messages: [
    { role: "user", content: "make me a page" },
    { role: "assistant", content: `Here:\n\`\`\`html\n${ARTIFACT}\n\`\`\`` },
  ],
  model: "xiaomi/mimo-v2.5",
  contextUsage: 0,
});

const plainConversation = () => ({
  id: "conv-plain",
  title: "Plain chat",
  createdAt: "2026-01-01T00:00:00.000Z",
  messages: [{ role: "user", content: "just a question" }],
  model: "xiaomi/mimo-v2.5",
  contextUsage: 0,
});

vi.mock("@/lib/db", () => ({
  getAllConversations: vi.fn(async () => []),
  saveAllConversations: vi.fn(async () => {}),
  putConversation: vi.fn(async () => {}),
  deleteConversation: vi.fn(async () => {}),
}));

/**
 * jsdom matches no media query, so the viewport reads as narrow and the panel
 * track collapses to zero in every case — including the one that has to fail
 * when the track is wrongly reserved. Pinning the desktop width is what gives
 * these assertions something to be wrong about.
 */
const DESKTOP = {
  matches: true,
  media: "(min-width: 768px)",
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
};

const seed = (conversations) =>
  vi.mocked(getAllConversations).mockResolvedValue(conversations);

const stubFetch = () =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => ({
      ok: true,
      status: 200,
      json: async () =>
        typeof url === "string" && url.includes("/api/models")
          ? { data: [] }
          : {},
    })),
  );

/** The last track of `auto minmax(0, 1fr) Npx` is the panel's width. */
const trackWidth = () => {
  const row = document.querySelector(".grid");
  const parts = row.style.gridTemplateColumns.trim().split(/\s+/);
  return Number.parseInt(parts[parts.length - 1], 10);
};

/** Open paints a resize handle; collapsed still offers the artifacts it has. */
const panelOpen = () => screen.queryByLabelText("Resize side panel");
const panelCollapsed = () => screen.queryByLabelText("Open side panel");
const sidebar = () => within(document.querySelector("aside"));
const newChatButton = () =>
  sidebar().getByRole("button", { name: "New Chat" });

describe("artifact panel follows the conversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Suppresses the first-run API key dialog, which would otherwise sit over
    // every query in here.
    localStorage.setItem("hack_club_ai_key", "test-key");
    resetConversations();
    resetSettings();
    resetTurn();
    resetModels();
    window.matchMedia = () => DESKTOP;
    seed([artifactConversation()]);
    stubFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens for a conversation that owns an artifact", async () => {
    setSetting("artifactsEnabled", true);
    render(<ChatApp />);

    await waitFor(() => expect(trackWidth()).toBe(480));
    expect(panelOpen()).toBeTruthy();
    expect(panelCollapsed()).toBeNull();
  });

  it("closes when dismissed, and does not reopen behind the user", async () => {
    // Artifacts on: this is the reported case, where the panel could not be
    // dismissed at all because an effect opened it again on every render.
    setSetting("artifactsEnabled", true);
    render(<ChatApp />);
    await waitFor(() => expect(trackWidth()).toBe(480));

    await userEvent.click(screen.getByLabelText("Close"));

    await waitFor(() => expect(trackWidth()).toBe(0));
    expect(panelOpen()).toBeNull();
    // The artifact still exists, so the collapsed affordance stays available.
    expect(panelCollapsed()).toBeTruthy();
  });

  it("leaves the track collapsed when a new chat has nothing to show", async () => {
    setSetting("artifactsEnabled", true);
    render(<ChatApp />);
    await waitFor(() => expect(trackWidth()).toBe(480));

    await userEvent.click(newChatButton());

    await waitFor(() => expect(trackWidth()).toBe(0));
    expect(panelOpen()).toBeNull();
    expect(panelCollapsed()).toBeNull();
  });

  it("keeps the panel available after artifacts are switched off", async () => {
    // The toggle defaults to off, and it is off here: a chat that already owns
    // an artifact is still that chat when you come back to it.
    render(<ChatApp />);

    await waitFor(() => expect(trackWidth()).toBe(480));
    expect(panelOpen()).toBeTruthy();
  });

  it("does not reserve the track for a conversation with nothing to show", async () => {
    setSetting("artifactsEnabled", true);
    seed([plainConversation()]);
    render(<ChatApp />);

    // Sidebar titles prove hydration landed, so a collapsed track below is a
    // decision rather than an unrendered row.
    await waitFor(() =>
      expect(sidebar().getByText("Plain chat")).toBeInTheDocument(),
    );
    expect(trackWidth()).toBe(0);
    expect(panelOpen()).toBeNull();
    expect(panelCollapsed()).toBeNull();
  });

  // ---- the Cloud sandbox side of the same panel -------------------------
  const sandboxConversation = () => ({
    id: "conv-sandbox",
    title: "Sandbox chat",
    createdAt: "2026-01-01T00:00:00.000Z",
    messages: [
      { role: "user", content: "run ls for me" },
      {
        role: "assistant",
        content: "Here is what it printed.",
        sandboxResults: [
          {
            tool: "run_command",
            command: "ls",
            stdout: "wow desktop etc",
            stderr: "",
            exitCode: 0,
            conversationId: "conv-sandbox",
          },
        ],
      },
    ],
    model: "xiaomi/mimo-v2.5",
    contextUsage: 0,
  });

  const bothConversation = () => ({
    id: "conv-both",
    title: "Both chat",
    createdAt: "2026-01-01T00:00:00.000Z",
    messages: [
      { role: "user", content: "make a page and run it" },
      {
        role: "assistant",
        content: `Done:\n\`\`\`html\n${ARTIFACT}\n\`\`\``,
        sandboxResults: [
          {
            tool: "run_command",
            command: "ls",
            stdout: "wow desktop etc",
            stderr: "",
            exitCode: 0,
            conversationId: "conv-both",
          },
        ],
      },
    ],
    model: "xiaomi/mimo-v2.5",
    contextUsage: 0,
  });

  const liveRun = (index = 0) => ({
    index,
    tool: "run_command",
    code: "ls",
    status: "running",
    stdout: "",
    stderr: "",
    exitCode: null,
  });

  const terminal = () => screen.queryByLabelText("Cloud sandbox terminal");

  it("opens the terminal for a conversation that ran commands", async () => {
    seed([sandboxConversation()]);
    render(<ChatApp />);

    await waitFor(() => expect(trackWidth()).toBe(480));
    expect(panelOpen()).toBeTruthy();
    expect(terminal()).toBeTruthy();
    expect(screen.getByText("wow desktop etc")).toBeInTheDocument();
  });

  it("opens the terminal for a run happening right now", async () => {
    seed([plainConversation()]);
    render(<ChatApp />);
    await waitFor(() =>
      expect(sidebar().getByText("Plain chat")).toBeInTheDocument(),
    );
    expect(trackWidth()).toBe(0);

    act(() =>
      turnStore.setState({
        isLoading: true,
        streamingConversationId: "conv-plain",
        streamingSandboxTools: [liveRun()],
      }),
    );

    await waitFor(() => expect(trackWidth()).toBe(480));
    expect(terminal()).toBeTruthy();
    expect(screen.getByText("running…")).toBeInTheDocument();
  });

  it("ignores a run that belongs to another conversation", async () => {
    seed([plainConversation()]);
    render(<ChatApp />);
    await waitFor(() =>
      expect(sidebar().getByText("Plain chat")).toBeInTheDocument(),
    );

    // act() has flushed the render by the time this returns: if the live
    // derivation stopped gating on the conversation id, the track is 480 here
    // and this check fails. The check above proves the same wiring opens the
    // panel for its own run, so 0 below is the gate and not dead code.
    act(() =>
      turnStore.setState({
        isLoading: true,
        streamingConversationId: "conv-other",
        streamingSandboxTools: [liveRun()],
      }),
    );

    expect(trackWidth()).toBe(0);
    expect(terminal()).toBeNull();
  });

  it("closes when dismissed, and stays dismissed for this conversation", async () => {
    seed([sandboxConversation()]);
    render(<ChatApp />);
    await waitFor(() => expect(trackWidth()).toBe(480));

    await userEvent.click(screen.getByLabelText("Close"));

    await waitFor(() => expect(trackWidth()).toBe(0));
    expect(terminal()).toBeNull();
    // The runs still exist, so the collapsed affordance stays available.
    expect(panelCollapsed()).toBeTruthy();
  });

  it("reopens for the next turn's first run after being dismissed", async () => {
    seed([plainConversation()]);
    render(<ChatApp />);
    await waitFor(() =>
      expect(sidebar().getByText("Plain chat")).toBeInTheDocument(),
    );

    act(() =>
      turnStore.setState({
        isLoading: true,
        streamingConversationId: "conv-plain",
        streamingSandboxTools: [liveRun()],
      }),
    );
    await waitFor(() => expect(trackWidth()).toBe(480));

    await userEvent.click(screen.getByLabelText("Close"));
    await waitFor(() => expect(trackWidth()).toBe(0));

    // The turn ends (the store drops its tools, as beginTurn does) and a new
    // one starts its own run: the panel comes back, because a command you
    // have not dismissed yet is the thing the turn is for.
    act(() => turnStore.setState({ streamingSandboxTools: [] }));
    act(() =>
      turnStore.setState({ streamingSandboxTools: [liveRun(1)] }),
    );

    await waitFor(() => expect(trackWidth()).toBe(480));
    expect(terminal()).toBeTruthy();
  });

  it("brings its own side of the panel when a run starts", async () => {
    seed([artifactConversation()]);
    render(<ChatApp />);
    await waitFor(() => expect(trackWidth()).toBe(480));
    expect(screen.getByTitle("Artifact Preview")).toBeTruthy();

    act(() =>
      turnStore.setState({
        isLoading: true,
        streamingConversationId: "conv-artifact",
        streamingSandboxTools: [liveRun()],
      }),
    );

    // The panel was open on the artifact; a run starting mid-turn switches it
    // to the terminal, because that is what is happening now.
    await waitFor(() => expect(terminal()).toBeTruthy());
    expect(screen.queryByTitle("Artifact Preview")).toBeNull();
  });

  it("spends one track on a conversation that has both sides", async () => {
    seed([bothConversation()]);
    render(<ChatApp />);

    await waitFor(() => expect(trackWidth()).toBe(480));
    // Both tabs live in the one panel: two resize handles would mean two
    // panels paying for the same track.
    expect(
      screen.getAllByRole("separator", { name: /resize side panel/i }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Artifact" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cloud sandbox" }),
    ).toBeInTheDocument();
  });
});
