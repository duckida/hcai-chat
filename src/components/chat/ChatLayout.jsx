"use client";

import {
  Brain,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import ThemeToggle from "./ThemeToggle";

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
  onApiKeyClick,
  rightPanel,
  children,
  artifactFullscreen = false,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [groupedModels, setGroupedModels] = useState({});
  const [expandedProvider, setExpandedProvider] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [localSearchQuery, setLocalSearchQuery] = useState("");
  const [revealedActionsId, setRevealedActionsId] = useState(null);
  const editInputRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);

  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef(false);

  const handleMouseDown = (e) => {
    e.preventDefault();
    dragRef.current = true;
    setIsDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (e) => {
      if (!dragRef.current) return;
      const newWidth = Math.max(200, Math.min(600, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      dragRef.current = false;
      setIsDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Sync local search with parent if controlled
  const effectiveSearchQuery =
    onSearchChange !== undefined ? searchQuery : localSearchQuery;
  const setEffectiveSearchQuery =
    onSearchChange !== undefined ? onSearchChange : setLocalSearchQuery;

  const getSearchableText = (value) => {
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
  };

  // Filter conversations based on search query (title, messages, and files)
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

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

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

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
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

  const handleTouchEnd = () => {
    clearLongPressTimer();
  };

  useEffect(
    () => () => {
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
      }
    },
    [],
  );

  const handleKeyDown = (e, convId) => {
    if (e.key === "Enter") {
      handleSaveRename(convId);
    } else if (e.key === "Escape") {
      handleCancelRename();
    }
  };

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch("/api/models");
        if (response.ok) {
          const data = await response.json();
          if (data.data && Array.isArray(data.data)) {
            // Remove duplicates and group by provider
            const uniqueModels = Array.from(
              new Map(data.data.map((m) => [m.id, m])).values(),
            );

            const grouped = uniqueModels.reduce((acc, model) => {
              let provider, name;
              if (model.name?.includes(":")) {
                const parts = model.name.split(":");
                provider = parts[0].trim();
                name = parts.slice(1).join(":").trim();
              } else {
                const [providerRaw] = model.id.split("/");
                provider =
                  providerRaw.charAt(0).toUpperCase() + providerRaw.slice(1);
                name = model.name || model.id.split("/").pop();
              }

              if (!acc[provider]) acc[provider] = [];
              acc[provider].push({ id: model.id, name });
              return acc;
            }, {});

            // Sort providers and their models
            const sortedGrouped = {};
            Object.keys(grouped)
              .sort()
              .forEach((provider) => {
                sortedGrouped[provider] = grouped[provider].sort((a, b) =>
                  a.name.localeCompare(b.name),
                );
              });

            setGroupedModels(sortedGrouped);
          }
        }
      } catch (_e) {}
    };
    fetchModels();
  }, []);

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-muted">
      <div className="p-3 mb-2">
        <Button
          onClick={() => {
            onNewChat();
            setMobileSheetOpen(false);
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
            const actionsRevealed = revealedActionsId === conv.id;

            return (
              <div key={conv.id} className="group relative">
                {editingId === conv.id ? (
                  <div className="flex items-center gap-1 px-2 py-1">
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, conv.id)}
                      className="flex-1 h-7 text-[13px] font-medium bg-background border border-border rounded px-2 focus:outline-none focus:ring-1 focus:ring-ring"
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
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={(e) => {
                      if (longPressTriggeredRef.current) {
                        e.preventDefault();
                        longPressTriggeredRef.current = false;
                        return;
                      }
                      setRevealedActionsId(null);
                      onSelectConversation(conv.id);
                    }}
                    onTouchStart={() => handleTouchStart(conv.id)}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchEnd}
                    className={`w-full justify-start text-left h-9 pl-2.5 pr-14 rounded-lg group ${
                      activeConversation === conv.id
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    }`}
                  >
                    <span className="truncate text-[13px] font-medium block flex-1 text-left min-w-0">
                      {conv.title}
                    </span>
                  </Button>
                )}
                <div
                  className={`absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 z-10 transition-opacity ${
                    actionsRevealed
                      ? "opacity-100 pointer-events-auto"
                      : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto"
                  }`}
                >
                  {editingId !== conv.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        longPressTriggeredRef.current = false;
                        handleStartRename(conv);
                      }}
                      className="h-7 w-7 hover:bg-accent rounded-md"
                    >
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      longPressTriggeredRef.current = false;
                      setRevealedActionsId(null);
                      onDeleteConversation(conv.id);
                    }}
                    className="h-7 w-7 hover:bg-accent rounded-md"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
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

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans antialiased selection:bg-accent">
      <aside
        className={`hidden md:block shrink-0 overflow-hidden relative border-r border-border bg-muted ${!isDragging ? "transition-all duration-300 ease-in-out" : ""}`}
        style={{ width: sidebarOpen ? `${sidebarWidth}px` : "0px" }}
      >
        <div className="w-full h-full flex flex-col min-w-[200px]">
          <SidebarContent />
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
        <header className="h-12 sm:h-14 border-b border-border flex items-center justify-between px-3 sm:px-4 bg-background/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-1 sm:gap-2">
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
                  <SidebarContent />
                </SheetContent>
              </Sheet>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center gap-0.5 sm:gap-2">
            {!artifactFullscreen && (
              <>
                <div className="flex items-center gap-0.5 sm:gap-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onThinkingChange(!thinkingEnabled)}
                          className={`h-7 w-7 sm:h-8 sm:w-8 transition-colors ${thinkingEnabled ? "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950" : "text-muted-foreground hover:text-foreground"}`}
                        >
                          <Brain className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">
                          Toggle thinking {thinkingEnabled ? "off" : "on"}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={webSearchEnabled}
                          onClick={() => onArtifactsChange(!artifactsEnabled)}
                          className={`h-7 w-7 sm:h-8 sm:w-8 transition-colors ${
                            artifactsEnabled
                              ? "text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950"
                              : webSearchEnabled
                                ? "text-muted-foreground/30 cursor-not-allowed"
                                : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Puzzle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">
                          {webSearchEnabled
                            ? "Disable web search to use artifacts"
                            : `Toggle artifacts ${artifactsEnabled ? "off" : "on"}`}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={artifactsEnabled}
                          onClick={() => onWebSearchChange(!webSearchEnabled)}
                          className={`h-7 w-7 sm:h-8 sm:w-8 transition-colors ${
                            webSearchEnabled
                              ? "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950"
                              : artifactsEnabled
                                ? "text-muted-foreground/30 cursor-not-allowed"
                                : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">
                          {artifactsEnabled
                            ? "Disable artifacts to use web search"
                            : `Toggle web search ${webSearchEnabled ? "off" : "on"}`}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center justify-between w-auto min-w-[100px] sm:min-w-[140px] border-none shadow-none hover:bg-accent transition-colors focus:ring-0 font-bold text-[12px] sm:text-[14px] text-foreground bg-transparent gap-0.5 sm:gap-2 h-7 sm:h-9 px-1.5 sm:px-3 rounded-xl"
                    >
                      <span className="truncate max-w-[150px] sm:max-w-[200px]">
                        {Object.values(groupedModels)
                          .flat()
                          .find((m) => m.id === selectedModel)?.name || "Model"}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="border-border shadow-2xl rounded-2xl p-1 min-w-[220px] bg-popover z-[100] max-h-[60vh] overflow-y-auto"
                  >
                    {Object.entries(groupedModels).length > 0 ? (
                      <>
                        <div className="hidden md:block">
                          {Object.entries(groupedModels).map(
                            ([provider, models]) => (
                              <DropdownMenuSub key={provider}>
                                <DropdownMenuSubTrigger className="text-[13px] transition-colors rounded-lg py-2.5 px-4 cursor-default">
                                  {provider}
                                </DropdownMenuSubTrigger>
                                <DropdownMenuPortal>
                                  <DropdownMenuSubContent className="border-border shadow-2xl rounded-2xl p-1 min-w-[220px] bg-popover z-[100] max-h-[60vh] overflow-y-auto">
                                    {models.map((m) => (
                                      <DropdownMenuItem
                                        key={m.id}
                                        onClick={() => onModelChange(m.id)}
                                        className="text-[13px] transition-colors rounded-lg py-2.5 px-4 cursor-pointer flex items-center justify-between"
                                      >
                                        <span>{m.name}</span>
                                        {selectedModel === m.id && (
                                          <Check className="h-4 w-4 ml-2" />
                                        )}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuSubContent>
                                </DropdownMenuPortal>
                              </DropdownMenuSub>
                            ),
                          )}
                        </div>
                        <div className="md:hidden">
                          {Object.entries(groupedModels).map(
                            ([provider, models]) => (
                              <div key={provider}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setExpandedProvider(
                                      expandedProvider === provider
                                        ? null
                                        : provider,
                                    );
                                  }}
                                  className="w-full flex items-center justify-between text-[13px] transition-colors rounded-lg py-2.5 px-4 cursor-pointer hover:bg-accent"
                                >
                                  <span className="font-medium">
                                    {provider}
                                  </span>
                                  <ChevronDown
                                    className={`h-3.5 w-3.5 opacity-50 transition-transform ${expandedProvider === provider ? "rotate-180" : ""}`}
                                  />
                                </button>
                                {expandedProvider === provider && (
                                  <div className="pb-1 pl-4">
                                    {models.map((m) => (
                                      <DropdownMenuItem
                                        key={m.id}
                                        onClick={() => onModelChange(m.id)}
                                        className="text-[12px] transition-colors rounded-lg py-2 px-3 cursor-pointer flex items-center justify-between"
                                      >
                                        <span>{m.name}</span>
                                        {selectedModel === m.id && (
                                          <Check className="h-3.5 w-3.5 ml-2" />
                                        )}
                                      </DropdownMenuItem>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ),
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="p-4 text-xs text-center text-muted-foreground font-medium">
                        Loading models...
                      </div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>

          <div className="w-8 hidden sm:flex items-center justify-end">
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 overflow-hidden relative flex flex-col">
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
