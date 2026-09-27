"use client";

import { Check, Key, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

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

export default function SidebarContent({
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
