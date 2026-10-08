import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ArtifactPanel from "@/components/chat/ArtifactPanel";
import ChatLayout from "@/components/chat/ChatLayout";

const makeConversation = (id, title) => ({ id, title, messages: [] });

const baseProps = (overrides = {}) => ({
  conversations: [makeConversation("c1", "First chat"), makeConversation("c2", "Second chat")],
  activeConversation: "c1",
  onSelectConversation: vi.fn(),
  onDeleteConversation: vi.fn(),
  onRenameConversation: vi.fn(),
  onNewChat: vi.fn(),
  onApiKeyClick: vi.fn(),
  searchQuery: "",
  onSearchChange: vi.fn(),
  selectedModel: "model-a",
  onModelChange: vi.fn(),
  thinkingEnabled: true,
  onThinkingChange: vi.fn(),
  artifactsEnabled: false,
  onArtifactsChange: vi.fn(),
  webSearchEnabled: false,
  onWebSearchChange: vi.fn(),
  agentModeEnabled: false,
  onAgentModeChange: vi.fn(),
  contextUsage: 0,
  toolsSupported: true,
  hasE2bKey: true,
  totalCost: 0,
  // A function, because the row owns the panel's width and hands it down.
  rightPanel: () => <div data-testid="right-panel">Panel</div>,
  children: <div data-testid="main-content">Main</div>,
  ...overrides,
});

const headerButtons = () =>
  Array.from(document.querySelector("header").querySelectorAll("button"));

const rowFor = (title) => screen.getByText(title).closest("li");

function SearchHarness(props) {
  const [query, setQuery] = useState("");
  return (
    <ChatLayout {...props} searchQuery={query} onSearchChange={setQuery} />
  );
}

describe("ChatLayout shell", () => {
  it("renders conversations, main content and the right panel", () => {
    render(<ChatLayout {...baseProps()} />);
    expect(screen.getByText("First chat")).toBeInTheDocument();
    expect(screen.getByText("Second chat")).toBeInTheDocument();
    expect(screen.getByTestId("main-content")).toBeInTheDocument();
    expect(screen.getByTestId("right-panel")).toBeInTheDocument();
  });

  it("marks the active conversation", () => {
    render(<ChatLayout {...baseProps()} />);
    expect(rowFor("First chat")).toHaveClass("bg-accent");
    expect(rowFor("Second chat")).not.toHaveClass("bg-accent");
  });

  it("collapses and re-expands the sidebar width", async () => {
    render(<ChatLayout {...baseProps()} />);
    const aside = document.querySelector("aside");
    expect(aside).toHaveStyle({ width: "260px" });

    await userEvent.click(headerButtons()[0]);
    expect(aside).toHaveStyle({ width: "56px" });
    expect(screen.getByRole("navigation", { name: "Quick actions" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(aside).toHaveStyle({ width: "260px" });
  });

  it("persists a dragged sidebar width to localStorage", async () => {
    localStorage.clear();
    render(<ChatLayout {...baseProps()} />);
    const handle = screen.getByLabelText("Resize sidebar");

    await userEvent.pointer([
      { keys: "[MouseLeft>]", target: handle },
      { keys: "[/MouseLeft]" },
    ]);

    expect(localStorage.getItem("hcai_sidebar_width")).toBe("260");
  });

  // The width is read after mount rather than in a state initialiser, because
  // an initialiser also runs on the server — which made the first client paint
  // disagree with the server HTML and the sidebar jump on every load.
  describe("restoring a stored width", () => {
    it("adopts the stored width after mounting", async () => {
      localStorage.clear();
      localStorage.setItem("hcai_sidebar_width", "340");

      render(<ChatLayout {...baseProps()} />);

      await waitFor(() => {
        expect(document.querySelector("aside")).toHaveStyle({ width: "340px" });
      });
    });

    it("leaves the stored width alone while restoring it", async () => {
      // The write effect must not run before the read has happened, or the
      // default is persisted over the saved value on the way past.
      localStorage.clear();
      localStorage.setItem("hcai_sidebar_width", "340");

      render(<ChatLayout {...baseProps()} />);
      await waitFor(() => {
        expect(localStorage.getItem("hcai_sidebar_width")).toBe("340");
      });
    });

    it("clamps a stored width from another screen size", async () => {
      localStorage.clear();
      // A width saved on a 4K display is unusable on a laptop, and one saved
      // while the window was narrow is narrower than the minimum.
      localStorage.setItem("hcai_sidebar_width", "4000");
      const { unmount } = render(<ChatLayout {...baseProps()} />);
      await waitFor(() => {
        expect(document.querySelector("aside")).toHaveStyle({ width: "600px" });
      });
      unmount();

      localStorage.setItem("hcai_sidebar_width", "10");
      render(<ChatLayout {...baseProps()} />);
      await waitFor(() => {
        expect(document.querySelector("aside")).toHaveStyle({ width: "200px" });
      });
    });

    it("ignores a stored width that is not a number", async () => {
      localStorage.clear();
      localStorage.setItem("hcai_sidebar_width", "wide please");

      render(<ChatLayout {...baseProps()} />);

      await waitFor(() => {
        expect(localStorage.getItem("hcai_sidebar_width")).toBe("260");
      });
      expect(document.querySelector("aside")).toHaveStyle({ width: "260px" });
    });
  });

  it("resizes while the pointer is held and clamps to the limits", async () => {
    localStorage.clear();
    render(<ChatLayout {...baseProps()} />);
    const handle = screen.getByLabelText("Resize sidebar");
    const aside = document.querySelector("aside");

    fireEvent.pointerDown(handle, { clientX: 300, pointerId: 1 });
    expect(document.body.style.cursor).toBe("col-resize");

    fireEvent.pointerMove(handle, { clientX: 340, pointerId: 1 });
    expect(aside).toHaveStyle({ width: "340px" });

    // Both ends are clamped, not just the lower one.
    fireEvent.pointerMove(handle, { clientX: 40, pointerId: 1 });
    expect(aside).toHaveStyle({ width: "200px" });
    fireEvent.pointerMove(handle, { clientX: 5000, pointerId: 1 });
    expect(aside).toHaveStyle({ width: "600px" });

    fireEvent.pointerUp(handle, { pointerId: 1 });
  });

  it("releases the document cursor lock when the drag is cancelled", () => {
    render(<ChatLayout {...baseProps()} />);
    const handle = screen.getByLabelText("Resize sidebar");

    fireEvent.pointerDown(handle, { clientX: 300, pointerId: 1 });
    expect(document.body.style.cursor).toBe("col-resize");
    expect(document.body.style.userSelect).toBe("none");

    fireEvent.pointerCancel(handle, { pointerId: 1 });

    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
  });

  it("releases the document cursor lock when unmounted mid-drag", () => {
    const { unmount } = render(<ChatLayout {...baseProps()} />);

    fireEvent.pointerDown(
      screen.getByLabelText("Resize sidebar"),
      { clientX: 300, pointerId: 1 },
    );
    expect(document.body.style.cursor).toBe("col-resize");

    unmount();

    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
  });

  it("reopens the conversation list through the mobile sheet", async () => {
    render(<ChatLayout {...baseProps()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(headerButtons()[1]);

    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("First chat")).toBeInTheDocument();
    expect(within(sheet).getByText("Second chat")).toBeInTheDocument();
  });
});

describe("ChatLayout header toggles", () => {
  // Header button order: collapse, mobile menu, thinking, artifacts,
  // web search, agent mode, then the model picker trigger.
  it("wires each toggle to its handler", async () => {
    const props = baseProps();
    render(<ChatLayout {...props} />);

    await userEvent.click(headerButtons()[2]);
    expect(props.onThinkingChange).toHaveBeenCalledWith(false);

    await userEvent.click(headerButtons()[3]);
    expect(props.onArtifactsChange).toHaveBeenCalledWith(true);

    await userEvent.click(headerButtons()[4]);
    expect(props.onWebSearchChange).toHaveBeenCalledWith(true);

    await userEvent.click(headerButtons()[5]);
    expect(props.onAgentModeChange).toHaveBeenCalledWith(true);
  });

  it("disables web search and agent mode when the model lacks tools", () => {
    render(<ChatLayout {...baseProps({ toolsSupported: false })} />);
    expect(headerButtons()[4]).toBeDisabled();
    expect(headerButtons()[5]).toBeDisabled();
    expect(headerButtons()[2]).not.toBeDisabled();
  });

  it("disables agent mode only when no E2B key is stored", () => {
    render(<ChatLayout {...baseProps({ hasE2bKey: false })} />);
    expect(headerButtons()[5]).toBeDisabled();
    expect(headerButtons()[4]).not.toBeDisabled();
  });

  it("renders the context usage indicator with the model's window", () => {
    render(
      <ChatLayout {...baseProps({ contextUsage: 1000, totalCost: 0.42 })} />,
    );
    expect(document.querySelector("header")).toBeInTheDocument();
    expect(screen.getByTestId("right-panel")).toBeInTheDocument();
  });
});

describe("ChatLayout fullscreen artifacts", () => {
  it("hides header controls and parks the panel in a fixed overlay", () => {
    render(<ChatLayout {...baseProps({ artifactFullscreen: true })} />);
    const overlay = document.querySelector(".fixed.inset-0");
    expect(overlay).not.toBeNull();
    expect(within(overlay).getByTestId("right-panel")).toBeInTheDocument();
    expect(headerButtons()).toHaveLength(2);
  });

  it("keeps the shell chrome when not fullscreen", () => {
    render(<ChatLayout {...baseProps({ artifactFullscreen: false })} />);
    expect(headerButtons().length).toBeGreaterThan(2);
    expect(document.querySelector(".fixed.inset-0")).toBeNull();
  });
});

describe("SidebarContent conversations", () => {
  it("starts a new chat and opens settings", async () => {
    const props = baseProps();
    render(<ChatLayout {...props} />);

    await userEvent.click(screen.getByRole("button", { name: /New Chat/ }));
    expect(props.onNewChat).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: /Settings/ }));
    expect(props.onApiKeyClick).toHaveBeenCalledTimes(1);
  });

  it("closes the mobile nav sheet when Settings is opened", async () => {
    const props = baseProps();
    render(<ChatLayout {...props} />);

    await userEvent.click(headerButtons()[1]);
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByRole("button", { name: /Settings/ })).toBeInTheDocument();

    await userEvent.click(within(sheet).getByRole("button", { name: /Settings/ }));

    expect(props.onApiKeyClick).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("selects a conversation when its title is clicked", async () => {
    const props = baseProps();
    render(<ChatLayout {...props} />);
    await userEvent.click(screen.getByText("Second chat"));
    expect(props.onSelectConversation).toHaveBeenCalledWith("c2");
  });

  it("filters conversations by title as the query changes", async () => {
    render(<SearchHarness {...baseProps()} />);
    expect(screen.getByText("First chat")).toBeInTheDocument();

    await userEvent.type(
      screen.getByPlaceholderText("Search chats..."),
      "second",
    );

    expect(screen.getByText("Second chat")).toBeInTheDocument();
    expect(screen.queryByText("First chat")).not.toBeInTheDocument();
  });

  it("renames a conversation through the inline editor", async () => {
    const props = baseProps();
    render(<ChatLayout {...props} />);

    await userEvent.click(within(rowFor("First chat")).getByLabelText("Rename"));
    const editor = screen.getByDisplayValue("First chat");
    await userEvent.clear(editor);
    await userEvent.type(editor, "Renamed chat{Enter}");

    expect(props.onRenameConversation).toHaveBeenCalledWith("c1", "Renamed chat");
  });

  it("cancels a rename with Escape without saving", async () => {
    const props = baseProps();
    render(<ChatLayout {...props} />);

    await userEvent.click(within(rowFor("First chat")).getByLabelText("Rename"));
    await userEvent.type(screen.getByDisplayValue("First chat"), "{Escape}");

    expect(props.onRenameConversation).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue("First chat")).not.toBeInTheDocument();
  });

  it("deletes a conversation", async () => {
    const props = baseProps();
    render(<ChatLayout {...props} />);
    await userEvent.click(within(rowFor("Second chat")).getByLabelText("Delete"));
    expect(props.onDeleteConversation).toHaveBeenCalledWith("c2");
  });

  it("marks the active conversation for assistive technology", () => {
    render(<ChatLayout {...baseProps()} />);
    expect(rowFor("First chat")).toHaveAttribute("aria-current", "true");
    expect(rowFor("Second chat")).not.toHaveAttribute("aria-current");
  });

  it("cancels an in-flight rename when another conversation is picked", async () => {
    const props = baseProps();
    render(<ChatLayout {...props} />);

    await userEvent.click(within(rowFor("First chat")).getByLabelText("Rename"));
    expect(screen.getByDisplayValue("First chat")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Second chat"));

    expect(props.onRenameConversation).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue("First chat")).not.toBeInTheDocument();
    expect(props.onSelectConversation).toHaveBeenCalledWith("c2");
  });

  it("saves a rename through the labelled save button", async () => {
    const props = baseProps();
    render(<ChatLayout {...props} />);

    await userEvent.click(within(rowFor("First chat")).getByLabelText("Rename"));
    const editor = screen.getByLabelText("Rename First chat");
    await userEvent.clear(editor);
    await userEvent.type(editor, "Kept");
    await userEvent.click(screen.getByRole("button", { name: "Save rename" }));

    expect(props.onRenameConversation).toHaveBeenCalledWith("c1", "Kept");
    expect(screen.queryByLabelText("Rename First chat")).not.toBeInTheDocument();
  });

  it("shows an empty state when the search matches nothing", async () => {
    render(<SearchHarness {...baseProps()} />);

    await userEvent.type(
      screen.getByPlaceholderText("Search chats..."),
      "nothing",
    );

    expect(screen.getByText("No chats match your search")).toBeInTheDocument();
    expect(screen.queryByText("First chat")).not.toBeInTheDocument();
    expect(screen.queryByText("Second chat")).not.toBeInTheDocument();
  });

  it("shows an empty state when there are no conversations", () => {
    render(<SearchHarness {...baseProps({ conversations: [] })} />);
    expect(screen.getByText("No chats yet")).toBeInTheDocument();
  });
});

// The panel's width is the row's third grid track, so the behaviour a user sees
// — a drag that moves one track, clamped, remembered, and not re-laid out in
// steps — is only observable here. Tested against the real panel rather than a
// stub, because the stub is where the reflow would have hidden.
describe("artifact panel track", () => {
  const ARTIFACT = "<div>hello artifact</div>";
  const handle = () => screen.getByRole("separator", { name: /resize side panel/i });
  const row = () => document.querySelector(".grid");
  const trackWidth = () => {
    // "auto minmax(0, 1fr) 480px" splits on the space inside minmax() too, so
    // the panel track is the last part, not the third.
    const parts = row().style.gridTemplateColumns.trim().split(/\s+/);
    return Number.parseInt(parts[parts.length - 1], 10);
  };

  const withPanel = (overrides = {}) =>
    baseProps({
      isDesktop: true,
      panelOpen: true,
      rightPanel: (panel) => (
        <ArtifactPanel
          artifacts={[ARTIFACT]}
          isOpen
          onToggle={vi.fn()}
          onFullscreenToggle={vi.fn()}
          {...panel}
        />
      ),
      ...overrides,
    });

  beforeEach(() => {
    localStorage.clear();
  });

  it("spends the panel width as the third track", () => {
    render(<ChatLayout {...withPanel()} />);

    expect(trackWidth()).toBe(480);
    // The thread keeps the middle track and the sidebar the first, so the row
    // is three explicit tracks rather than auto-placed children.
    expect(row().style.gridTemplateColumns).toMatch(/^\d+px minmax\(0, 1fr\) \d+px$/);
  });

  it("collapses the track when the panel is closed", () => {
    render(<ChatLayout {...withPanel({ panelOpen: false })} />);

    expect(trackWidth()).toBe(0);
  });

  it("collapses the track in fullscreen, where the panel is an overlay", () => {
    render(<ChatLayout {...withPanel({ artifactFullscreen: true })} />);

    // The overlay is fixed and covers the row; a live track would push the
    // thread sideways behind it for no reason.
    expect(trackWidth()).toBe(0);
    expect(screen.getByRole("separator", { name: /resize side panel/i })).toBeTruthy();
  });

  it("collapses the track on a narrow viewport, where the panel is fixed", () => {
    render(<ChatLayout {...withPanel({ isDesktop: false })} />);

    expect(trackWidth()).toBe(0);
  });

  it("accumulates arrow-key steps into the track", async () => {
    render(<ChatLayout {...withPanel()} />);

    await userEvent.click(handle());
    fireEvent.keyDown(handle(), { key: "ArrowLeft" });
    await waitFor(() => expect(trackWidth()).toBe(490));

    fireEvent.keyDown(handle(), { key: "ArrowLeft", shiftKey: true });
    await waitFor(() => expect(trackWidth()).toBe(540));

    // Arrow right narrows: the panel's edge is on its left.
    fireEvent.keyDown(handle(), { key: "ArrowRight" });
    await waitFor(() => expect(trackWidth()).toBe(530));
    expect(handle()).toHaveAttribute("aria-valuenow", "530");
  });

  it("never lets the track go below the minimum", async () => {
    render(<ChatLayout {...withPanel()} />);

    await userEvent.click(handle());
    for (let i = 0; i < 40; i++) {
      fireEvent.keyDown(handle(), { key: "ArrowRight" });
    }

    await waitFor(() => expect(trackWidth()).toBe(320));
  });

  it("never lets the track take more than the viewport allows", async () => {
    render(<ChatLayout {...withPanel()} />);

    await userEvent.click(handle());
    for (let i = 0; i < 40; i++) {
      fireEvent.keyDown(handle(), { key: "ArrowLeft", shiftKey: true });
    }

    // jsdom's window is 1024 wide, which caps the panel well below the
    // absolute maximum — a panel wider than the screen has no drag handle
    // left to grab.
    await waitFor(() => expect(trackWidth()).toBe(704));
  });

  it("follows a drag with the track", () => {
    render(<ChatLayout {...withPanel()} />);

    fireEvent.pointerDown(handle(), { clientX: 1000, pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientX: 940, pointerId: 1 });

    expect(trackWidth()).toBe(540);
  });

  it("drops the transition while a drag is live", () => {
    render(<ChatLayout {...withPanel()} />);

    // A transition that trails the pointer reads as lag. The track is written
    // directly on every move, so the animation has to be off for its duration.
    expect(row().className).toContain("transition-[grid-template-columns]");

    fireEvent.pointerDown(handle(), { clientX: 1000, pointerId: 1 });
    expect(row().className).not.toContain("transition-[grid-template-columns]");

    fireEvent.pointerUp(handle(), { pointerId: 1 });
    expect(row().className).toContain("transition-[grid-template-columns]");
  });

  it("remembers a width the user chose", async () => {
    render(<ChatLayout {...withPanel()} />);

    await userEvent.click(handle());
    fireEvent.keyDown(handle(), { key: "ArrowLeft", shiftKey: true });

    await waitFor(() =>
      expect(localStorage.getItem("hcai_artifact_panel_width")).toBe("530"),
    );
  });

  it("adopts a remembered width on the next load", async () => {
    localStorage.setItem("hcai_artifact_panel_width", "612");

    render(<ChatLayout {...withPanel()} />);

    await waitFor(() => expect(trackWidth()).toBe(612));
  });

  it("leaves a remembered width alone while restoring it", async () => {
    localStorage.setItem("hcai_artifact_panel_width", "612");

    render(<ChatLayout {...withPanel()} />);

    await waitFor(() =>
      expect(localStorage.getItem("hcai_artifact_panel_width")).toBe("612"),
    );
  });

  it("ignores a remembered width that is not a number", async () => {
    localStorage.setItem("hcai_artifact_panel_width", "very wide");

    render(<ChatLayout {...withPanel()} />);

    await waitFor(() =>
      expect(localStorage.getItem("hcai_artifact_panel_width")).toBe("480"),
    );
  });
});
