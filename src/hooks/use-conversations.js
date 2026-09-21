"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteConversation as deleteConversationFromDb,
  getAllConversations,
  putConversation,
  saveAllConversations,
} from "@/lib/db";

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch {}
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Conversation store: list, active conversation, messages, and CRUD.
 *
 * Persistence is incremental — a changed conversation is written with
 * putConversation and a deleted one with deleteConversation — so a large
 * history is no longer cleared and rewritten on every keystroke-scale
 * change. The full-save path remains only for the one-time migration from
 * legacy localStorage storage.
 *
 * `messagesRef.current` is assigned synchronously wherever messages are
 * reset, so a send started on a fresh chat can never replay the previous
 * chat's messages.
 */
export function useConversations({ selectedModel, onActivate } = {}) {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  const conversationsRef = useRef(conversations);
  const messagesRef = useRef(messages);
  const activeConversationRef = useRef(activeConversation);
  const onActivateRef = useRef(onActivate);

  useEffect(() => {
    onActivateRef.current = onActivate;
  }, [onActivate]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  // Keep IndexedDB in sync with the in-memory list without rewriting the
  // whole store on every change.
  const persistConversation = useCallback((conversation) => {
    putConversation(conversation).catch(() => {});
  }, []);

  /**
   * Apply a patch to one conversation: update the in-memory list and
   * persist the result. Both derive from a value computed outside the
   * updater — React 19 may defer or re-run updaters, so the DB write must
   * never depend on an assignment made inside one.
   */
  const patchConversation = useCallback((id, patch) => {
    if (!id) return;
    const existing = conversationsRef.current.find((c) => c.id === id);
    if (!existing) return;
    const updated = { ...existing, ...patch };
    setConversations((prev) =>
      prev.map((conv) => (conv.id === id ? updated : conv)),
    );
    putConversation(updated).catch(() => {});
  }, []);

  const setActive = useCallback((conversation) => {
    setActiveConversation(conversation.id);
    setMessages(conversation.messages || []);
    messagesRef.current = conversation.messages || [];
    activeConversationRef.current = conversation.id;
    onActivateRef.current?.(conversation);
  }, []);

  // Load on mount, migrating from legacy localStorage storage once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let convs = [];
      try {
        convs = await getAllConversations();
      } catch {}
      if (convs.length === 0) {
        const stored = localStorage.getItem("conversations");
        if (stored) {
          try {
            convs = JSON.parse(stored);
            localStorage.removeItem("conversations");
            // Migration is the one legitimate full-write path.
            saveAllConversations(convs).catch(() => {});
          } catch {}
        }
      }
      if (cancelled) return;
      setConversations(convs);
      if (convs.length > 0) setActive(convs[0]);
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [setActive]);

  const newConversation = useCallback(
    (overrides = {}) => {
      const id = createId();
      const conversation = {
        id,
        title: "New Chat",
        createdAt: new Date().toISOString(),
        messages: [],
        artifactPanelOpen: false,
        model: selectedModel,
        contextUsage: 0,
        ...overrides,
      };
      setConversations((prev) => [conversation, ...prev]);
      // Sync the ref eagerly: stream callbacks (usage attribution, patch
      // writes) fire synchronously inside the stream loop, before the ref
      // effect that would otherwise catch up on the next render.
      conversationsRef.current = [conversation, ...conversationsRef.current];
      setActive(conversation);
      persistConversation(conversation);
      return conversation;
    },
    [selectedModel, setActive, persistConversation],
  );

  const selectConversation = useCallback(
    (id) => {
      const conversation = conversationsRef.current.find((c) => c.id === id);
      if (!conversation) return;
      setActive(conversation);
    },
    [setActive],
  );

  const deleteConversation = useCallback(
    (id) => {
      // Compute the post-delete list from committed state, then update
      // outside any updater — React 19 may double-invoke updaters, so
      // dependent state transitions must not live inside one.
      const filtered = conversationsRef.current.filter((c) => c.id !== id);
      setConversations(filtered);

      const replacement = filtered[0];
      if (replacement) setActive(replacement);
      else setActive({ id: null, messages: [] });

      deleteConversationFromDb(id).catch(() => {});
    },
    [setActive],
  );

  const renameConversation = useCallback(
    (id, title) => {
      const trimmed = title?.trim();
      if (!trimmed) return;
      patchConversation(id, { title: trimmed });
    },
    [patchConversation],
  );

  const setConversationModel = useCallback(
    (model) => patchConversation(activeConversationRef.current, { model }),
    [patchConversation],
  );

  const replaceConversations = useCallback(
    (convs) => {
      setConversations(convs);
      if (convs.length > 0 && !activeConversationRef.current) {
        setActive(convs[0]);
      }
    },
    [setActive],
  );

  return {
    conversations,
    activeConversation,
    messages,
    hydrated,
    setMessages,
    newConversation,
    selectConversation,
    deleteConversation,
    renameConversation,
    setConversationModel,
    replaceConversations,
    patchConversation,
    setActiveConversation,
    conversationsRef,
    messagesRef,
    activeConversationRef,
  };
}
