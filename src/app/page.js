"use client";

import { Toaster, toast } from "sonner";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import ChatLayout from "@/components/chat/ChatLayout";
import MessageList from "@/components/chat/MessageList";
import ChatInput from "@/components/chat/ChatInput";
import ArtifactPanel from "@/components/chat/ArtifactPanel";
import ApiKeyModal from "@/components/chat/ApiKeyModal";
import {
  streamChatCompletion,
  getStoredApiKey,
  generateTitle,
  executeToolCall,
} from "@/lib/api-client";
import { getTools } from "@/lib/tools";
import { extractHtmlArtifacts } from "@/lib/artifacts";

export default function Home() {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingThinking, setStreamingThinking] = useState("");
  const [selectedModel, setSelectedModel] = useState("gpt-4o-mini");
  const [titleGenerationModel, setTitleGenerationModel] =
    useState("gpt-4o-mini");
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [artifactsEnabled, setArtifactsEnabled] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [artifactPanelOpen, setArtifactPanelOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [artifactFullscreen, setArtifactFullscreen] = useState(false);
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

  // Auto-open panel when a streaming artifact appears
  useEffect(() => {
    if (streamingArtifact && artifactsEnabled) {
      setArtifactPanelOpen(true);
    }
  }, [streamingArtifact, artifactsEnabled]);

  useEffect(() => {
    const stored = localStorage.getItem("conversations");
    if (stored) {
      const parsed = JSON.parse(stored);
      setConversations(parsed);
      if (parsed.length > 0 && isFirstMount.current) {
        setActiveConversation(parsed[0].id);
        setMessages(parsed[0].messages);
      }
    }

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

    if (!getStoredApiKey()) {
      setIsApiKeyModalOpen(true);
    }
    isFirstMount.current = false;
  }, []);

  useEffect(() => {
    localStorage.setItem("conversations", JSON.stringify(conversations));
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
  }, [artifactsEnabled]);

  useEffect(() => {
    localStorage.setItem(
      "web_search_enabled",
      JSON.stringify(webSearchEnabled),
    );
  }, [webSearchEnabled]);

  const handleNewChat = useCallback(() => {
    const newId = Date.now().toString();
    const newConversation = {
      id: newId,
      title: "New Chat",
      createdAt: new Date().toISOString(),
      messages: [],
    };
    setConversations((prev) => [newConversation, ...prev]);
    setActiveConversation(newId);
    setMessages([]);
    setStreamingContent("");
    setStreamingThinking("");
  }, []);

  const handleSelectConversation = useCallback(
    (id) => {
      setActiveConversation(id);
      const conversation = conversations.find((c) => c.id === id);
      setMessages(conversation?.messages || []);
      setStreamingContent("");
      setStreamingThinking("");
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
    async (content) => {
      if (!content.trim()) return;

      // Determine if we should use web search based on toggle
      const needsWebSearch = webSearchEnabled;

      let currentId = activeConversation;
      if (!currentId) {
        const newId = Date.now().toString();
        const newConversation = {
          id: newId,
          title: "New Chat",
          createdAt: new Date().toISOString(),
          messages: [],
        };
        setConversations((prev) => [newConversation, ...prev]);
        setActiveConversation(newId);
        currentId = newId;
      }

      const userMessage = { role: "user", content };
      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      setStreamingContent("");
      setStreamingThinking("");
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
      isStreamingComplete.current = false;
      try {
        if (needsWebSearch) {
          // Use tool calling for web search
          const tools = getTools();
          let currentMessages = updatedMessages;
          let iteration = 0;
          const MAX_ITERATIONS = 2; // One tool call + final response max

          while (iteration < MAX_ITERATIONS) {
            iteration++;
            let iterationContent = "";
            let iterationThinking = "";
            const toolCallsMap = new Map(); // Accumulate tool calls by index

            await streamChatCompletion(
              currentMessages,
              selectedModel,
              (chunk, type) => {
                if (type === "thinking") {
                  iterationThinking += chunk;
                  setStreamingThinking(iterationThinking);
                } else {
                  iterationContent += chunk;
                  setStreamingContent(iterationContent);
                }
              },
              (error) => {
                toast.error(error.message);
                setIsLoading(false);
                setStreamingContent("");
                setStreamingThinking("");
              },
              async () => {
                // This iteration's response is complete
                const assistantMsg = {
                  role: "assistant",
                  content: iterationContent,
                  thinking: iterationThinking || undefined,
                };

                // Add to conversation
                currentMessages = [...currentMessages, assistantMsg];

                // Process accumulated tool calls
                const toolCalls = Array.from(toolCallsMap.values());

                if (toolCalls.length > 0 && iteration < MAX_ITERATIONS) {
                  for (const toolCall of toolCalls) {
                    try {
                      // arguments should now be complete JSON string
                      let params = {};
                      if (typeof toolCall.arguments === "string") {
                        try {
                          params = JSON.parse(toolCall.arguments);
                        } catch (e) {
                          console.error("Failed to parse tool arguments:", e);
                          params = { query: toolCall.arguments };
                        }
                      } else if (typeof toolCall.arguments === "object") {
                        params = toolCall.arguments;
                      }

                      const result = await executeToolCall(
                        toolCall.name,
                        params,
                        getStoredApiKey(),
                      );

                      // Store sources if this is a web search
                      if (toolCall.name === "web_search") {
                        sources = result.sources || result.citations || [];
                      }

                      // Add tool result as message
                      currentMessages.push({
                        role: "tool",
                        content: JSON.stringify({
                          tool: toolCall.name,
                          result: result.result || result.content || "",
                          sources: result.sources || [],
                        }),
                        tool_call_id: toolCall.id,
                        name: toolCall.name,
                      });
                    } catch (error) {
                      toast.error(`Tool error: ${error.message}`);
                      currentMessages.push({
                        role: "tool",
                        content: JSON.stringify({
                          tool: toolCall.name,
                          error: error.message,
                        }),
                        tool_call_id: toolCall.id,
                        name: toolCall.name,
                      });
                    }
                  }
                  // Loop continues for next iteration
                } else {
                  // No tool calls, we're done
                  isStreamingComplete.current = true;
                  setStreamingContent("");
                  setStreamingThinking("");

                  // If we have sources from web_search, attach them to the last assistant message
                  if (sources && sources.length > 0) {
                    const lastAssistantIndex = currentMessages.findLastIndex(
                      (m) => m.role === "assistant",
                    );
                    if (lastAssistantIndex !== -1) {
                      currentMessages[lastAssistantIndex] = {
                        ...currentMessages[lastAssistantIndex],
                        sources,
                      };
                    }
                  }

                  setMessages(currentMessages);
                  setIsLoading(false);

                  // Generate title if needed
                  const currentConversation = conversationsRef.current.find(
                    (c) => c.id === currentId,
                  );
                  if (
                    currentConversation?.title === "New Chat" &&
                    currentMessages.length === 2
                  ) {
                    const newTitle = await generateTitle(
                      content,
                      titleGenerationModel,
                    );
                    setConversations((prev) =>
                      prev.map((conv) =>
                        conv.id === currentId
                          ? { ...conv, title: newTitle }
                          : conv,
                      ),
                    );
                  }
                }
              },
              thinkingEnabled,
              artifactsEnabled,
              tools,
              "auto",
              (toolCall) => {
                // Accumulate tool calls by index
                const index = toolCall.index;
                if (!toolCallsMap.has(index)) {
                  toolCallsMap.set(index, {
                    id: toolCall.id || "",
                    name: toolCall.name || "",
                    arguments: toolCall.arguments || "",
                  });
                } else {
                  const existing = toolCallsMap.get(index);
                  if (toolCall.id) existing.id = toolCall.id;
                  if (toolCall.name) existing.name += toolCall.name;
                  if (toolCall.arguments)
                    existing.arguments += toolCall.arguments;
                }
              },
            );

            // If we finished without tool calls, break
            if (toolCallsMap.size === 0) break;
          }
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
              toast.error(error.message);
              setIsLoading(false);
              setStreamingContent("");
              setStreamingThinking("");
            },
            async () => {
              // Guard against double invocation (e.g. React StrictMode)
              if (isStreamingComplete.current) return;
              isStreamingComplete.current = true;

              const assistantMessage = {
                role: "assistant",
                content: fullResponse,
                thinking: fullThinking || undefined,
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
          );
        }
      } catch (_error) {
        setIsLoading(false);
        setStreamingContent("");
        setStreamingThinking("");
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
        onModelChange={setSelectedModel}
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
            onToggle={() => setArtifactPanelOpen((prev) => !prev)}
            fullscreen={artifactFullscreen}
            onFullscreenToggle={() => setArtifactFullscreen((prev) => !prev)}
          />
        }
      >
        <div className="flex flex-col h-full bg-white relative min-h-0">
          <MessageList
            messages={messages}
            isLoading={isLoading}
            streamingContent={streamingContent}
            streamingThinking={streamingThinking}
            thinkingEnabled={thinkingEnabled}
            webSearchEnabled={webSearchEnabled}
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
      />
      <Toaster position="top-center" richColors />
    </>
  );
}
