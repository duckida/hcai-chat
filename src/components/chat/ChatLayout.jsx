"use client";

import {
  ChevronRight,
  GalleryVerticalEnd,
  Plus,
  Settings2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "@/components/layout/Header";
import SidebarContent from "@/components/layout/SidebarContent";
import { Button } from "@/components/primitives/button";

const SIDEBAR_WIDTH_KEY = "hcai_sidebar_width";
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 600;
const DEFAULT_SIDEBAR_WIDTH = 260;

const PANEL_WIDTH_KEY = "hcai_artifact_panel_width";
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 1400;
const DEFAULT_PANEL_WIDTH = 480;

/** The saved width, clamped, or null when there is nothing usable to read. */
function readStoredSidebarWidth() {
  try {
    const saved = window.localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (!saved) return null;
    const parsed = parseInt(saved, 10);
    if (Number.isNaN(parsed)) return null;
    return Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, parsed));
  } catch {
    return null;
  }
}

function readStoredPanelWidth() {
  try {
    const saved = window.localStorage.getItem(PANEL_WIDTH_KEY);
    if (!saved) return null;
    const parsed = parseInt(saved, 10);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

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
  panelOpen = false,
  panelAvailable = false,
  onTogglePanel,
  isDesktop = false,
  contextUsage = 0,
  toolsSupported = true,
  hasE2bKey = false,
  totalCost = 0,
  onSettingsClick,
  onArtifactGalleryClick,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  // The stored width is read after mount, not in a state initialiser. An
  // initialiser runs while rendering — including the server render — so a
  // saved width made the first client paint disagree with the server's HTML,
  // and the sidebar visibly jumped on load for anyone who had resized it.
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isSidebarWidthReady, setIsSidebarWidthReady] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const sidebarHandleRef = useRef(null);

  useEffect(() => {
    setSidebarWidth(readStoredSidebarWidth() ?? DEFAULT_SIDEBAR_WIDTH);
    setIsSidebarWidthReady(true);
  }, []);

  // Persist the resized sidebar width for the next session. Gated on the read
  // having happened: without it, the first effect run would write the default
  // over the stored value on its way to reading it.
  useEffect(() => {
    if (!isSidebarWidthReady) return;
    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
    } catch {}
  }, [sidebarWidth, isSidebarWidthReady]);

  const resizeTo = useCallback((clientX) => {
    if (clientX == null) return;
    setSidebarWidth(
      Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, clientX)),
    );
  }, []);

  // ---- artifact panel width, owned here because the row is ----------------
  // The width lives on this component rather than in the panel because it is a
  // property of the row, not of the panel: it is the third grid track below.
  // Writing it onto the panel's own inline width meant every drag step re-laid
  // out the thread beside it instead of animating one track.
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isPanelWidthReady, setIsPanelWidthReady] = useState(false);
  const [isPanelResizing, setIsPanelResizing] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);

  useEffect(() => {
    setPanelWidth(readStoredPanelWidth() ?? DEFAULT_PANEL_WIDTH);
    setIsPanelWidthReady(true);

    const update = () => setViewportWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!isPanelWidthReady) return;
    try {
      window.localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth));
    } catch {}
  }, [panelWidth, isPanelWidthReady]);

  /**
   * Before the first resize event the viewport width is 0, and the arithmetic
   * would clamp the panel to nothing. Nothing is draggable that early, but a
   * stored width can be read in the same tick, so the fallback has to be a width
   * that cannot clamp anything away.
   */
  const maxPanelWidth = useMemo(
    () =>
      viewportWidth === 0
        ? DEFAULT_PANEL_WIDTH
        : Math.round(
            Math.min(
              viewportWidth * 0.85,
              MAX_PANEL_WIDTH,
              Math.max(viewportWidth - 320, 480),
            ),
          ),
    [viewportWidth],
  );

  const setClampedPanelWidth = useCallback(
    (width) => {
      if (width == null) return;
      setPanelWidth(Math.min(Math.max(width, MIN_PANEL_WIDTH), maxPanelWidth));
    },
    [maxPanelWidth],
  );

  // The panel contributes no track when it is closed, when it is fullscreen (a
  // fixed overlay covers the row), or on a narrow viewport (where it is itself
  // fixed and full-bleed). All three collapse to zero, which is what makes the
  // open/close transition a single track animation.
  const panelTrack =
    panelOpen && !artifactFullscreen && isDesktop ? panelWidth : 0;

  const panelApi = {
    width: panelWidth,
    isResizing: isPanelResizing,
    onWidthChange: setClampedPanelWidth,
    onResizingChange: setIsPanelResizing,
  };

  /**
   * A drag locks the cursor and the selection for the whole document, so every
   * way out of the gesture has to run the same release: pointerup, a
   * pointercancel when the browser takes the gesture over, a lost capture, and
   * unmounting mid-drag. This must be stable — the unmount effect below keys
   * off it, and an unstable version would re-run that effect on every render
   * and clear the lock while the drag was still live.
   */
  const endResize = useCallback(() => {
    setIsDragging(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => endResize, [endResize]);

  const startResize = useCallback((event) => {
    event.preventDefault();
    setIsDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    // Capture keeps the drag tracking past the handle, but it is an
    // enhancement: never let it take the gesture down if it is unavailable.
    try {
      sidebarHandleRef.current?.setPointerCapture(event.pointerId);
    } catch {}
  }, []);

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
    <div
      // Three tracks: sidebar, thread, panel. The panel's width is the third
      // track, so opening, closing and dragging it animate one length rather
      // than reflowing the thread a pixel at a time. The transition is off
      // during a drag — a transition that trails the pointer reads as lag, and
      // the track is already being written directly on every move.
      className={`grid h-screen bg-background text-foreground overflow-hidden font-sans antialiased selection:bg-accent ${
        isPanelResizing
          ? ""
          : "transition-[grid-template-columns] duration-200 ease-out"
      }`}
      style={{
        gridTemplateColumns: `${sidebarOpen ? sidebarWidth : 56}px minmax(0, 1fr) ${panelTrack}px`,
      }}
    >
      <aside
        className={`hidden md:block shrink-0 overflow-hidden relative border-r border-border bg-muted ${!isDragging ? "transition-all duration-300 ease-in-out" : ""}`}
        style={{ width: sidebarOpen ? `${sidebarWidth}px` : "56px" }}
      >
        {sidebarOpen ? (
          <div className="w-full h-full flex flex-col min-w-[200px]">
            {sidebarContent}
          </div>
        ) : (
          <nav
            aria-label="Quick actions"
            className="h-full w-14 flex flex-col items-center py-3 gap-2 bg-muted"
          >
            <Button
              variant="ghost"
              size="icon"
              aria-label="Expand sidebar"
              onClick={() => setSidebarOpen(true)}
              className="h-9 w-9 text-muted-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="New Chat"
              onClick={onNewChat}
              className="h-9 w-9 text-muted-foreground"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Artifact gallery"
              onClick={onArtifactGalleryClick}
              className="h-9 w-9 text-muted-foreground"
            >
              <GalleryVerticalEnd className="h-4 w-4" />
            </Button>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Settings"
              onClick={onSettingsClick}
              className="h-9 w-9 text-muted-foreground"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </nav>
        )}
        {sidebarOpen && (
          <button
            ref={sidebarHandleRef}
            type="button"
            aria-label="Resize sidebar"
            className={`absolute right-0 top-0 bottom-0 w-3 cursor-col-resize flex items-center justify-center hover:bg-border/20 active:bg-border/30 transition-colors z-50 border-none bg-transparent p-0 ${isDragging ? "bg-border/20" : ""}`}
            onPointerDown={startResize}
            onPointerMove={(event) => {
              if (isDragging) resizeTo(event.clientX);
            }}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            onLostPointerCapture={endResize}
          >
            <div
              className={`w-1 h-12 rounded-full ${isDragging ? "bg-muted-foreground" : "bg-border"}`}
            />
          </button>
        )}
      </aside>

      {/* A grid item's `min-height` defaults to `auto`, which means its
          content-based minimum: a tall thread would push the row past the
          viewport, and the grid's `overflow-hidden` would clip the composer
          below it with nothing left to scroll. `min-h-0` is what keeps the row
          at the viewport's height and the thread scrolling inside it instead. */}
      <div className="col-start-2 flex flex-col min-w-0 min-h-0 relative">
        <Header
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          mobileSheetOpen={mobileSheetOpen}
          onMobileSheetOpenChange={setMobileSheetOpen}
          sidebarContent={sidebarContent}
          selectedModel={selectedModel}
          onModelChange={onModelChange}
          thinkingEnabled={thinkingEnabled}
          onThinkingChange={onThinkingChange}
          artifactsEnabled={artifactsEnabled}
          onArtifactsChange={onArtifactsChange}
          webSearchEnabled={webSearchEnabled}
          onWebSearchChange={onWebSearchChange}
          agentModeEnabled={agentModeEnabled}
          onAgentModeChange={onAgentModeChange}
          artifactFullscreen={artifactFullscreen}
          panelOpen={panelOpen}
          panelAvailable={panelAvailable}
          onTogglePanel={onTogglePanel}
          contextUsage={contextUsage}
          toolsSupported={toolsSupported}
          hasE2bKey={hasE2bKey}
          totalCost={totalCost}
        />

        <main className="flex-1 min-w-0 overflow-hidden relative flex flex-col">
          {children}
        </main>
      </div>

      {!artifactFullscreen && rightPanel(panelApi)}

      {artifactFullscreen && (
        <div className="fixed inset-0 z-[100] bg-background">
          {rightPanel(panelApi)}
        </div>
      )}
    </div>
  );
}
