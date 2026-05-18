"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { cjk } from "@streamdown/cjk";
import {
  Code,
  Eye,
  Copy,
  Check,
  PanelRightClose,
  PanelRightOpen,
  Puzzle,
  GripVertical,
  Expand,
  Minimize,
  X,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const CustomLink = ({ href, children }) => {
  const isExternal = href.startsWith("http");
  return (
    <a
      href={href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
      className="text-blue-600 hover:text-blue-800 underline underline-offset-4 decoration-blue-300 hover:decoration-blue-600 transition-colors inline-flex items-center gap-1"
    >
      {children}
      {isExternal && <ExternalLink className="w-3 h-3 shrink-0" />}
    </a>
  );
};

const streamdownPlugins = { code, math, mermaid, cjk };
const streamdownComponents = { a: CustomLink };

const MIN_WIDTH = 320;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 480;

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
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const iframeRef = useRef(null);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  const handleFullscreenToggle = () => {
    if (onFullscreenToggle) onFullscreenToggle();
  };

  // Combine artifacts with streaming artifact
  const allArtifacts = streamingArtifact
    ? [...artifacts, streamingArtifact]
    : artifacts;

  // Get the active artifact (last one)
  const activeArtifact =
    allArtifacts.length > 0 ? allArtifacts[allArtifacts.length - 1] : null;

  // Handle mouse move for resizing
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;

      const deltaX = resizeStartX.current - e.clientX;
      const newWidth = Math.min(
        Math.max(resizeStartWidth.current + deltaX, MIN_WIDTH),
        MAX_WIDTH,
      );
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  const startResize = useCallback(
    (e) => {
      e.preventDefault();
      resizeStartX.current = e.clientX;
      resizeStartWidth.current = panelWidth;
      setIsResizing(true);
    },
    [panelWidth],
  );

  const handleCopy = () => {
    if (!activeArtifact) return;
    navigator.clipboard.writeText(activeArtifact);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (allArtifacts.length === 0) return null;

  return (
    <AnimatePresence mode="wait">
      {!isOpen ? (
        <motion.div
          key="toggle"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2 }}
        >
          {/* Desktop toggle button */}
          <div className="hidden md:flex items-start pt-3 pr-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className="h-8 w-8 text-slate-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
              title="Open artifact panel"
            >
              <PanelRightOpen className="w-4 h-4" />
            </Button>
          </div>
          {/* Mobile floating pill */}
          <div className="md:hidden fixed bottom-28 left-1/2 -translate-x-1/2 z-40">
            <button
              onClick={streamingArtifact ? undefined : onToggle}
              className={`rounded-full py-3 px-5 shadow-lg flex items-center gap-2.5 font-semibold text-[14px] transition-all active:scale-95 ${
                streamingArtifact
                  ? "bg-slate-200 text-slate-500 cursor-default"
                  : "bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white shadow-purple-600/30 cursor-pointer"
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
        </motion.div>
      ) : (
        <motion.div
          key="panel"
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 50 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="flex flex-row h-full bg-white max-md:flex-col max-md:fixed max-md:inset-0 max-md:z-50"
          style={{ width: fullscreen ? "100%" : panelWidth }}
        >
          {/* Resize handle - desktop only */}
          <div
            className={`hidden md:flex w-1 shrink-0 cursor-col-resize items-center justify-center hover:bg-purple-200 transition-colors ${isResizing ? "bg-purple-500" : ""}`}
            onMouseDown={startResize}
          >
            <div
              className={`w-0.5 h-8 rounded-full ${isResizing ? "bg-purple-500" : "bg-slate-300"}`}
            ></div>
          </div>

          {/* Panel content */}
          <div className="flex flex-col flex-1 min-w-0 border-l border-[#ececec]">
            {/* Header */}
            <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[#ececec] bg-[#fdfdfd] shrink-0">
              <div className="flex items-center gap-1 sm:gap-2">
                {fullscreen ? (
                  <Button
                    variant="ghost"
                    onClick={handleFullscreenToggle}
                    className="flex items-center gap-1.5 h-8 w-8 px-0 text-slate-600 hover:text-slate-900 justify-center"
                    title="Exit fullscreen"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={onToggle}
                    className="flex items-center gap-1.5 h-8 px-2 sm:px-1 text-slate-600 hover:text-slate-900"
                    title="Close"
                  >
                    <PanelRightClose className="w-4 h-4" />
                    <span className="text-[13px] font-medium sm:hidden">
                      Back
                    </span>
                  </Button>
                )}
                <div className="hidden sm:flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary shadow-sm"></div>
                  <span className="text-[11px] font-bold text-slate-400 font-mono uppercase tracking-widest leading-none">
                    Artifact
                  </span>
                  {streamingArtifact && (
                    <span className="text-[10px] text-primary animate-pulse font-medium">
                      streaming...
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <div className="flex bg-slate-100 rounded-lg p-0.5 mr-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab("preview")}
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-[12px] font-semibold rounded-md transition-all ${
                      activeTab === "preview"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <Eye className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    <span className="hidden sm:inline">Preview</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("code")}
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-[12px] font-semibold rounded-md transition-all ${
                      activeTab === "code"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <Code className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    <span className="hidden sm:inline">Code</span>
                  </button>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopy}
                  className="h-7 w-7 text-slate-400 hover:text-slate-700"
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
                  className="h-7 w-7 text-slate-400 hover:text-slate-700"
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
            <div className="flex-1 overflow-hidden relative bg-[#fdfdfd]">
              {!activeArtifact ? (
                <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                  No artifact to display
                </div>
              ) : activeTab === "preview" ? (
                streamingArtifact ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <div className="text-sm font-medium animate-pulse text-primary">
                      Generating artifact...
                    </div>
                  </div>
                ) : (
                  <iframe
                    ref={iframeRef}
                    className="absolute inset-0 w-full h-full bg-white border-0"
                    title="Artifact Preview"
                    sandbox="allow-scripts"
                    srcDoc={activeArtifact}
                    onLoad={(e) => {
                      const doc = e.target.contentDocument;
                      if (doc && doc.body) {
                        doc.body.tabIndex = 0;
                        doc.body.style.margin = "0";
                        doc.body.focus();
                      }
                    }}
                  />
                )
              ) : (
                <div className="absolute inset-0 overflow-y-auto bg-[#fdfdfd]">
                  <div className="p-4 artifact-code min-w-0">
                    <Streamdown
                      mode={streamingArtifact ? "stream" : "static"}
                      caret={streamingArtifact ? "block" : false}
                      isAnimating={!!streamingArtifact}
                      plugins={streamdownPlugins}
                      components={streamdownComponents}
                    >
                      {`\`\`\`html\n${activeArtifact}\n\`\`\``}
                    </Streamdown>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
