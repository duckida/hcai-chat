import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatApp from "@/components/chat/ChatApp";
import { getAllConversations } from "@/lib/db";
import { resetConversations } from "@/stores/conversations";
import { resetModels } from "@/stores/models";
import { resetSettings, setSetting } from "@/stores/settings";
import { resetTurn } from "@/stores/turn";

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
const panelOpen = () => screen.queryByLabelText("Resize artifact panel");
const panelCollapsed = () => screen.queryByLabelText("Open artifact panel");
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
});
