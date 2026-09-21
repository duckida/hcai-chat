"use client";

import {
  Brain,
  Check,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Globe,
  Key,
  Menu,
  Pencil,
  Plus,
  Puzzle,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ContextUsage from "@/components/chat/ContextUsage";
import ModelPicker from "@/components/chat/ModelPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const SIDEBAR_WIDTH_KEY = "hcai_sidebar_width";
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 600;

function getSearchableText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => getSearchableText(part?.text ?? part?.content ?? part))
      .join(" ");
  }
  if (typeof value === "object") {
    return [value.name, value.title, value.text, value.content]
      .map(getSearchableText)
      .join(" ");
  }
  return String(value);
}

function SidebarContent({
  conversations,
  activeConversation,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  onNewChat,
  onApiKeyClick,
  searchQuery,
  onSearchChange,
  onSheetClose,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [revealedActionsId, setRevealedActionsId] = useState(null);
  const editInputRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);

  const effectiveSearchQuery = searchQuery;
  const setEffectiveSearchQuery = onSearchChange;

  const filteredConversations = conversations.filter((conv) => {
    if (!effectiveSearchQuery.trim()) return true;
    const query = effectiveSearchQuery.toLowerCase().trim();
    const searchable = [
      conv.title,
      ...(conv.messages || []).flatMap((msg) => [msg.content, msg._files]),
    ]
      .map(getSearchableText)
      .join(" ")
      .toLowerCase();

    return searchable.includes(query);
  });

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleStartRename = (conv) => {
    clearLongPressTimer();
    setRevealedActionsId(null);
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const handleCancelRename = () => {
    setEditingId(null);
    setEditTitle("");
  };

  const handleSaveRename = (convId) => {
    if (editTitle.trim() && onRenameConversation) {
      onRenameConversation(convId, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle("");
  };

  const handleKeyDown = (e, convId) => {
    if (e.key === "Enter") {
      handleSaveRename(convId);
    } else if (e.key === "Escape") {
      handleCancelRename();
    }
  };

  const handleTouchStart = (convId) => {
    clearLongPressTimer();
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setRevealedActionsId(convId);
    }, 500);
  };

  const handleTouchEnd = () => clearLongPressTimer();

  // Clear any in-flight long-press timer if the sheet closes mid-press.
  // biome-ignore lint/correctness/useExhaustiveDependencies: timer cleanup only
  useEffect(() => () => clearLongPressTimer(), []);

  return (
    <div className="flex flex-col h-full bg-muted">
      <div className="p-3 mb-2">
        <Button
          onClick={() => {
            onNewChat();
            onSheetClose?.();
          }}
          className="w-full justify-start gap-2 bg-background hover:bg-accent text-foreground border-none shadow-sm h-10 px-3 rounded-lg transition-all font-medium"
          variant="outline"
        >
          <Plus className="w-4 h-4" />
          <span className="text-[14px]">New Chat</span>
        </Button>
      </div>

      <div className="px-3 mb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search chats..."
            value={effectiveSearchQuery}
            onChange={(e) => setEffectiveSearchQuery(e.target.value)}
            className="pl-8 pr-3 h-8 text-[13px] bg-background border border-border rounded-lg focus:ring-1 focus:ring-ring focus:border-ring"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 px-3">
        <div className="space-y-0.5">
          <div className="text-[11px] font-bold text-muted-foreground px-2 mb-2 uppercase tracking-wider">
            History
          </div>
          {filteredConversations.map((conv) => {
            const isActive = activeConversation === conv.id;
            const isEditing = editingId === conv.id;

            return (
              <div
                key={conv.id}
                className={`group relative flex items-center rounded-lg h-9 pl-2.5 pr-1 ${
                  isActive
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
                onTouchStart={() => handleTouchStart(conv.id)}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
              >
                {isEditing ? (
                  <>
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, conv.id)}
                      className="flex-1 h-7 text-[13px] font-medium bg-background border border-border rounded px-2 focus:outline-none focus:ring-1 focus:ring-ring min-w-0"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleSaveRename(conv.id)}
                      className="h-6 w-6 hover:bg-accent rounded"
                    >
                      <Check className="w-3 h-3 text-green-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleCancelRename}
                      className="h-6 w-6 hover:bg-accent rounded"
                    >
                      <X className="w-3 h-3 text-muted-foreground" />
                    </Button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        if (longPressTriggeredRef.current) {
                          e.preventDefault();
                          longPressTriggeredRef.current = false;
                          return;
                        }
                        onSelectConversation(conv.id);
                      }}
                      className="flex-1 min-w-0 h-full text-left text-[13px] font-medium truncate bg-transparent border-none p-0 cursor-pointer"
                    >
                      {conv.title}
                    </button>
                    <div
                      className={`flex items-center gap-0.5 transition-opacity ${
                        revealedActionsId === conv.id
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                      }`}
                    >
                      <button
                        type="button"
                        aria-label="Rename"
                        onClick={(e) => {
                          e.stopPropagation();
                          longPressTriggeredRef.current = false;
                          handleStartRename(conv);
                        }}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          longPressTriggeredRef.current = false;
                          onDeleteConversation(conv.id);
                        }}
                        className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <div className="p-3">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground px-3 h-10 transition-colors rounded-lg"
          onClick={onApiKeyClick}
        >
          <Key className="w-4 h-4 opacity-70" />
          <span className="text-[13px] font-semibold">Settings</span>
        </Button>
      </div>
    </div>
  );
}

function ToggleButton({
  active,
  disabled,
  onClick,
  tooltip,
  children,
  activeClass,
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            onClick={onClick}
            className={`h-7 w-7 sm:h-8 sm:w-8 transition-colors ${
              disabled
                ? "opacity-40 cursor-not-allowed text-muted-foreground"
                : active
                  ? activeClass
                  : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
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
        <header className="h-12 sm:h-14 border-b border-border flex items-center justify-between gap-2 px-3 sm:px-4 bg-background/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="hidden md:flex h-8 w-8 text-muted-foreground hover:text-foreground transition-colors"
            >
              {sidebarOpen ? (
                <ChevronLeft className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </Button>
            <div className="md:hidden">
              <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Menu className="w-5 h-5 text-muted-foreground" />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="p-0 w-[260px] border-none"
                  showCloseButton={false}
                >
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  {sidebarContent}
                </SheetContent>
              </Sheet>
            </div>
          </div>

          <div className="flex-1 min-w-0 flex items-center justify-center gap-0.5 sm:gap-2">
            {!artifactFullscreen && (
              <>
                <div className="flex items-center gap-0.5 sm:gap-1">
                  <ToggleButton
                    active={thinkingEnabled}
                    onClick={() => onThinkingChange(!thinkingEnabled)}
                    tooltip={`Toggle thinking ${thinkingEnabled ? "off" : "on"}`}
                    activeClass="text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950"
                  >
                    <Brain className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </ToggleButton>

                  <ToggleButton
                    active={artifactsEnabled}
                    onClick={() => onArtifactsChange(!artifactsEnabled)}
                    tooltip={`Toggle artifacts ${artifactsEnabled ? "off" : "on"}`}
                    activeClass="text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950"
                  >
                    <Puzzle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </ToggleButton>

                  <ToggleButton
                    active={webSearchEnabled}
                    disabled={!toolsSupported}
                    onClick={() => onWebSearchChange(!webSearchEnabled)}
                    tooltip={
                      toolsSupported
                        ? `Toggle web search ${webSearchEnabled ? "off" : "on"}`
                        : "Not supported by current model"
                    }
                    activeClass="text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950"
                  >
                    <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </ToggleButton>

                  <ToggleButton
                    active={agentModeEnabled}
                    disabled={!toolsSupported || !hasE2bKey}
                    onClick={() => onAgentModeChange(!agentModeEnabled)}
                    tooltip={
                      !hasE2bKey
                        ? "Add your E2B API key in Settings to use cloud sandbox"
                        : toolsSupported
                          ? `Toggle cloud sandbox ${agentModeEnabled ? "off" : "on"}`
                          : "Not supported by current model"
                    }
                    activeClass="text-sky-500 bg-sky-50 dark:text-sky-400 dark:bg-sky-950"
                  >
                    <Cloud className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </ToggleButton>
                </div>

                <ModelPicker
                  groupedModels={groupedModels}
                  value={selectedModel}
                  onChange={onModelChange}
                />
              </>
            )}
          </div>

          {!artifactFullscreen && (
            <div className="flex items-center shrink-0">
              <ContextUsage
                used={contextUsage}
                max={contextWindowMap[selectedModel] || 0}
                totalCost={totalCost}
              />
            </div>
          )}
        </header>

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
