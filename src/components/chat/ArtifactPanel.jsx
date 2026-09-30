"use client";

import {
  Check,
  Code,
  Copy,
  Expand,
  Eye,
  Minimize,
  PanelRightClose,
  PanelRightOpen,
  Puzzle,
  Share2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import Markdown from "./message/Markdown";
import ThinkingIndicator from "./ThinkingIndicator";

const MIN_WIDTH = 320;
const DEFAULT_WIDTH = 480;
const STORAGE_KEY = "hcai_artifact_panel_width";

export default function ArtifactPanel({
  artifacts = [],
  isOpen = false,
  onToggle,
  streamingArtifact = null,
  fullscreen = false,
  onFullscreenToggle,
}) {
  const [activeTab, setActiveTab] = useState("preview");
  const [copied, setCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Hydration safety: the stored width is only read after mount so the
  // server render and first client paint agree on the panel's width.
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const [vw, setVw] = useState(0);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const stored = saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
      setPanelWidth(Number.isFinite(stored) ? stored : DEFAULT_WIDTH);
    } catch {
      setPanelWidth(DEFAULT_WIDTH);
    }

    const update = () => setVw(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  /**
   * Before the first resize event `vw` is 0, and the arithmetic below would
   * clamp the panel to zero width. Nothing is draggable that early, but a
   * stored width can be read in the same tick, so the fallback has to be a
   * width that cannot clamp anything away.
   */
  const maxWidth = useMemo(
    () =>
      vw === 0
        ? DEFAULT_WIDTH
        : Math.round(Math.min(vw * 0.85, 1400, Math.max(vw - 320, 480))),
    [vw],
  );

  useEffect(() => {
    if (panelWidth !== DEFAULT_WIDTH) {
      try {
        localStorage.setItem(STORAGE_KEY, String(panelWidth));
      } catch {}
    }
  }, [panelWidth]);

  const [isResizing, setIsResizing] = useState(false);
  const handleRef = useRef(null);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  // Combining artifacts with streaming artifact
  const allArtifacts = streamingArtifact
    ? [...artifacts, streamingArtifact]
    : artifacts;

  // Get the active artifact (last one)
  const activeArtifact =
    allArtifacts.length > 0 ? allArtifacts[allArtifacts.length - 1] : null;

  const clampWidth = useCallback(
    (w) => Math.min(Math.max(w, MIN_WIDTH), maxWidth),
    [maxWidth],
  );

  const handleFullscreenToggle = () => {
    if (onFullscreenToggle) onFullscreenToggle();
  };

  const handleCopy = () => {
    if (!activeArtifact) return;
    navigator.clipboard.writeText(activeArtifact);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!activeArtifact) return;
    const url = `data:text/html;charset=utf-8,${encodeURIComponent(activeArtifact)}`;
    await navigator.clipboard.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  /**
   * A drag locks the cursor and the text selection for the whole document, so
   * the release has to be unconditional: pointerup, pointercancel (a gesture
   * the browser takes over), a lost capture, and unmounting mid-drag. Missing
   * any of them leaves the page stuck showing a resize cursor with no resize
   * in progress.
   */
  const endResize = useCallback(() => {
    setIsResizing(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => endResize, [endResize]);

  const startResize = useCallback(
    (event) => {
      resizeStartX.current = event.clientX;
      resizeStartWidth.current = panelWidth;
      setIsResizing(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      // Pointer capture keeps the drag tracking once the pointer leaves the
      // handle, but it is an enhancement. Anything that throws here — a
      // browser without it, jsdom — must not take the gesture down with it and
      // leave the document locked into a resize cursor with no resize running.
      try {
        handleRef.current?.setPointerCapture(event.pointerId);
      } catch {}
    },
    [panelWidth],
  );

  const resizeTo = useCallback(
    (clientX) => {
      if (clientX == null) return;
      const deltaX = resizeStartX.current - clientX;
      setPanelWidth(clampWidth(resizeStartWidth.current + deltaX));
    },
    [clampWidth],
  );

  if (allArtifacts.length === 0) return null;

  return (
    <>
      {!isOpen ? (
        <div className="animate-hcai-fade-in">
          {/* Desktop toggle button */}
          <div className="hidden md:flex items-start pt-3 pr-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="Open artifact panel"
            >
              <PanelRightOpen className="w-4 h-4" />
            </Button>
          </div>
          {/* Mobile floating pill */}
          <div className="md:hidden fixed bottom-28 left-1/2 -translate-x-1/2 z-40">
            <button
              type="button"
              onClick={streamingArtifact ? undefined : onToggle}
              className={`rounded-full py-3 px-5 shadow-lg flex items-center gap-2.5 font-semibold text-[14px] transition-all active:scale-95 ${
                streamingArtifact
                  ? "bg-muted text-muted-foreground cursor-default"
                  : "bg-primary hover:bg-primary/90 active:bg-primary/80 text-primary-foreground shadow-lg cursor-pointer"
              }`}
            >
              <Puzzle
                className={`w-4 h-4 ${streamingArtifact ? "animate-pulse" : ""}`}
              />
              <span>
                {streamingArtifact
                  ? "Generating..."
                  : `Open Artifact${allArtifacts.length > 1 ? ` (${allArtifacts.length})` : ""}`}
              </span>
            </button>
          </div>
        </div>
      ) : (
        <div
          className="animate-hcai-fade-in flex flex-row h-full bg-background max-md:flex-col max-md:fixed max-md:inset-0 max-md:z-50 max-md:w-full"
          style={{
            // Until mounted, vw is 0 on both server and client so the markup
            // matches; after mount this reflects the real viewport.
            width: mounted && vw < 768 ? undefined : panelWidth,
          }}
        >
          {/* Resize handle - desktop only */}
          {/* biome-ignore lint/a11y/useSemanticElements: div needed for resize handle */}
          <div
            ref={handleRef}
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={panelWidth}
            aria-label="Resize artifact panel"
            tabIndex={0}
            className="hidden md:flex w-4 shrink-0 cursor-col-resize items-center justify-end border-none outline-none group"
            onPointerDown={startResize}
            onPointerMove={(event) => {
              if (isResizing) resizeTo(event.clientX);
            }}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            onLostPointerCapture={endResize}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                const step = event.shiftKey ? 50 : 10;
                const dir = event.key === "ArrowLeft" ? 1 : -1;
                setPanelWidth((w) => clampWidth(w + dir * step));
              }
            }}
          >
            <div
              className={`w-px h-full transition-all duration-150 ${
                isResizing
                  ? "w-[3px] bg-primary"
                  : "bg-border group-hover:w-[3px] group-hover:bg-primary/60"
              }`}
            />
          </div>

          {/* Panel content */}
          <div className="flex flex-col flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-border bg-background shrink-0">
              <div className="flex items-center gap-1 sm:gap-2">
                {fullscreen ? (
                  <Button
                    variant="ghost"
                    onClick={handleFullscreenToggle}
                    className="flex items-center gap-1.5 h-8 w-8 px-0 text-muted-foreground hover:text-foreground justify-center"
                    title="Exit fullscreen"
                  >
                    <X className="w-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={onToggle}
                    className="flex items-center gap-1.5 h-8 px-2 sm:px-1 text-muted-foreground hover:text-foreground"
                    title="Close"
                  >
                    <PanelRightClose className="w-4 h-4" />
                    <span className="text-[13px] font-medium sm:hidden">
                      Back
                    </span>
                  </Button>
                )}
                <div className="hidden sm:flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary shadow-sm" />
                  <span className="text-[11px] font-bold text-muted-foreground font-mono uppercase tracking-widest leading-none">
                    Artifact
                  </span>
                  {streamingArtifact && (
                    <span className="text-[10px] text-primary animate-pulse font-medium">
                      streaming...
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink min-w-0">
                <div className="flex bg-muted rounded-lg p-0.5 shrink min-w-0">
                  {[
                    { id: "preview", label: "Preview", Icon: Eye },
                    { id: "code", label: "Code", Icon: Code },
                  ].map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActiveTab(id)}
                      aria-pressed={activeTab === id}
                      className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-[12px] font-semibold rounded-md transition-colors ${
                        activeTab === id
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  ))}
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleShare}
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  title="Copy share URL"
                >
                  {shareCopied ? (
                    <Check className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <Share2 className="w-3.5 h-3.5" />
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopy}
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  title="Copy code"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleFullscreenToggle}
                  className="h-7 w-7 text-muted-foreground hover:text-foreground max-md:hidden"
                  title={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                >
                  {fullscreen ? (
                    <Minimize className="w-3.5 h-3.5" />
                  ) : (
                    <Expand className="w-3.5 h-3.5" />
                  )}
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden relative bg-background">
              {!activeArtifact ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  No artifact to display
                </div>
              ) : activeTab === "preview" ? (
                streamingArtifact ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
                    <ThinkingIndicator
                      label="Generating artifact"
                      size="lg"
                      className="text-primary"
                    />
                  </div>
                ) : (
                  <iframe
                    className="absolute inset-0 w-full h-full bg-background border-0"
                    title="Artifact Preview"
                    sandbox="allow-scripts"
                    srcDoc={activeArtifact}
                    onLoad={(event) => {
                      const doc = event.target.contentDocument;
                      if (doc?.body) {
                        doc.body.tabIndex = 0;
                        doc.body.style.margin = "0";
                        doc.body.focus();
                      }
                    }}
                  />
                )
              ) : (
                <div className="absolute inset-0 overflow-y-auto bg-background">
                  <div className="p-4 artifact-code min-w-0 overflow-x-auto">
                    <Markdown
                      mode={streamingArtifact ? "stream" : "static"}
                      streaming={!!streamingArtifact}
                      caret="block"
                    >{`\`\`\`html\n${activeArtifact}\n\`\`\``}</Markdown>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
