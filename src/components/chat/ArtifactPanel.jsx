"use client";

import { useState, useRef, useCallback, useEffect } from "react";
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

  // Only show toggle if there's something to display
  if (!isOpen) {
    if (allArtifacts.length === 0) return null;

    return (
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
    );
  }

  return (
    <div
      className="flex h-full bg-white"
      style={{ width: fullscreen ? "100%" : panelWidth }}
    >
      {/* Resize handle */}
      <div
        className={`w-1 h-full cursor-col-resize flex items-center justify-center hover:bg-purple-200 transition-colors ${isResizing ? "bg-purple-500" : ""}`}
        onMouseDown={startResize}
      >
        <div
          className={`w-0.5 h-8 rounded-full ${isResizing ? "bg-purple-500" : "bg-slate-300"}`}
        ></div>
      </div>

      {/* Panel content */}
      <div className="flex flex-col flex-1 min-w-0 border-l border-[#ececec]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#ececec] bg-[#fdfdfd] shrink-0">
          <div className="flex items-center gap-2.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className="h-7 w-7 text-slate-400 hover:text-slate-700"
            >
              <PanelRightClose className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]"></div>
              <span className="text-[11px] font-bold text-slate-400 font-mono uppercase tracking-widest leading-none">
                Artifact
              </span>
              {streamingArtifact && (
                <span className="text-[10px] text-purple-500 animate-pulse font-medium">
                  streaming...
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <div className="flex bg-slate-100 rounded-lg p-0.5 mr-1">
              <button
                onClick={() => setActiveTab("preview")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-md transition-all ${
                  activeTab === "preview"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Preview
              </button>
              <button
                onClick={() => setActiveTab("code")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-md transition-all ${
                  activeTab === "code"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Code className="w-3.5 h-3.5" />
                Code
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
        <div className="flex-1 overflow-hidden relative">
          {!activeArtifact ? (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              No artifact to display
            </div>
          ) : activeTab === "preview" ? (
            <iframe
              ref={iframeRef}
              className="w-full h-full bg-white"
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
          ) : (
            <ScrollArea className="h-full">
              <div className="p-4">
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
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}
