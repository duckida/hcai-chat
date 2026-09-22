"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  generateTitle,
  getStoredE2bApiKey,
  streamChatCompletion,
} from "@/lib/api-client";
import { dataUrlToBlob, uploadFileToBucky } from "@/lib/bucky";
import { getTools, SANDBOX_TOOL_NAMES } from "@/lib/tools";

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch {}
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function estimateOutputTokens(chars) {
  return Math.max(0, Math.round((chars || 0) / 4));
}

/**
 * Streaming chat lifecycle: upload attachments, send the user message,
 * accumulate text/reasoning deltas, track sandbox tool calls, and commit
 * the final assistant message to the owning conversation.
 *
 * Usage is attributed to the conversation that started the request, so
 * switching chats mid-stream never bills the wrong one. Final deltas come
 * from live accumulators rather than render snapshots, so the tail of a
 * stream is never dropped between the last chunk and the commit.
 */
export function useChatStream({
  conversations,
  activeConversation,
  messagesRef,
  setMessages,
  patchConversation,
  selectedModel,
  titleGenerationModel,
  thinkingEnabled,
  artifactsEnabled,
  webSearchEnabled,
  agentModeEnabled,
  maxTokens,
  toolsSupported,
  isDesktop,
}) {
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingThinking, setStreamingThinking] = useState("");
  const [streamingError, setStreamingError] = useState(null);
  const [streamingSandboxTools, setStreamingSandboxTools] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [contextUsage, setContextUsage] = useState(0);

  const isStreamingComplete = useRef(false);
  const isSubmittingRef = useRef(false);
  const activeUsageConversationRef = useRef(null);
  const lastUsageRef = useRef(null);
  const predictedOutputTokensRef = useRef(0);

  const resetStreamingState = useCallback(() => {
    setStreamingContent("");
    setStreamingThinking("");
    setStreamingError(null);
    setStreamingSandboxTools([]);
    setContextUsage(0);
    lastUsageRef.current = null;
    predictedOutputTokensRef.current = 0;
  }, []);

  const resetForConversation = useCallback(
    (conversation) => {
      resetStreamingState();
      setContextUsage(conversation?.contextUsage || 0);
      lastUsageRef.current = conversation?.contextUsage
        ? {
            inputTokens: conversation.contextUsage,
            outputTokens: 0,
          }
        : null;
    },
    [resetStreamingState],
  );

  const send = useCallback(
    async (content, files = []) => {
      if (!content?.trim() && files.length === 0) return;
      if (isSubmittingRef.current) return;
      isSubmittingRef.current = true;

      const needsWebSearch = webSearchEnabled;
      const needsAgentMode = agentModeEnabled;

      if (needsAgentMode && !getStoredE2bApiKey()) {
        isSubmittingRef.current = false;
        toast.error("Add your E2B API key in Settings to use cloud sandbox.");
        return;
      }

      let currentId = activeConversation;
      if (!currentId) {
        currentId = createId();
        const conversation = {
          id: currentId,
          title: "New Chat",
          createdAt: new Date().toISOString(),
          messages: [],
          artifactPanelOpen: artifactsEnabled && isDesktop,
          model: selectedModel,
          contextUsage: 0,
        };
        conversations.newConversation(conversation);
        resetStreamingState();
      } else {
        conversations.selectConversation(currentId);
      }

      // Track usage against the conversation this message belongs to, so
      // switching chats mid-stream doesn't attribute tokens to the wrong one.
      activeUsageConversationRef.current = currentId;
      predictedOutputTokensRef.current = 0;

      const e2bApiKey = getStoredE2bApiKey();
      const sandboxId =
        conversations.conversationsRef.current.find((c) => c.id === currentId)
          ?.sandboxId || null;

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
      resetStreamingState();
      setIsLoading(true);
      patchConversation(currentId, { messages: updatedMessages });

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
          if (activeUsageConversationRef.current === currentId) {
            setContextUsage(total);
          }
          const usageFor = activeUsageConversationRef.current || currentId;
          if (usageFor) patchConversation(usageFor, { contextUsage: total });
        };

        const bumpPredictedUsage = (chars) => {
          if (chars <= 0) return;
          predictedOutputTokensRef.current += estimateOutputTokens(chars);
          const inputBase = lastUsageRef.current?.inputTokens || 0;
          const outputBase = lastUsageRef.current?.outputTokens || 0;
          const total =
            inputBase + outputBase + predictedOutputTokensRef.current;
          if (activeUsageConversationRef.current === currentId) {
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
          patchConversation(currentId, { messages: finalMessages });
        };

        // The conversation may have been removed (deleted) or the user may
        // have started a new chat while this stream was still running. Apply
        // assistant output to the owning conversation by id against the
        // latest state instead of a stale render snapshot.
        const commitMessages = (extraMessage) => {
          const finalMessages = extraMessage
            ? [...updatedMessages, extraMessage]
            : updatedMessages;
          setMessages(finalMessages);
          patchConversation(currentId, { messages: finalMessages });
          return finalMessages;
        };

        const makeOnComplete = (includeSources) => async () => {
          if (isStreamingComplete.current) return;
          isStreamingComplete.current = true;

          // Use the live accumulators, not a render snapshot: the final
          // deltas must never be dropped just because the component has not
          // re-rendered since the last chunk arrived.
          const finalContent = fullResponse;
          const finalThinking = fullThinking;

          if (!finalContent && !finalThinking) {
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
            setStreamingContent("");
            setStreamingThinking("");
            setIsLoading(false);
            commitMessages(errorMessage);
            return;
          }

          const assistantMessage = {
            role: "assistant",
            content: finalContent,
            thinking: finalThinking || undefined,
            ...(includeSources
              ? {
                  sources: sources.length > 0 ? sources : undefined,
                  webSearch: true,
                }
              : {}),
            ...(sandboxResults.length > 0 ? { sandboxResults } : {}),
            metrics,
          };

          setStreamingContent("");
          setStreamingThinking("");
          setIsLoading(false);
          const finalMessages = commitMessages(assistantMessage);

          const currentConversation =
            conversations.conversationsRef.current.find(
              (c) => c.id === currentId,
            );
          const patch = { messages: finalMessages };
          if (
            currentConversation?.title === "New Chat" &&
            finalMessages.length === 2
          ) {
            patch.title = await generateTitle(content, titleGenerationModel);
          }
          patchConversation(currentId, patch);
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
            patchConversation(currentId, { sandboxId: result.sandboxId });
          }
          sandboxResults.push({ ...result, conversationId: currentId });
          setStreamingSandboxTools((prev) => {
            const lastRunning = [...prev]
              .reverse()
              .find((t) => t.status === "running" || t.status === "writing");
            // A result can arrive without a matching tool-call delta (e.g.
            // server-side execution with streamed arguments dropped by the
            // proxy). Register it so the UI still shows the completed run.
            if (!lastRunning) {
              return [
                ...prev,
                {
                  index: prev.length,
                  tool: result.tool || "execute_code",
                  code: result.code || "",
                  status: "complete",
                  stdout: result.stdout || "",
                  stderr: result.stderr || "",
                  exitCode: result.exitCode ?? null,
                  sandboxId: result.sandboxId,
                  conversationId: currentId,
                },
              ];
            }
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

        await streamChatCompletion({
          messages: updatedMessages,
          model: selectedModel,
          onChunk,
          onError: makeOnError(),
          onComplete: makeOnComplete(needsWebSearch),
          thinking: thinkingEnabled,
          artifacts: artifactsEnabled,
          tools,
          toolChoice: "auto",
          onToolCall,
          onSearchResult: needsWebSearch
            ? (searchSources) => {
                sources = searchSources;
              }
            : null,
          onMetrics: (metricsData) => {
            metrics = metricsData;
            if (!metricsData) return;
            lastUsageRef.current = metricsData;
            predictedOutputTokensRef.current = 0;
            const total =
              (metricsData.inputTokens || 0) + (metricsData.outputTokens || 0);
            const usageFor = activeUsageConversationRef.current;
            if (usageFor) patchConversation(usageFor, { contextUsage: total });
            if (usageFor === currentId) {
              setContextUsage(total);
            }
          },
          maxTokens,
          agentMode: needsAgentMode,
          conversationId: needsAgentMode ? currentId : null,
          e2bApiKey: needsAgentMode ? e2bApiKey : null,
          sandboxId: needsAgentMode ? sandboxId : null,
          onSandboxResult: needsAgentMode ? onSandboxResult : null,
          onFallbackStart: () => {
            // The non-streaming retry regenerates the whole answer. Drop the
            // partial text the dead stream already accumulated, otherwise the
            // replay appends to it and the response appears twice.
            fullResponse = "";
            fullThinking = "";
            sources = [];
            metrics = null;
            sandboxResults.length = 0;
            isStreamingComplete.current = false;
            setStreamingContent("");
            setStreamingThinking("");
            setStreamingSandboxTools([]);
          },
        });
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
        patchConversation(currentId, { messages: finalMessages });
      } finally {
        isSubmittingRef.current = false;
      }
    },
    [
      activeConversation,
      agentModeEnabled,
      artifactsEnabled,
      conversations,
      isDesktop,
      maxTokens,
      messagesRef,
      patchConversation,
      resetStreamingState,
      selectedModel,
      setMessages,
      thinkingEnabled,
      titleGenerationModel,
      toolsSupported,
      webSearchEnabled,
    ],
  );

  return {
    send,
    isLoading,
    streamingContent,
    streamingThinking,
    streamingError,
    streamingSandboxTools,
    contextUsage,
    setContextUsage,
    resetForConversation,
  };
}
