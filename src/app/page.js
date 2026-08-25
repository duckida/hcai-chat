"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import ArtifactPanel from "@/components/chat/ArtifactPanel";
import ChatInput from "@/components/chat/ChatInput";
import ChatLayout from "@/components/chat/ChatLayout";
import ImportDialog from "@/components/chat/ImportDialog";
import MessageList from "@/components/chat/MessageList";
import SettingsModal from "@/components/chat/SettingsModal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  generateTitle,
  getStoredApiKey,
  getStoredE2bApiKey,
  streamChatCompletion,
} from "@/lib/api-client";
import { extractHtmlArtifacts } from "@/lib/artifacts";
import { dataUrlToBlob, uploadFileToBucky } from "@/lib/bucky";
import { getAllConversations, saveAllConversations } from "@/lib/db";
import {
  exportAllToZip,
  generateExportFilename,
  triggerDownload,
} from "@/lib/import-export";
import { getTools, SANDBOX_TOOL_NAMES } from "@/lib/tools";

export default function Home({
  initialQuery = null,
  initialSearchEnabled = false,
} = {}) {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingThinking, setStreamingThinking] = useState("");
  const [selectedModel, setSelectedModel] = useState("xiaomi/mimo-v2.5");
  const [titleGenerationModel, setTitleGenerationModel] = useState(
    "qwen/qwen3-next-80b-a3b-instruct",
  );
  const [thinkingEnabled, setThinkingEnabled] = useState(true);
  const [artifactsEnabled, setArtifactsEnabled] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [agentModeEnabled, setAgentModeEnabled] = useState(false);
  const [artifactPanelOpen, setArtifactPanelOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [artifactFullscreen, setArtifactFullscreen] = useState(false);
  const [theme, setTheme] = useState("aurora");
  const [showThinking, setShowThinking] = useState(false);
  const [showSandboxCode, setShowSandboxCode] = useState(true);
  const [showSandboxOutput, setShowSandboxOutput] = useState(true);
  const [showMetrics, setShowMetrics] = useState(true);
  const [maxTokens, setMaxTokens] = useState(32000);
  const [streamingError, setStreamingError] = useState(null);
  const [contextUsage, setContextUsage] = useState(0);
  const [contextWindowMap, setContextWindowMap] = useState({});
  const [toolsSupportedMap, setToolsSupportedMap] = useState({});
  const [streamingSandboxTools, setStreamingSandboxTools] = useState([]);
  const [hasE2bKey, setHasE2bKey] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

  const isFirstMount = useRef(true);
  const isStreamingComplete = useRef(false);
  const isSubmittingRef = useRef(false);
  const activeUsageConversationRef = useRef(null);
  const lastUsageRef = useRef(null);
  const predictedOutputTokensRef = useRef(0);
  const conversationsRef = useRef(conversations);
  const messagesRef = useRef(messages);
  const activeConversationRef = useRef(activeConversation);
  const initialQueryRef = useRef(initialQuery);
  const initialSearchEnabledRef = useRef(initialSearchEnabled);
  const hasAutoSentRef = useRef(false);

  // Update refs when state changes
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  // Derive artifacts from persisted messages (only when artifacts mode is on)
  const messageArtifacts = useMemo(() => {
    if (!artifactsEnabled) return [];
    const allArtifacts = [];
    for (const msg of messages) {
      if (msg.role === "assistant") {
        const { artifacts } = extractHtmlArtifacts(msg.content);
        allArtifacts.push(...artifacts);
      }
    }
    return allArtifacts;
  }, [messages, artifactsEnabled]);

  // Derive total cost from persisted messages
  const computedTotalCost = useMemo(() => {
    let total = 0;
    for (const msg of messages) {
      if (msg.role === "assistant" && msg.metrics?.cost) {
        total += msg.metrics.cost;
      }
    }
    return total;
  }, [messages]);

  // Update total cost when messages change
  useEffect(() => {
    setTotalCost(computedTotalCost);
  }, [computedTotalCost]);

  // Derive streaming artifact from live streaming content (only when artifacts
  // mode is on — otherwise HTML fences are treated as plain chat text)
  const { streamingArtifact } = useMemo(() => {
    if (!artifactsEnabled || !streamingContent)
      return { streamingArtifact: null };
    return extractHtmlArtifacts(streamingContent);
  }, [streamingContent, artifactsEnabled]);

  // Save artifactPanelOpen to active conversation
  const saveArtifactPanelOpen = useCallback(
    (open) => {
      if (activeConversation) {
        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === activeConversation
              ? { ...conv, artifactPanelOpen: open }
              : conv,
          ),
        );
      }
    },
    [activeConversation],
  );

  const handleToggleArtifactPanel = useCallback(() => {
    setArtifactPanelOpen((prev) => {
      const next = !prev;
      saveArtifactPanelOpen(next);
      return next;
    });
  }, [saveArtifactPanelOpen]);

  useEffect(() => {
    (async () => {
      let convs = [];
      try {
        convs = await getAllConversations();
      } catch {}
      // Migrate from localStorage if IndexedDB is empty
      if (convs.length === 0) {
        const stored = localStorage.getItem("conversations");
        if (stored) {
          try {
            convs = JSON.parse(stored);
            localStorage.removeItem("conversations");
          } catch {}
        }
      }
      setConversations(convs);
      if (convs.length > 0 && isFirstMount.current) {
        setActiveConversation(convs[0].id);
        setMessages(convs[0].messages);
        setArtifactPanelOpen(convs[0].artifactPanelOpen ?? false);
        if (convs[0].model) {
          setSelectedModel(convs[0].model);
        }
        setContextUsage(convs[0].contextUsage || 0);
        lastUsageRef.current = {
          inputTokens: convs[0].contextUsage || 0,
          outputTokens: 0,
        };
      }
    })();

    const savedModel = localStorage.getItem("selected_model");
    if (savedModel) setSelectedModel(savedModel);

    setHasE2bKey(!!getStoredE2bApiKey());

    const savedTitleModel = localStorage.getItem("title_generation_model");
    if (savedTitleModel) setTitleGenerationModel(savedTitleModel);

    const savedThinking = localStorage.getItem("thinking_enabled");
    if (savedThinking) setThinkingEnabled(JSON.parse(savedThinking));

    const savedArtifacts = localStorage.getItem("artifacts_enabled");
    if (savedArtifacts) setArtifactsEnabled(JSON.parse(savedArtifacts));

    const savedWebSearch = localStorage.getItem("web_search_enabled");
    if (savedWebSearch) setWebSearchEnabled(JSON.parse(savedWebSearch));

    if (initialSearchEnabled) setWebSearchEnabled(true);

    const savedAgentMode = localStorage.getItem("agent_mode_enabled");
    if (savedAgentMode) setAgentModeEnabled(JSON.parse(savedAgentMode));

    const savedShowThinking = localStorage.getItem("show_thinking");
    if (savedShowThinking) setShowThinking(JSON.parse(savedShowThinking));

    const savedShowSandboxCode = localStorage.getItem("show_sandbox_code");
    if (savedShowSandboxCode !== null)
      setShowSandboxCode(JSON.parse(savedShowSandboxCode));

    const savedShowSandboxOutput = localStorage.getItem("show_sandbox_output");
    if (savedShowSandboxOutput !== null)
      setShowSandboxOutput(JSON.parse(savedShowSandboxOutput));

    const savedShowMetrics = localStorage.getItem("show_metrics");
    if (savedShowMetrics) setShowMetrics(JSON.parse(savedShowMetrics));

    const savedMaxTokens = localStorage.getItem("max_tokens");
    if (savedMaxTokens) setMaxTokens(JSON.parse(savedMaxTokens));

    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      setTheme(savedTheme);
      if (savedTheme === "sunrise") {
        document.documentElement.classList.add("theme-sunrise");
      } else if (savedTheme === "hackclub") {
        document.documentElement.classList.add("theme-hackclub");
      }
    } else {
      document.documentElement.classList.remove(
        "theme-sunrise",
        "theme-hackclub",
      );
    }

    if (!getStoredApiKey()) {
      setIsApiKeyModalOpen(true);
    }
    isFirstMount.current = false;
  }, [initialSearchEnabled]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/balance");
        if (!res.ok) return;
        const data = await res.json();
        if (
          typeof data?.balanceRemaining === "number" &&
          data.balanceRemaining < 0
        ) {
          setIsBalanceModalOpen(true);
        }
      } catch {}
    })();
  }, []);

  const saveTimerRef = useRef(null);

  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveAllConversations(conversations).catch(() => {});
    }, 500);
  }, [conversations]);

  useEffect(() => {
    localStorage.setItem("selected_model", selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    localStorage.setItem("title_generation_model", titleGenerationModel);
  }, [titleGenerationModel]);

  useEffect(() => {
    localStorage.setItem("thinking_enabled", JSON.stringify(thinkingEnabled));
  }, [thinkingEnabled]);

  useEffect(() => {
    localStorage.setItem("artifacts_enabled", JSON.stringify(artifactsEnabled));
    if (
      artifactsEnabled &&
      typeof window !== "undefined" &&
      window.innerWidth >= 768
    ) {
      setArtifactPanelOpen(true);
      saveArtifactPanelOpen(true);
    }
  }, [artifactsEnabled, saveArtifactPanelOpen]);

  useEffect(() => {
    localStorage.setItem(
      "web_search_enabled",
      JSON.stringify(webSearchEnabled),
    );
  }, [webSearchEnabled]);

  useEffect(() => {
    localStorage.setItem(
      "agent_mode_enabled",
      JSON.stringify(agentModeEnabled),
    );
  }, [agentModeEnabled]);

  const toolsSupported = toolsSupportedMap[selectedModel] ?? true;

  useEffect(() => {
    if (!toolsSupported) {
      if (webSearchEnabled) setWebSearchEnabled(false);
      if (agentModeEnabled) setAgentModeEnabled(false);
    }
  }, [toolsSupported, webSearchEnabled, agentModeEnabled]);

  useEffect(() => {
    localStorage.setItem("show_thinking", JSON.stringify(showThinking));
  }, [showThinking]);

  useEffect(() => {
    localStorage.setItem("show_sandbox_code", JSON.stringify(showSandboxCode));
  }, [showSandboxCode]);

  useEffect(() => {
    localStorage.setItem(
      "show_sandbox_output",
      JSON.stringify(showSandboxOutput),
    );
  }, [showSandboxOutput]);

  useEffect(() => {
    localStorage.setItem("show_metrics", JSON.stringify(showMetrics));
  }, [showMetrics]);

  useEffect(() => {
    localStorage.setItem("theme", theme);
    document.documentElement.classList.remove(
      "theme-sunrise",
      "theme-hackclub",
    );
    if (theme === "sunrise") {
      document.documentElement.classList.add("theme-sunrise");
    } else if (theme === "hackclub") {
      document.documentElement.classList.add("theme-hackclub");
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("max_tokens", JSON.stringify(maxTokens));
  }, [maxTokens]);

  const handleModelChange = useCallback(
    (model) => {
      setSelectedModel(model);
      if (activeConversation) {
        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === activeConversation ? { ...conv, model } : conv,
          ),
        );
      }
    },
    [activeConversation],
  );

  const handleNewChat = useCallback(() => {
    const isDesktop = typeof window !== "undefined" && window.innerWidth >= 768;
    const shouldOpen = artifactsEnabled && isDesktop;

    const newId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newConversation = {
      id: newId,
      title: "New Chat",
      createdAt: new Date().toISOString(),
      messages: [],
      artifactPanelOpen: shouldOpen,
      model: selectedModel,
      contextUsage: 0,
    };
    setConversations((prev) => [newConversation, ...prev]);
    setActiveConversation(newId);
    setMessages([]);
    setStreamingContent("");
    setStreamingThinking("");
    setStreamingError(null);
    setStreamingSandboxTools([]);
    setContextUsage(0);
    lastUsageRef.current = null;
    predictedOutputTokensRef.current = 0;
    setArtifactPanelOpen(shouldOpen);
  }, [artifactsEnabled, selectedModel]);

  const handleSelectConversation = useCallback(
    (id) => {
      setActiveConversation(id);
      const conversation = conversations.find((c) => c.id === id);
      setMessages(conversation?.messages || []);
      setArtifactPanelOpen(conversation?.artifactPanelOpen ?? false);
      if (conversation?.model) {
        setSelectedModel(conversation.model);
      }
      setStreamingContent("");
      setStreamingThinking("");
      setStreamingError(null);
      setStreamingSandboxTools([]);
      lastUsageRef.current = null;
      predictedOutputTokensRef.current = 0;
      setContextUsage(
        conversation?.messages?.length ? (conversation?.contextUsage ?? 0) : 0,
      );
      lastUsageRef.current = {
        inputTokens: conversation?.contextUsage || 0,
        outputTokens: 0,
      };
    },
    [conversations],
  );

  const handleDeleteConversation = useCallback(
    (id) => {
      const sandboxId =
        conversationsRef.current.find((c) => c.id === id)?.sandboxId || null;
      fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "destroy",
          conversationId: id,
          ...(sandboxId ? { sandboxId } : {}),
        }),
      }).catch(() => {});

      setConversations((prev) => {
        const filtered = prev.filter((c) => c.id !== id);
        if (activeConversation === id) {
          setStreamingSandboxTools([]);
          if (filtered.length > 0) {
            setActiveConversation(filtered[0].id);
            setMessages(filtered[0].messages);
          } else {
            setActiveConversation(null);
            setMessages([]);
          }
        }
        return filtered;
      });
    },
    [activeConversation],
  );

  const handleRenameConversation = useCallback((id, newTitle) => {
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === id ? { ...conv, title: newTitle } : conv,
      ),
    );
  }, []);

  const handleImport = useCallback(() => {
    setIsImportDialogOpen(true);
  }, []);

  const handleExportAll = useCallback(async () => {
    try {
      const blob = await exportAllToZip({
        includeChats: true,
        includeSettings: true,
      });
      triggerDownload(blob, generateExportFilename());
      toast.success("Export complete");
    } catch (error) {
      toast.error(`Export failed: ${error.message || "Unknown error"}`);
    }
  }, []);

  const handleImportComplete = useCallback(async (result) => {
    toast.success(
      `Imported ${result.chats.imported} conversation(s)` +
        (result.chats.replaced > 0
          ? `, replaced ${result.chats.replaced}`
          : "") +
        (result.settings ? " (settings imported)" : ""),
    );
    // Refresh conversations from DB
    try {
      const convs = await getAllConversations();
      setConversations(convs);
      if (convs.length > 0 && !activeConversationRef.current) {
        setActiveConversation(convs[0].id);
        setMessages(convs[0].messages);
      }
    } catch (error) {
      console.error("Failed to refresh conversations after import:", error);
    }
  }, []);

  const handleSendMessage = useCallback(
    async (content, files = []) => {
      if (!content.trim() && files.length === 0) return;

      if (isSubmittingRef.current) return;
      isSubmittingRef.current = true;

      // Check if this is an auto-send from URL params
      const isAutoSend =
        !hasAutoSentRef.current && initialQueryRef.current === content;
      if (isAutoSend) {
        hasAutoSentRef.current = true;
      }

      // Determine if we should use web search based on toggle or URL param
      const needsWebSearch = isAutoSend
        ? initialSearchEnabledRef.current
        : webSearchEnabled;

      const needsAgentMode = agentModeEnabled;

      if (needsAgentMode && !getStoredE2bApiKey()) {
        isSubmittingRef.current = false;
        toast.error("Add your E2B API key in Settings to use cloud sandbox.");
        return;
      }

      let currentId = activeConversationRef.current;
      if (!currentId) {
        const isDesktop =
          typeof window !== "undefined" && window.innerWidth >= 768;
        const shouldOpen = artifactsEnabled && isDesktop;

        const newId =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const newConversation = {
          id: newId,
          title: "New Chat",
          createdAt: new Date().toISOString(),
          messages: [],
          artifactPanelOpen: shouldOpen,
          model: selectedModel,
          contextUsage: 0,
        };
        setConversations((prev) => [newConversation, ...prev]);
        setActiveConversation(newId);
        setContextUsage(0);
        setArtifactPanelOpen(shouldOpen);
        currentId = newId;
      }

      // Track usage against the conversation this message belongs to, so
      // switching chats mid-stream doesn't attribute tokens to the wrong one.
      activeUsageConversationRef.current = currentId;
      predictedOutputTokensRef.current = 0;

      const e2bApiKey = getStoredE2bApiKey();
      const sandboxId =
        conversationsRef.current.find((c) => c.id === currentId)?.sandboxId ||
        null;

      // Upload files to bucky
      let fileUrls = [];
      if (files.length > 0) {
        const results = await Promise.allSettled(
          files.map(async (file) => {
            if (file.type.startsWith("image/") && file.dataUrl) {
              const blob = dataUrlToBlob(file.dataUrl);
              const uploadFile = new File([blob], file.name, {
                type: file.type,
              });
              return await uploadFileToBucky(uploadFile);
            }
            if (file.rawFile) return await uploadFileToBucky(file.rawFile);
            return null;
          }),
        );
        fileUrls = results.map((r) =>
          r.status === "fulfilled" ? r.value : null,
        );
      }

      let userMessage;
      if (files.length > 0) {
        const contentParts = [];
        if (content.trim()) {
          contentParts.push({ type: "text", text: content });
        }
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const buckyUrl = fileUrls[i];
          if (file.type.startsWith("image/")) {
            contentParts.push({
              type: "image",
              image: buckyUrl || file.dataUrl,
            });
          } else if (file.text) {
            contentParts.push({
              type: "text",
              text: `--- File: ${file.name} ---\n${file.text}\n---`,
              isFileAttachment: true,
            });
          } else if (buckyUrl) {
            contentParts.push({
              type: "file",
              data: buckyUrl,
              filename: file.name,
              mediaType: file.type,
            });
          }
        }
        userMessage = {
          role: "user",
          content: contentParts,
          _files: files.map((f, i) => ({
            id: f.id,
            name: f.name,
            type: f.type,
            size: f.size,
            url: fileUrls[i] || null,
          })),
        };
      } else {
        userMessage = { role: "user", content };
      }
      const updatedMessages = [...messagesRef.current, userMessage];
      setMessages(updatedMessages);
      setStreamingContent("");
      setStreamingThinking("");
      setStreamingError(null);
      setStreamingSandboxTools([]);
      setIsLoading(true);

      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === currentId ? { ...conv, messages: updatedMessages } : conv,
        ),
      );

      let fullResponse = "";
      let fullThinking = "";
      let sources = [];
      let metrics = null;
      const sandboxResults = [];
      isStreamingComplete.current = false;
      try {
        const tools = getTools({
          includeWebSearch: needsWebSearch,
          includeAgentTools: needsAgentMode,
          includeCalculator: toolsSupported,
        });

        const snapToActualUsage = () => {
          const actual = lastUsageRef.current;
          predictedOutputTokensRef.current = 0;
          if (!actual) return;
          const total = (actual.inputTokens || 0) + (actual.outputTokens || 0);
          if (activeConversationRef.current === currentId) {
            setContextUsage(total);
          }
          const usageFor = activeUsageConversationRef.current || currentId;
          if (usageFor) {
            setConversations((prev) =>
              prev.map((conv) =>
                conv.id === usageFor ? { ...conv, contextUsage: total } : conv,
              ),
            );
          }
        };

        const predictOutputTokens = (chars) => {
          // Rough heuristic: ~4 characters per token on average.
          return Math.max(0, Math.round((chars || 0) / 4));
        };

        const bumpPredictedUsage = (chars) => {
          if (chars <= 0) return;
          predictedOutputTokensRef.current += predictOutputTokens(chars);
          const inputBase = lastUsageRef.current?.inputTokens || 0;
          const outputBase = lastUsageRef.current?.outputTokens || 0;
          const total =
            inputBase + outputBase + predictedOutputTokensRef.current;
          if (activeConversationRef.current === currentId) {
            setContextUsage(total);
          }
        };

        const makeOnError = () => (error) => {
          isStreamingComplete.current = true;
          snapToActualUsage();
          setStreamingError({
            title: "API Error",
            details: `[${selectedModel}] ${error.message}`,
          });
          setIsLoading(false);
          setStreamingContent("");
          setStreamingThinking("");

          const errorMessage = {
            role: "assistant",
            content: "",
            error: { title: "API Error", details: error.message },
          };
          const finalMessages = [...updatedMessages, errorMessage];
          setMessages(finalMessages);
          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === currentId
                ? { ...conv, messages: finalMessages }
                : conv,
            ),
          );
        };

        const makeOnComplete = (includeSources) => async () => {
          if (isStreamingComplete.current) return;
          isStreamingComplete.current = true;

          if (!fullResponse && !fullThinking) {
            const errorMsg = {
              title: "API Error",
              details: `No response received from model "${selectedModel}". The model may be overloaded or unavailable.`,
            };
            setStreamingError(errorMsg);
            const errorMessage = {
              role: "assistant",
              content: "",
              error: errorMsg,
            };
            const finalMessages = [...updatedMessages, errorMessage];
            setStreamingContent("");
            setStreamingThinking("");
            setMessages(finalMessages);
            setIsLoading(false);
            setConversations((prev) =>
              prev.map((conv) =>
                conv.id === currentId
                  ? { ...conv, messages: finalMessages }
                  : conv,
              ),
            );
            return;
          }

          const assistantMessage = {
            role: "assistant",
            content: fullResponse,
            thinking: fullThinking || undefined,
            ...(includeSources
              ? {
                  sources: sources.length > 0 ? sources : undefined,
                  webSearch: true,
                }
              : {}),
            ...(sandboxResults.length > 0 ? { sandboxResults } : {}),
            metrics,
          };
          const finalMessages = [...updatedMessages, assistantMessage];

          setStreamingContent("");
          setStreamingThinking("");
          setMessages(finalMessages);
          setIsLoading(false);

          let titleUpdate = {};
          const currentConversation = conversationsRef.current.find(
            (c) => c.id === currentId,
          );
          if (
            currentConversation?.title === "New Chat" &&
            finalMessages.length === 2
          ) {
            const newTitle = await generateTitle(content, titleGenerationModel);
            titleUpdate = { title: newTitle };
          }

          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === currentId
                ? { ...conv, messages: finalMessages, ...titleUpdate }
                : conv,
            ),
          );
          snapToActualUsage();
        };

        const onChunk = (chunk, type) => {
          bumpPredictedUsage(chunk.length);
          if (type === "thinking") {
            fullThinking += chunk;
            setStreamingThinking(fullThinking);
          } else {
            fullResponse += chunk;
            setStreamingContent(fullResponse);
          }
        };

        const onToolCall = (call) => {
          if (call.arguments && !call.complete) {
            bumpPredictedUsage(call.arguments.length);
          }

          if (!needsAgentMode) return;

          if (call.name && SANDBOX_TOOL_NAMES.includes(call.name)) {
            setStreamingSandboxTools((prev) => {
              const exists = prev.find((t) => t.index === call.index);
              if (exists) {
                return prev.map((t) =>
                  t.index === call.index
                    ? {
                        ...t,
                        code: call.arguments || t.code,
                        status: call.complete ? "running" : t.status,
                      }
                    : t,
                );
              }
              return [
                ...prev,
                {
                  index: call.index,
                  tool: call.name,
                  code: call.arguments || "",
                  status: call.complete ? "running" : "writing",
                  stdout: "",
                  stderr: "",
                  exitCode: null,
                  conversationId: currentId,
                },
              ];
            });
          } else if (call.arguments) {
            setStreamingSandboxTools((prev) =>
              prev.map((t) =>
                t.index === call.index
                  ? { ...t, code: t.code + call.arguments }
                  : t,
              ),
            );
          }

          if (call.complete) {
            setStreamingSandboxTools((prev) => {
              const existing = prev.find((t) => t.index === call.index);
              if (!existing || !SANDBOX_TOOL_NAMES.includes(existing.tool))
                return prev;
              let code = existing.code;
              try {
                const parsed = JSON.parse(code);
                code = parsed.code || parsed.command || code;
              } catch {}
              return prev.map((t) =>
                t.index === call.index ? { ...t, code, status: "running" } : t,
              );
            });
          }
        };

        const onSandboxResult = (result) => {
          if (result.sandboxId) {
            setConversations((prev) =>
              prev.map((conv) =>
                conv.id === currentId
                  ? { ...conv, sandboxId: result.sandboxId }
                  : conv,
              ),
            );
          }
          sandboxResults.push({ ...result, conversationId: currentId });
          setStreamingSandboxTools((prev) => {
            const lastRunning = [...prev]
              .reverse()
              .find((t) => t.status === "running" || t.status === "writing");
            if (!lastRunning) return prev;
            return prev.map((t) =>
              t.index === lastRunning.index
                ? {
                    ...t,
                    status: "complete",
                    stdout: result.stdout || "",
                    stderr: result.stderr || "",
                    exitCode: result.exitCode,
                    sandboxId: result.sandboxId,
                  }
                : t,
            );
          });
        };

        const commonArgs = [
          updatedMessages,
          selectedModel,
          onChunk,
          makeOnError(),
          makeOnComplete(needsWebSearch),
          thinkingEnabled,
          artifactsEnabled,
          tools,
          "auto",
          onToolCall,
          needsWebSearch
            ? (searchSources) => {
                sources = searchSources;
              }
            : null,
          (metricsData) => {
            metrics = metricsData;
            if (!metricsData) return;
            lastUsageRef.current = metricsData;
            predictedOutputTokensRef.current = 0;
            const total =
              (metricsData.inputTokens || 0) + (metricsData.outputTokens || 0);
            if (activeUsageConversationRef.current) {
              setConversations((prev) =>
                prev.map((conv) =>
                  conv.id === activeUsageConversationRef.current
                    ? { ...conv, contextUsage: total }
                    : conv,
                ),
              );
            }
            if (activeConversationRef.current === currentId) {
              setContextUsage(total);
              if (metricsData.cost != null) {
                setTotalCost((prev) => prev + metricsData.cost);
              }
            }
          },
          maxTokens,
          needsAgentMode,
          needsAgentMode ? currentId : null,
          needsAgentMode ? e2bApiKey : null,
          needsAgentMode ? sandboxId : null,
          needsAgentMode ? onSandboxResult : null,
        ];

        await streamChatCompletion(...commonArgs);
      } catch (_error) {
        isStreamingComplete.current = true;
        const errorMsg = {
          title: "Error",
          details: _error.message || "An unexpected error occurred.",
        };
        setStreamingError(errorMsg);
        setIsLoading(false);
        setStreamingContent("");
        setStreamingThinking("");

        const errorMessage = {
          role: "assistant",
          content: "",
          error: errorMsg,
        };
        const finalMessages = [...updatedMessages, errorMessage];
        setMessages(finalMessages);
        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === currentId ? { ...conv, messages: finalMessages } : conv,
          ),
        );
      } finally {
        isSubmittingRef.current = false;
      }
    },
    [
      selectedModel,
      thinkingEnabled,
      artifactsEnabled,
      webSearchEnabled,
      agentModeEnabled,
      toolsSupported,
      titleGenerationModel,
      maxTokens,
    ],
  );

  // Auto-send initial query from URL params
  useEffect(() => {
    if (!initialQuery || hasAutoSentRef.current) return;
    // Wait for conversations to load and component to mount
    const timer = setTimeout(() => {
      if (!hasAutoSentRef.current && initialQuery) {
        handleSendMessage(initialQuery);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [initialQuery, handleSendMessage]);

  return (
    <>
      <ChatLayout
        onNewChat={handleNewChat}
        conversations={conversations}
        activeConversation={activeConversation}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
        thinkingEnabled={thinkingEnabled}
        onThinkingChange={setThinkingEnabled}
        artifactsEnabled={artifactsEnabled}
        onArtifactsChange={setArtifactsEnabled}
        webSearchEnabled={webSearchEnabled}
        onWebSearchChange={setWebSearchEnabled}
        agentModeEnabled={agentModeEnabled}
        onAgentModeChange={setAgentModeEnabled}
        onApiKeyClick={() => setIsApiKeyModalOpen(true)}
        hasE2bKey={hasE2bKey}
        artifactFullscreen={artifactFullscreen}
        contextUsage={contextUsage}
        contextWindowMap={contextWindowMap}
        onContextWindowMapChange={setContextWindowMap}
        toolsSupported={toolsSupported}
        onToolsSupportedMapChange={setToolsSupportedMap}
        totalCost={totalCost}
        onImport={handleImport}
        onExportAll={handleExportAll}
        rightPanel={
          <ArtifactPanel
            artifacts={messageArtifacts}
            streamingArtifact={streamingArtifact}
            isOpen={artifactPanelOpen}
            onToggle={handleToggleArtifactPanel}
            fullscreen={artifactFullscreen}
            onFullscreenToggle={() => setArtifactFullscreen((prev) => !prev)}
          />
        }
      >
        <div className="flex flex-col h-full bg-background relative min-h-0">
          <MessageList
            messages={messages}
            isLoading={isLoading}
            streamingContent={streamingContent}
            streamingThinking={streamingThinking}
            streamingError={streamingError}
            thinkingEnabled={thinkingEnabled}
            webSearchEnabled={webSearchEnabled}
            agentModeEnabled={agentModeEnabled}
            artifactsEnabled={artifactsEnabled}
            streamingSandboxTools={streamingSandboxTools}
            showThinking={showThinking}
            showSandboxCode={showSandboxCode}
            showSandboxOutput={showSandboxOutput}
            showMetrics={showMetrics}
          />
          <ChatInput onSend={handleSendMessage} isLoading={isLoading} />
        </div>
      </ChatLayout>

      <SettingsModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        onSave={() => {
          setHasE2bKey(!!getStoredE2bApiKey());
          toast.success("Settings updated");
        }}
        titleGenerationModel={titleGenerationModel}
        onTitleGenerationModelChange={setTitleGenerationModel}
        theme={theme}
        onThemeChange={setTheme}
        showThinking={showThinking}
        onShowThinkingChange={setShowThinking}
        showSandboxCode={showSandboxCode}
        onShowSandboxCodeChange={setShowSandboxCode}
        showSandboxOutput={showSandboxOutput}
        onShowSandboxOutputChange={setShowSandboxOutput}
        showMetrics={showMetrics}
        onShowMetricsChange={setShowMetrics}
        maxTokens={maxTokens}
        onMaxTokensChange={setMaxTokens}
        onImport={handleImport}
        onExportAll={handleExportAll}
      />
      <ImportDialog
        isOpen={isImportDialogOpen}
        onClose={() => setIsImportDialogOpen(false)}
        onImportComplete={handleImportComplete}
      />
      <Dialog open={isBalanceModalOpen} onOpenChange={setIsBalanceModalOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Hack Club AI is out of balance</DialogTitle>
            <DialogDescription>
              Hack Club AI is currently out of balance. Until then, you can use
              openrouter/free which routes to an available free model
              automatically.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsBalanceModalOpen(false)}
            >
              Skip
            </Button>
            <Button
              onClick={() => {
                handleModelChange("openrouter/free");
                setIsBalanceModalOpen(false);
              }}
            >
              Use it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Toaster position="top-center" richColors />
    </>
  );
}
