"use client";

import { useEffect } from "react";
import {
  deleteConversation as deleteConversationFromDb,
  getAllConversations,
  putConversation,
  saveAllConversations,
} from "@/lib/db";
import { createStore, useStore } from "@/lib/store";
import { settingsStore } from "@/stores/settings";

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch {}
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const initialState = {
  conversations: [],
  activeConversation: null,
  messages: [],
  hydrated: false,
};

export const conversationsStore = createStore(initialState);

/**
 * The stream loop reads these in the same tick it mutates state — usage
 * attribution and patch writes fire inside the loop, long before any render
 * could catch up. Every commit mirrors them synchronously, so the send path
 * can never observe the previous conversation's messages.
 */
export const conversationsRef = { current: [] };
export const messagesRef = { current: [] };
export const activeConversationRef = { current: null };

function commit(partial) {
  conversationsStore.setState(partial);
  const next = conversationsStore.getState();
  conversationsRef.current = next.conversations;
  messagesRef.current = next.messages;
  activeConversationRef.current = next.activeConversation;
}

function activate(conversation) {
  commit({
    activeConversation: conversation?.id ?? null,
    messages: conversation?.messages || [],
  });
}

let hydration = null;

/**
 * Load from IndexedDB once, migrating legacy localStorage conversations on
 * the way. Guarded by both an in-flight promise and the hydrated flag so
 * every mount can call it safely.
 */
export function hydrateConversations() {
  if (hydration) return hydration;
  if (conversationsStore.getState().hydrated) return Promise.resolve();

  hydration = (async () => {
    let convs = [];
    try {
      convs = await getAllConversations();
    } catch {}

    if (convs.length === 0) {
      let legacy = null;
      try {
        const stored = localStorage.getItem("conversations");
        if (stored) legacy = JSON.parse(stored);
      } catch {}
      if (legacy) {
        convs = legacy;
        try {
          localStorage.removeItem("conversations");
          // Migration is the one legitimate full-write path.
          saveAllConversations(convs).catch(() => {});
        } catch {}
      }
    }

    const first = convs[0];
    commit({
      conversations: convs,
      activeConversation: first?.id ?? null,
      messages: first?.messages || [],
      hydrated: true,
    });
  })();

  return hydration;
}

export function resetConversations() {
  hydration = null;
  conversationsStore.setState({ ...initialState });
  const next = conversationsStore.getState();
  conversationsRef.current = next.conversations;
  messagesRef.current = next.messages;
  activeConversationRef.current = next.activeConversation;
}

export const conversationsActions = {
  setMessages(next) {
    const value =
      typeof next === "function"
        ? next(conversationsStore.getState().messages)
        : next;
    commit({ messages: value });
  },

  /**
   * Patch one conversation. Both the list and the write derive from a value
   * computed outside any updater — updaters may be deferred or re-run.
   */
  patchConversation(id, patch) {
    if (!id) return;
    const current = conversationsStore.getState().conversations;
    const existing = current.find((c) => c.id === id);
    if (!existing) return;
    const updated = { ...existing, ...patch };
    commit({ conversations: current.map((c) => (c.id === id ? updated : c)) });
    putConversation(updated).catch(() => {});
  },

  newConversation(overrides = {}) {
    const conversation = {
      id: createId(),
      title: "New Chat",
      createdAt: new Date().toISOString(),
      messages: [],
      artifactPanelOpen: false,
      model: settingsStore.getState().selectedModel,
      contextUsage: 0,
      ...overrides,
    };
    commit({
      conversations: [
        conversation,
        ...conversationsStore.getState().conversations,
      ],
      activeConversation: conversation.id,
      messages: conversation.messages,
    });
    putConversation(conversation).catch(() => {});
    return conversation;
  },

  selectConversation(id) {
    const conversation = conversationsStore
      .getState()
      .conversations.find((c) => c.id === id);
    if (!conversation) return;
    activate(conversation);
  },

  deleteConversation(id) {
    const state = conversationsStore.getState();
    const filtered = state.conversations.filter((c) => c.id !== id);

    // Follow the deletion only when it took the conversation on screen.
    // Deleting a background row used to yank the view to a different chat.
    if (state.activeConversation === id) {
      const replacement = filtered[0];
      commit({
        conversations: filtered,
        activeConversation: replacement?.id ?? null,
        messages: replacement?.messages || [],
      });
    } else {
      commit({ conversations: filtered });
    }

    deleteConversationFromDb(id).catch(() => {});
  },

  renameConversation(id, title) {
    const trimmed = title?.trim();
    if (!trimmed) return;
    conversationsActions.patchConversation(id, { title: trimmed });
  },

  setConversationModel(model) {
    conversationsActions.patchConversation(activeConversationRef.current, {
      model,
    });
  },
};

export function useConversations() {
  const state = useStore(conversationsStore);

  useEffect(() => {
    hydrateConversations();
  }, []);

  return {
    ...state,
    ...conversationsActions,
    conversationsRef,
    messagesRef,
    activeConversationRef,
  };
}
