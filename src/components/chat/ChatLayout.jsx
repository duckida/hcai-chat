"use client";

import { useState, useEffect, useRef } from "react";
import {
  Menu,
  Plus,
  Trash2,
  Settings,
  MessageSquare,
  Key,
  ChevronLeft,
  ChevronRight,
  Brain,
  Puzzle,
  Search,
  Pencil,
  Check,
  X,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [localSearchQuery, setLocalSearchQuery] = useState("");
  const editInputRef = useRef(null);

  // Sync local search with parent if controlled
  const effectiveSearchQuery =
    onSearchChange !== undefined ? searchQuery : localSearchQuery;
  const setEffectiveSearchQuery =
    onSearchChange !== undefined ? onSearchChange : setLocalSearchQuery;

  // Filter conversations based on search query (title and messages)
  const filteredConversations = conversations.filter((conv) => {
    if (!effectiveSearchQuery.trim()) return true;
    const query = effectiveSearchQuery.toLowerCase().trim();
    // Search in title
    if (conv.title?.toLowerCase().includes(query)) return true;
    // Search in messages content
    if (
      conv.messages?.some((msg) => msg.content?.toLowerCase().includes(query))
    )
      return true;
    return false;
  });

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleStartRename = (conv) => {
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
              const [providerRaw] = model.id.split("/");
              const provider =
                providerRaw.charAt(0).toUpperCase() + providerRaw.slice(1);
              // Keep model name as it comes from hcai (e.g., qwen-3.6-flash)
              const name = model.id.split("/").pop();

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
      } catch (e) {}
    };
    fetchModels();
  }, []);

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-[#f9f9f9] border-r border-[#ececec]">
      <div className="p-3 mb-2">
        <Button
          onClick={() => {
            onNewChat();
            setMobileSheetOpen(false);
          }}
          className="w-full justify-start gap-2 bg-white hover:bg-[#f3f3f3] text-slate-900 border-none shadow-sm h-10 px-3 rounded-lg transition-all font-medium"
          variant="outline"
        >
          <Plus className="w-4 h-4" />
          <span className="text-[14px]">New Chat</span>
        </Button>
      </div>

      <div className="px-3 mb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <Input
            type="text"
            placeholder="Search chats..."
            value={effectiveSearchQuery}
            onChange={(e) => setEffectiveSearchQuery(e.target.value)}
            className="pl-8 pr-3 h-8 text-[13px] bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-300 focus:border-slate-300"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 px-3">
        <div className="space-y-0.5">
          <div className="text-[11px] font-bold text-slate-400 px-2 mb-2 uppercase tracking-wider">
            History
          </div>
          {filteredConversations.map((conv) => (
            <div key={conv.id} className="group relative">
              {editingId === conv.id ? (
                <div className="flex items-center gap-1 px-2 py-1">
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, conv.id)}
                    className="flex-1 h-7 text-[13px] font-medium bg-white border border-slate-300 rounded px-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleSaveRename(conv.id)}
                    className="h-6 w-6 hover:bg-slate-200 rounded"
                  >
                    <Check className="w-3 h-3 text-green-600" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCancelRename}
                    className="h-6 w-6 hover:bg-slate-200 rounded"
                  >
                    <X className="w-3 h-3 text-slate-500" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => onSelectConversation(conv.id)}
                  className={`w-full justify-start text-left h-9 pl-2.5 pr-14 rounded-lg group ${
                    activeConversation === conv.id
                      ? "bg-[#ececec] text-slate-900"
                      : "text-slate-600 hover:text-slate-900 hover:bg-[#ececec]/50"
                  }`}
                >
                  <span className="truncate text-[13px] font-medium block w-full">
                    {conv.title}
                  </span>
                </Button>
              )}
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center h-full gap-0.5">
                {editingId !== conv.id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartRename(conv);
                    }}
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-200 rounded-md"
                  >
                    <Pencil className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteConversation(conv.id);
                  }}
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-200 rounded-md"
                >
                  <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-3">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-slate-500 hover:text-slate-900 px-3 h-10 transition-colors rounded-lg"
          onClick={onApiKeyClick}
        >
          <Key className="w-4 h-4 opacity-70" />
          <span className="text-[13px] font-semibold">Settings</span>
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-white text-slate-900 overflow-hidden font-sans antialiased selection:bg-slate-200">
      <aside
        className={`hidden md:block transition-all duration-300 ease-in-out shrink-0 overflow-hidden ${sidebarOpen ? "w-[260px]" : "w-0"}`}
      >
        <SidebarContent />
      </aside>

      <div className="flex-1 flex flex-col min-w-0 relative">
        <header className="h-12 sm:h-14 border-b border-[#ececec] flex items-center justify-between px-3 sm:px-4 bg-white/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="hidden md:flex h-8 w-8 text-slate-400 hover:text-slate-900 transition-colors"
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
                    <Menu className="w-5 h-5 text-slate-500" />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="p-0 w-[260px] border-none"
                  showCloseButton={false}
                >
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
                          className={`h-7 w-7 sm:h-8 sm:w-8 transition-colors ${thinkingEnabled ? "text-blue-600 bg-blue-50" : "text-slate-400 hover:text-slate-900"}`}
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
                              ? "text-purple-600 bg-purple-50"
                              : webSearchEnabled
                                ? "text-slate-300 cursor-not-allowed"
                                : "text-slate-400 hover:text-slate-900"
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
                              ? "text-green-600 bg-green-50"
                              : artifactsEnabled
                                ? "text-slate-300 cursor-not-allowed"
                                : "text-slate-400 hover:text-slate-900"
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

                <Select value={selectedModel} onValueChange={onModelChange}>
                  <SelectTrigger className="w-auto min-w-[100px] sm:min-w-[140px] border-none shadow-none hover:bg-slate-100 transition-colors focus:ring-0 font-bold text-[12px] sm:text-[14px] text-slate-800 bg-transparent gap-0.5 sm:gap-2 h-7 sm:h-9 px-1.5 sm:px-3 rounded-xl">
                    <SelectValue placeholder="Model" />
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    sideOffset={5}
                    className="border-[#ececec] shadow-2xl rounded-2xl p-1 min-w-[220px] bg-white z-[100]"
                  >
                    <ScrollArea className="h-[400px]">
                      {Object.entries(groupedModels).length > 0 ? (
                        Object.entries(groupedModels).map(
                          ([provider, models]) => (
                            <SelectGroup key={provider}>
                              <SelectLabel className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-8 py-2 bg-slate-50/50">
                                {provider}
                              </SelectLabel>
                              {models.map((m) => (
                                <SelectItem
                                  key={m.id}
                                  value={m.id}
                                  className="text-[13px] transition-colors rounded-lg py-2.5 px-4 focus:bg-slate-100 cursor-pointer"
                                >
                                  {m.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ),
                        )
                      ) : (
                        <div className="p-4 text-xs text-center text-slate-400 font-medium">
                          Loading models...
                        </div>
                      )}
                    </ScrollArea>
                  </SelectContent>
                </Select>
              </>
            )}
          </div>

          <div className="w-8 hidden sm:block" />
        </header>

        <main className="flex-1 overflow-hidden relative flex flex-col">
          {children}
        </main>
      </div>

      {!artifactFullscreen && rightPanel}

      {artifactFullscreen && (
        <div className="fixed inset-0 z-[100] bg-white">{rightPanel}</div>
      )}
    </div>
  );
}
