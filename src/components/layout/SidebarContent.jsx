"use client";

import { Check, Key, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const LONG_PRESS_MS = 500;

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

function conversationText(conversation) {
  return [
    conversation.title,
    ...(conversation.messages || []).flatMap((msg) => [
      msg.content,
      msg._files,
    ]),
  ]
    .map(getSearchableText)
    .join(" ")
    .toLowerCase();
}

function filterConversations(conversations, searchQuery) {
  const query = searchQuery.trim().toLowerCase();
  if (!query) return conversations;
  return conversations.filter((conversation) =>
    conversationText(conversation).includes(query),
  );
}

function ConversationRow({
  conversation,
  active,
  editing,
  revealed,
  editTitle,
  onEditTitleChange,
  onSelect,
  onDelete,
  onStartRename,
  onCancelRename,
  onSaveRename,
  onReveal,
}) {
  const editInputRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (editing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editing]);

  // A sheet closing mid-press must not leave a timer armed on an unmounted row.
  useEffect(() => () => clearLongPress(), [clearLongPress]);

  const handleTouchStart = () => {
    clearLongPress();
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      onReveal(conversation.id);
    }, LONG_PRESS_MS);
  };

  const handleSelect = (event) => {
    if (longPressTriggeredRef.current) {
      event.preventDefault();
      longPressTriggeredRef.current = false;
      return;
    }
    onSelect();
  };

  const handleStartRename = () => {
    clearLongPress();
    longPressTriggeredRef.current = false;
    onStartRename();
  };

  const handleEditorKeyDown = (event) => {
    if (event.key === "Enter") {
      onSaveRename();
    } else if (event.key === "Escape") {
      onCancelRename();
    }
  };

  return (
    <li
      aria-current={active ? "true" : undefined}
      className={`group relative flex items-center rounded-lg h-9 pl-2.5 pr-1 ${
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
      }`}
      onTouchStart={handleTouchStart}
      onTouchEnd={clearLongPress}
      onTouchCancel={clearLongPress}
    >
      {editing ? (
        <>
          <input
            ref={editInputRef}
            type="text"
            value={editTitle}
            onChange={(event) => onEditTitleChange(event.target.value)}
            onKeyDown={handleEditorKeyDown}
            aria-label={`Rename ${conversation.title}`}
            className="flex-1 h-7 text-[13px] font-medium bg-background border border-border rounded px-2 focus:outline-none focus:ring-1 focus:ring-ring min-w-0"
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Save rename"
            onClick={onSaveRename}
            className="h-6 w-6 hover:bg-accent rounded"
          >
            <Check className="w-3 h-3 text-green-600" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Cancel rename"
            onClick={onCancelRename}
            className="h-6 w-6 hover:bg-accent rounded"
          >
            <X className="w-3 h-3 text-muted-foreground" />
          </Button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={handleSelect}
            className="flex-1 min-w-0 h-full text-left text-[13px] font-medium truncate bg-transparent border-none p-0 cursor-pointer"
          >
            {conversation.title}
          </button>
          <div
            className={`flex items-center gap-0.5 transition-opacity ${
              revealed
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
            }`}
          >
            <button
              type="button"
              aria-label="Rename"
              onClick={handleStartRename}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label="Delete"
              onClick={() => {
                longPressTriggeredRef.current = false;
                onDelete();
              }}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}
    </li>
  );
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

  const visibleConversations = filterConversations(conversations, searchQuery);

  const closeEditor = () => {
    setEditingId(null);
    setEditTitle("");
  };

  const handleSelect = (conversationId) => {
    // Picking another chat leaves the in-flight rename with nowhere to land.
    if (editingId && editingId !== conversationId) closeEditor();
    onSelectConversation(conversationId);
  };

  const handleStartRename = (conversation) => {
    setRevealedActionsId(null);
    setEditingId(conversation.id);
    setEditTitle(conversation.title);
  };

  const handleSaveRename = (conversationId) => {
    const title = editTitle.trim();
    if (title && onRenameConversation) {
      onRenameConversation(conversationId, title);
    }
    closeEditor();
  };

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
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            className="pl-8 pr-3 h-8 text-[13px] bg-background border border-border rounded-lg focus:ring-1 focus:ring-ring focus:border-ring"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3">
        <div className="text-[11px] font-bold text-muted-foreground px-2 mb-2 uppercase tracking-wider">
          History
        </div>

        {visibleConversations.length === 0 ? (
          <p className="px-2 py-6 text-center text-[13px] text-muted-foreground">
            {conversations.length === 0
              ? "No chats yet"
              : "No chats match your search"}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {visibleConversations.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                active={activeConversation === conversation.id}
                editing={editingId === conversation.id}
                revealed={revealedActionsId === conversation.id}
                editTitle={editTitle}
                onEditTitleChange={setEditTitle}
                onSelect={() => handleSelect(conversation.id)}
                onDelete={() => onDeleteConversation(conversation.id)}
                onStartRename={() => handleStartRename(conversation)}
                onCancelRename={closeEditor}
                onSaveRename={() => handleSaveRename(conversation.id)}
                onReveal={setRevealedActionsId}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="p-3">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground px-3 h-10 transition-colors rounded-lg"
          onClick={() => {
            onApiKeyClick();
            onSheetClose?.();
          }}
        >
          <Key className="w-4 h-4 opacity-70" />
          <span className="text-[13px] font-semibold">Settings</span>
        </Button>
      </div>
    </div>
  );
}
