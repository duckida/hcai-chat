"use client";

import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import SidebarContent from "@/components/layout/SidebarContent";

const SIDEBAR_WIDTH_KEY = "hcai_sidebar_width";
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 600;

export default function ChatLayout({
  onNewChat,
  conversations = [],
  activeConversation,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  searchQuery = "",
  onSearchChange,
  selectedModel,
  onModelChange,
  groupedModels = {},
  thinkingEnabled,
  onThinkingChange,
  artifactsEnabled,
  onArtifactsChange,
  webSearchEnabled,
  onWebSearchChange,
  agentModeEnabled,
  onAgentModeChange,
  onApiKeyClick,
  rightPanel,
  children,
  artifactFullscreen = false,
  contextUsage = 0,
  contextWindowMap = {},
  toolsSupported = true,
  hasE2bKey = false,
  totalCost = 0,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === "undefined") return 260;
    try {
      const saved = window.localStorage.getItem(SIDEBAR_WIDTH_KEY);
      return saved
        ? Math.max(
            MIN_SIDEBAR_WIDTH,
            Math.min(MAX_SIDEBAR_WIDTH, parseInt(saved, 10)),
          )
        : 260;
    } catch {
      return 260;
    }
  });
  const [isDragging, setIsDragging] = useState(false);

  // Persist the resized sidebar width for the next session.
  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
    } catch {}
  }, [sidebarWidth]);

  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  // Listeners live in an effect tied to the drag state, so they are always
  // removed on drag end — and on unmount mid-drag — instead of relying on a
  // mouseup that may never fire.
  useEffect(() => {
    if (!isDragging) return;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (e) => {
      setSidebarWidth(
        Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, e.clientX)),
      );
    };
    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const sidebarContent = (
    <SidebarContent
      conversations={conversations}
      activeConversation={activeConversation}
      onSelectConversation={onSelectConversation}
      onDeleteConversation={onDeleteConversation}
      onRenameConversation={onRenameConversation}
      onNewChat={onNewChat}
      onApiKeyClick={onApiKeyClick}
      searchQuery={searchQuery}
      onSearchChange={onSearchChange}
      onSheetClose={() => setMobileSheetOpen(false)}
    />
  );

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans antialiased selection:bg-accent">
      <aside
        className={`hidden md:block shrink-0 overflow-hidden relative border-r border-border bg-muted ${!isDragging ? "transition-all duration-300 ease-in-out" : ""}`}
        style={{ width: sidebarOpen ? `${sidebarWidth}px` : "0px" }}
      >
        <div className="w-full h-full flex flex-col min-w-[200px]">
          {sidebarContent}
        </div>
        <button
          type="button"
          aria-label="Resize sidebar"
          className={`absolute right-0 top-0 bottom-0 w-3 cursor-col-resize flex items-center justify-center hover:bg-border/20 active:bg-border/30 transition-colors z-50 border-none bg-transparent p-0 ${isDragging ? "bg-border/20" : ""}`}
          onMouseDown={handleMouseDown}
        >
          <div
            className={`w-1 h-12 rounded-full ${isDragging ? "bg-muted-foreground" : "bg-border"}`}
          />
        </button>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 relative">
        <Header
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          mobileSheetOpen={mobileSheetOpen}
          onMobileSheetOpenChange={setMobileSheetOpen}
          sidebarContent={sidebarContent}
          selectedModel={selectedModel}
          onModelChange={onModelChange}
          groupedModels={groupedModels}
          thinkingEnabled={thinkingEnabled}
          onThinkingChange={onThinkingChange}
          artifactsEnabled={artifactsEnabled}
          onArtifactsChange={onArtifactsChange}
          webSearchEnabled={webSearchEnabled}
          onWebSearchChange={onWebSearchChange}
          agentModeEnabled={agentModeEnabled}
          onAgentModeChange={onAgentModeChange}
          artifactFullscreen={artifactFullscreen}
          contextUsage={contextUsage}
          contextWindowMap={contextWindowMap}
          toolsSupported={toolsSupported}
          hasE2bKey={hasE2bKey}
          totalCost={totalCost}
        />

        <main className="flex-1 min-w-0 overflow-hidden relative flex flex-col">
          {children}
        </main>
      </div>

      {!artifactFullscreen && rightPanel}

      {artifactFullscreen && (
        <div className="fixed inset-0 z-[100] bg-background">{rightPanel}</div>
      )}
    </div>
  );
}
