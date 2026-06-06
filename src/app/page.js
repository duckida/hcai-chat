"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import ApiKeyModal from "@/components/chat/ApiKeyModal";
import ArtifactPanel from "@/components/chat/ArtifactPanel";
import ChatInput from "@/components/chat/ChatInput";
import ChatLayout from "@/components/chat/ChatLayout";
import MessageList from "@/components/chat/MessageList";
import {
  generateTitle,
  getStoredApiKey,
  streamChatCompletion,
} from "@/lib/api-client";
import { extractHtmlArtifacts } from "@/lib/artifacts";
import { dataUrlToBlob, uploadFileToBucky } from "@/lib/bucky";
import { getAllConversations, saveAllConversations } from "@/lib/db";
import { getTools } from "@/lib/tools";

export default function Home() {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingThinking, setStreamingThinking] = useState("");
  const [selectedModel, setSelectedModel] = useState("qwen/qwen3.6-flash");
  const [titleGenerationModel, setTitleGenerationModel] = useState(
    "qwen/qwen3-next-80b-a3b-instruct",
  );
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [artifactsEnabled, setArtifactsEnabled] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [artifactPanelOpen, setArtifactPanelOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [artifactFullscreen, setArtifactFullscreen] = useState(false);
  const [theme, setTheme] = useState("aurora");
  const [thinkingDefaultView, setThinkingDefaultView] = useState("closed");
  const [showMetrics, setShowMetrics] = useState(true);
  const [maxTokens, setMaxTokens] = useState(32000);
  const [streamingError, setStreamingError] = useState(null);

  const isFirstMount = useRef(true);
  const isStreamingComplete = useRef(false);
  const isSubmittingRef = useRef(false);
  const conversationsRef = useRef(conversations);

  // Update ref when conversations change
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // Derive artifacts from persisted messages
  const messageArtifacts = useMemo(() => {
    const allArtifacts = [];
    for (const msg of messages) {
      if (msg.role === "assistant") {
        const { artifacts } = extractHtmlArtifacts(msg.content);
        allArtifacts.push(...artifacts);
      }
    }
    return allArtifacts;
  }, [messages]);

  // Derive streaming artifact from live streaming content
  const { streamingArtifact } = useMemo(() => {
    if (!streamingContent) return { streamingArtifact: null };
    return extractHtmlArtifacts(streamingContent);
  }, [streamingContent]);

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
      }
    })();

    const savedModel = localStorage.getItem("selected_model");
    if (savedModel) setSelectedModel(savedModel);

    const savedTitleModel = localStorage.getItem("title_generation_model");
    if (savedTitleModel) setTitleGenerationModel(savedTitleModel);

    const savedThinking = localStorage.getItem("thinking_enabled");
    if (savedThinking) setThinkingEnabled(JSON.parse(savedThinking));

    const savedArtifacts = localStorage.getItem("artifacts_enabled");
    if (savedArtifacts) setArtifactsEnabled(JSON.parse(savedArtifacts));

    const savedWebSearch = localStorage.getItem("web_search_enabled");
    if (savedWebSearch) setWebSearchEnabled(JSON.parse(savedWebSearch));

    const savedThinkingDefault = localStorage.getItem("thinking_default_view");
    if (savedThinkingDefault) setThinkingDefaultView(savedThinkingDefault);

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
    localStorage.setItem("thinking_default_view", thinkingDefaultView);
  }, [thinkingDefaultView]);

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

    const newId = Date.now().toString();
    const newConversation = {
      id: newId,
      title: "New Chat",
      createdAt: new Date().toISOString(),
      messages: [],
      artifactPanelOpen: shouldOpen,
      model: selectedModel,
    };
    setConversations((prev) => [newConversation, ...prev]);
    setActiveConversation(newId);
    setMessages([]);
    setStreamingContent("");
    setStreamingThinking("");
    setStreamingError(null);
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
    },
    [conversations],
  );

  const handleDeleteConversation = useCallback(
    (id) => {
      setConversations((prev) => {
        const filtered = prev.filter((c) => c.id !== id);
        if (activeConversation === id) {
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

  const handleSendMessage = useCallback(
    async (content, files = []) => {
      if (!content.trim() && files.length === 0) return;

      // Determine if we should use web search based on toggle
      const needsWebSearch = webSearchEnabled;

      let currentId = activeConversation;
      if (!currentId) {
        const isDesktop =
          typeof window !== "undefined" && window.innerWidth >= 768;
        const shouldOpen = artifactsEnabled && isDesktop;

        const newId = Date.now().toString();
        const newConversation = {
          id: newId,
          title: "New Chat",
          createdAt: new Date().toISOString(),
          messages: [],
          artifactPanelOpen: shouldOpen,
          model: selectedModel,
        };
        setConversations((prev) => [newConversation, ...prev]);
        setActiveConversation(newId);
        setArtifactPanelOpen(shouldOpen);
        currentId = newId;
      }

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
      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      setStreamingContent("");
      setStreamingThinking("");
      setStreamingError(null);
      setIsLoading(true);

      // Prevent double submission
      if (isSubmittingRef.current) return;
      isSubmittingRef.current = true;

      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === currentId ? { ...conv, messages: updatedMessages } : conv,
        ),
      );

      let fullResponse = "";
      let fullThinking = "";
      let sources = []; // Store citations from web_search tool
      let metrics = null; // Store metrics
      isStreamingComplete.current = false;
      try {
        const tools = getTools({ includeWebSearch: needsWebSearch });

        if (needsWebSearch) {
          // Server-side tool calling with maxSteps: model thinks → searches
          // → thinks about results → generates artifact, all in one stream.
          await streamChatCompletion(
            updatedMessages,
            selectedModel,
            (chunk, type) => {
              if (type === "thinking") {
                fullThinking += chunk;
                setStreamingThinking(fullThinking);
              } else {
                fullResponse += chunk;
                setStreamingContent(fullResponse);
              }
            },
            (error) => {
              isStreamingComplete.current = true;
              setStreamingError({ title: "API Error", details: error.message });
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
            },
            async () => {
              if (isStreamingComplete.current) return;
              isStreamingComplete.current = true;

              if (!fullResponse && !fullThinking) {
                const errorMsg = {
                  title: "API Error",
                  details: "No response received from the model.",
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
                sources: sources.length > 0 ? sources : undefined,
                webSearch: true,
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
                const newTitle = await generateTitle(
                  content,
                  titleGenerationModel,
                );
                titleUpdate = { title: newTitle };
              }

              setConversations((prev) =>
                prev.map((conv) =>
                  conv.id === currentId
                    ? { ...conv, messages: finalMessages, ...titleUpdate }
                    : conv,
                ),
              );
            },
            thinkingEnabled,
            artifactsEnabled,
            tools,
            "auto",
            null,
            (searchSources) => {
              sources = searchSources;
            },
            (metricsData) => {
              metrics = metricsData;
            },
            maxTokens,
          );
        } else {
          // Use regular chat completion
          await streamChatCompletion(
            updatedMessages,
            selectedModel,
            (chunk, type) => {
              if (type === "thinking") {
                fullThinking += chunk;
                setStreamingThinking(fullThinking);
              } else {
                fullResponse += chunk;
                setStreamingContent(fullResponse);
              }
            },
            (error) => {
              isStreamingComplete.current = true;
              setStreamingError({ title: "API Error", details: error.message });
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
            },
            async () => {
              // Guard against double invocation (e.g. React StrictMode)
              if (isStreamingComplete.current) return;
              isStreamingComplete.current = true;

              if (!fullResponse && !fullThinking) {
                const errorMsg = {
                  title: "API Error",
                  details: "No response received from the model.",
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
                metrics,
              };
              const finalMessages = [...updatedMessages, assistantMessage];

              // Clear streaming FIRST so the streaming block disappears
              // before the persisted message appears. This prevents both
              // from being visible simultaneously (duplicate message).
              setStreamingContent("");
              setStreamingThinking("");
              setMessages(finalMessages);

              // Set loading to false immediately to prevent lingering loading indicator
              // Title generation can happen in the background without blocking UI
              setIsLoading(false);

              // Generate title after first AI response (when we have both user message and AI response)
              let titleUpdate = {};
              // Get the current conversation to check its title using the ref
              const currentConversation = conversationsRef.current.find(
                (c) => c.id === currentId,
              );
              // Only generate title if this is a new chat (title is still "New Chat")
              // and we have the first AI response (2 messages: user + assistant)
              if (
                currentConversation?.title === "New Chat" &&
                finalMessages.length === 2
              ) {
                const newTitle = await generateTitle(
                  content,
                  titleGenerationModel,
                );
                titleUpdate = { title: newTitle };
              }

              setConversations((prev) =>
                prev.map((conv) =>
                  conv.id === currentId
                    ? { ...conv, messages: finalMessages, ...titleUpdate }
                    : conv,
                ),
              );
            },
            thinkingEnabled,
            artifactsEnabled,
            tools,
            "auto",
            null,
            null,
            (metricsData) => {
              metrics = metricsData;
            },
            maxTokens,
          );
        }
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
      messages,
      activeConversation,
      selectedModel,
      thinkingEnabled,
      artifactsEnabled,
      webSearchEnabled,
      titleGenerationModel,
      maxTokens,
    ],
  );

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
        onApiKeyClick={() => setIsApiKeyModalOpen(true)}
        artifactFullscreen={artifactFullscreen}
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
            thinkingDefaultView={thinkingDefaultView}
            showMetrics={showMetrics}
          />
          <ChatInput onSend={handleSendMessage} isLoading={isLoading} />
        </div>
      </ChatLayout>

      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        onSave={() => toast.success("Settings updated")}
        titleGenerationModel={titleGenerationModel}
        onTitleGenerationModelChange={setTitleGenerationModel}
        theme={theme}
        onThemeChange={setTheme}
        thinkingDefaultView={thinkingDefaultView}
        onThinkingDefaultViewChange={setThinkingDefaultView}
        showMetrics={showMetrics}
        onShowMetricsChange={setShowMetrics}
        maxTokens={maxTokens}
        onMaxTokensChange={setMaxTokens}
      />
      <Toaster position="top-center" richColors />
    </>
  );
}
