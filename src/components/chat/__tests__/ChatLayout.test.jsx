import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
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
  groupedModels: { Provider: [{ id: "model-a", name: "Model A" }] },
  thinkingEnabled: true,
  onThinkingChange: vi.fn(),
  artifactsEnabled: false,
  onArtifactsChange: vi.fn(),
  webSearchEnabled: false,
  onWebSearchChange: vi.fn(),
  agentModeEnabled: false,
  onAgentModeChange: vi.fn(),
  contextUsage: 0,
  contextWindowMap: { "model-a": 4096 },
  toolsSupported: true,
  hasE2bKey: true,
  totalCost: 0,
  rightPanel: <div data-testid="right-panel">Panel</div>,
  children: <div data-testid="main-content">Main</div>,
  ...overrides,
});

const headerButtons = () =>
  Array.from(document.querySelector("header").querySelectorAll("button"));

const rowFor = (title) => screen.getByText(title).closest("div");

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
    expect(aside).toHaveStyle({ width: "0px" });

    await userEvent.click(headerButtons()[0]);
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
});
