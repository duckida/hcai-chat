"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  generateTitle,
  getStoredApiKey,
  getStoredE2bApiKey,
  streamChatCompletion,
} from "@/lib/api-client";
import { dataUrlToBlob, uploadFileToBucky } from "@/lib/bucky";
import { getTools, SANDBOX_TOOL_NAMES } from "@/lib/tools";
import {
  activeConversationRef,
  conversationsActions,
  conversationsRef,
  messagesRef,
} from "@/stores/conversations";
import {
  appendTurnChip,
  appendTurnChipArgs,
  appendTurnDelta,
  beginTurn,
  clearTurnDeltas,
  fillLastSearchChip,
  predictContextUsage,
  readTurnChips,
  readTurnDeltas,
  resetTurn,
  setContextUsage,
  updateSandboxTools,
  useTurn,
} from "@/stores/turn";

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
 * The route reports one usage frame per round now that the agent loop drives
 * rounds client-side; the turn's metrics are the sum across rounds. Token
 * counts and durations add, the rate is recomputed from the totals, and
 * time-to-first-output is the first round's (the only one with a cold start).
 */
function sumMetricsFrames(a, b) {
  const sum = (x, y) => (x || 0) + (y || 0);
  const duration = sum(a.duration, b.duration);
  const outputTokens = sum(a.outputTokens, b.outputTokens);
  return {
    ...a,
    ...b,
    inputTokens: sum(a.inputTokens, b.inputTokens),
    outputTokens,
    reasoningTokens: sum(a.reasoningTokens, b.reasoningTokens),
    totalTokens: sum(a.totalTokens, b.totalTokens),
    duration,
    generationDuration: sum(a.generationDuration, b.generationDuration),
    tokensPerSecond:
      duration > 0 ? Math.round((outputTokens / duration) * 100) / 100 : 0,
    timeToFirstOutputMs: a.timeToFirstOutputMs ?? b.timeToFirstOutputMs ?? null,
    cost: sum(a.cost, b.cost),
  };
}

/**
 * Run one tool call from the agent loop against the on-demand endpoints.
 * Sandbox tools go to /api/sandbox (E2B keys stay server-side); everything
 * else to /api/tools. Returns { kind, data } on success or { error } — a
 * failure is a tool error fed back to the model, never a lost stream.
 */
async function executeClientTool(
  call,
  { conversationId, e2bApiKey, sandboxId, apiKey },
) {
  let input;
  try {
    input = JSON.parse(call.arguments || "{}");
  } catch (error) {
    return { error: `Invalid tool arguments: ${error.message}` };
  }

  try {
    if (SANDBOX_TOOL_NAMES.includes(call.name)) {
      const action = call.name === "execute_code" ? "execute" : "run_command";
      const res = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          conversationId,
          e2bApiKey,
          sandboxId,
          ...(action === "execute"
            ? { code: input.code }
            : { command: input.command }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          error: data.error || `Sandbox request failed (${res.status})`,
        };
      }
      return { kind: "sandbox", data };
    }

    const res = await fetch("/api/tools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: call.name, parameters: input, apiKey }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: data.error || `Tool request failed (${res.status})` };
    }
    return { kind: "tools", data };
  } catch (error) {
    return { error: error.message || "Tool execution failed" };
  }
}

/**
 * Streaming chat lifecycle: upload attachments, send the user message,
 * accumulate text/reasoning deltas, track sandbox tool calls, and commit
 * the final assistant message to the owning conversation.
 *
 * Usage is attributed to the conversation that started the request, so
 * switching chats mid-stream never bills the wrong one. Final deltas come
 * from the turn store's live accumulators rather than render snapshots, so
 * the tail of a stream is never dropped between the last chunk and the
 * commit.
 *
 * Conversation state is read from the conversations store rather than passed
 * in: both live in the same module graph, so threading five props through
 * ChatApp only created a second place for a stale copy to come from.
 */
export function useChatTurn({
  selectedModel,
  titleGenerationModel,
  thinkingEnabled,
  artifactsEnabled,
  webSearchEnabled,
  agentModeEnabled,
  maxTokens,
  toolsSupported,
}) {
  const turn = useTurn();

  // Per-instance guards: state lives in the store, but a double-submit latch
  // and the usage attribution cursor must not survive into the next mount.
  const isSubmittingRef = useRef(false);
  const isStreamingComplete = useRef(false);
  // Armed by onFallbackStart: the dead stream's partial must be dropped, but
  // only once the replay actually delivers — not before, or a replay that
  // fails too would leave the user with nothing. Read by onChunk, the single
  // funnel every replayed byte goes through.
  const pendingReplayClear = useRef(false);
  const activeUsageConversationRef = useRef(null);
  const lastUsageRef = useRef(null);
  const predictedOutputTokensRef = useRef(0);

  const resetForConversation = useCallback((conversation) => {
    resetTurn();
    setContextUsage(conversation?.contextUsage || 0);
  }, []);

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

      let currentId = activeConversationRef.current;
      if (!currentId) {
        currentId = createId();
        conversationsActions.newConversation({
          id: currentId,
          title: "New Chat",
          createdAt: new Date().toISOString(),
          messages: [],
          model: selectedModel,
          contextUsage: 0,
        });
        resetTurn();
      } else {
        conversationsActions.selectConversation(currentId);
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
        const failedUploads = [];
        if (content.trim()) {
          contentParts.push({ type: "text", text: content });
        }
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const buckyUrl = fileUrls[i];
          if (file.type.startsWith("image/")) {
            const imageSrc = buckyUrl || file.dataUrl;
            if (imageSrc) {
              contentParts.push({
                type: "image",
                image: imageSrc,
              });
            } else {
              failedUploads.push(file.name);
            }
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
          } else {
            failedUploads.push(file.name);
          }
        }
        if (failedUploads.length > 0) {
          toast.error(
            `Could not attach ${failedUploads.join(", ")} — upload failed.`,
          );
        }
        // Never persist a message the renderer cannot display (all parts
        // dropped): it would surface as an orphaned avatar row with an
        // empty body. Tell the user instead of sending a hollow message.
        if (contentParts.length === 0) {
          isSubmittingRef.current = false;
          return;
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
      conversationsActions.setMessages(updatedMessages);
      beginTurn(currentId);
      conversationsActions.patchConversation(currentId, {
        messages: updatedMessages,
      });

      let sources = [];
      let metrics = null;
      let totalMetrics = null;
      const sandboxResults = [];
      // Every round's tool calls and results, committed alongside the merged
      // assistant message so the *next* turn's request carries the search and
      // sandbox context the model actually saw this turn. Tool records are
      // invisible in the thread (messages.js filters role:"tool"), so the turn
      // still reads as one agent message.
      const turnToolCalls = [];
      const turnToolMessages = [];
      isStreamingComplete.current = false;
      pendingReplayClear.current = false;
      // Per-round agent-loop state, reset at the top of every round.
      let roundToolCalls = [];
      let roundFailed = false;
      // Argument-fragment accumulator for the live round. Each round's tool
      // calls arrive as a start frame (name + id, empty args) followed by
      // argument-fragment deltas, so they have to be assembled by index.
      const toolCallAccs = new Map();
      // UI-side sandbox entries are keyed by tool index, so offset the
      // per-round indices before handing them to the store; the streaming
      // store persists across rounds and each round restarts from 0.
      let toolIndexBase = 0;

      // The conversation may have been removed (deleted) or the user may
      // have started a new chat while this stream was still running. Apply
      // assistant output to the owning conversation by id against the
      // latest state instead of a stale render snapshot — and only touch
      // the visible message list when that conversation is still active, so
      // a late commit can never clobber the chat the user is looking at.
      // The agent loop appends rounds to this base as it goes, so an
      // intermediate commit (a tool-call round) builds on the latest round's
      // messages rather than the turn's original list. Callers pass the
      // messages to append as an array.
      let baseMessages = updatedMessages;
      const commitMessages = (extraMessages) => {
        const finalMessages = extraMessages
          ? [...baseMessages, ...extraMessages]
          : baseMessages;
        if (activeConversationRef.current === currentId) {
          conversationsActions.setMessages(finalMessages);
        }
        conversationsActions.patchConversation(currentId, {
          messages: finalMessages,
        });
        baseMessages = finalMessages;
        return finalMessages;
      };

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
          if (usageFor) {
            conversationsActions.patchConversation(usageFor, {
              contextUsage: total,
            });
          }
        };

        const bumpPredictedUsage = (chars) => {
          if (chars <= 0) return;
          predictedOutputTokensRef.current += estimateOutputTokens(chars);
          const inputBase = lastUsageRef.current?.inputTokens || 0;
          const outputBase = lastUsageRef.current?.outputTokens || 0;
          const total =
            inputBase + outputBase + predictedOutputTokensRef.current;
          if (activeUsageConversationRef.current === currentId) {
            predictContextUsage(total);
          }
        };

        const makeOnError = () => (error) => {
          isStreamingComplete.current = true;
          roundFailed = true;
          snapToActualUsage();
          // Keep whatever arrived before the failure: text the user already
          // read must not vanish into an empty box. The commit carries both
          // the partial and the error — the thread renders them together,
          // and hasSendableContent keeps the record out of later requests.
          const { content: partialContent, thinking: partialThinking } =
            readTurnDeltas();
          clearTurnDeltas({
            streamingError: {
              title: "API Error",
              details: `[${selectedModel}] ${error.message}`,
            },
            isLoading: false,
          });

          const errorMessage = {
            role: "assistant",
            content: partialContent,
            ...(partialThinking ? { thinking: partialThinking } : {}),
            error: { title: "API Error", details: error.message },
          };
          commitMessages([errorMessage]);
        };

        const makeOnComplete = (includeSources) => async () => {
          if (isStreamingComplete.current) return;
          isStreamingComplete.current = true;

          // A round that streamed tool calls is relit by the agent loop and
          // never becomes the final message.  Accumulated calls are keyed in
          // toolCallAccs, which is already populated by the onToolCall
          // handler before this callback runs.
          if (toolCallAccs.size > 0) return;

          // Use the live accumulators, not a render snapshot: the final
          // deltas must never be dropped just because the component has not
          // re-rendered since the last chunk arrived.
          const { content: finalContent, thinking: finalThinking } =
            readTurnDeltas();
          // Chips are read before the clear below — the clear drops them with
          // the reasoning text they are pinned to.
          const finalChips = readTurnChips();

          if (!finalContent && !finalThinking) {
            const errorMsg = {
              title: "API Error",
              details: `No response received from model "${selectedModel}". The model may be overloaded or unavailable.`,
            };
            clearTurnDeltas({
              streamingError: errorMsg,
              isLoading: false,
            });
            const errorMessage = {
              role: "assistant",
              content: "",
              error: errorMsg,
            };
            commitMessages([errorMessage]);
            return;
          }

          const assistantMessage = {
            role: "assistant",
            content: finalContent,
            thinking: finalThinking || undefined,
            // `index` and the raw argument buffer are stream plumbing; the
            // pill only needs where it goes, what it says, and which sites
            // the search returned. A message with no chips carries no field
            // at all, so legacy thinking renders exactly as before.
            ...(finalChips.length > 0
              ? {
                  thinkingChips: finalChips.map((chip) => ({
                    tool: chip.tool,
                    at: chip.at,
                    label: chip.label,
                    sources: chip.sources,
                  })),
                }
              : {}),
            ...(includeSources
              ? {
                  sources: sources.length > 0 ? sources : undefined,
                  webSearch: true,
                }
              : {}),
            ...(sandboxResults.length > 0 ? { sandboxResults } : {}),
            // The merged message keeps the turn's tool calls so the tool
            // records committed with it stay a valid pair on the wire — the
            // next turn's request then carries the search/sandbox output the
            // model actually worked from, not just this text.
            ...(turnToolCalls.length > 0 ? { tool_calls: turnToolCalls } : {}),
            metrics,
          };

          clearTurnDeltas({ isLoading: false });
          const finalMessages = commitMessages([
            assistantMessage,
            ...turnToolMessages,
          ]);

          const currentConversation = conversationsRef.current.find(
            (c) => c.id === currentId,
          );
          const patch = { messages: finalMessages };
          if (currentConversation?.title === "New Chat") {
            // No `finalMessages.length === 2` guard here — it made one failed
            // attempt permanent. A turn that errors returns before this runs,
            // and a title request that fails falls back to the raw message, so
            // the conversation keeps "New Chat" while its message count climbs
            // past two and is then never titled at all. Retrying on every turn
            // while still untitled is the whole condition that matters.
            //
            // The text comes from the conversation's first user message, not
            // the one just sent: this can now fire on turn 3+, and the topic is
            // still what the user originally asked about.
            const firstUserMessage = finalMessages.find(
              (m) => m.role === "user",
            )?.content;
            patch.title = await generateTitle(
              typeof firstUserMessage === "string" && firstUserMessage.trim()
                ? firstUserMessage
                : content,
              titleGenerationModel,
            );
          }
          conversationsActions.patchConversation(currentId, patch);
          snapToActualUsage();
        };

        const onChunk = (chunk, type) => {
          // First byte of a replay replaces the dead stream's partial rather
          // than appending to it (which would show the response twice). If
          // no byte ever arrives, the buffers keep their partial and the
          // error path below commits it instead of an empty box.
          if (pendingReplayClear.current) {
            pendingReplayClear.current = false;
            clearTurnDeltas({ streamingSandboxTools: [] });
          }
          bumpPredictedUsage(chunk.length);
          appendTurnDelta(type, chunk);
        };

        const onToolCall = (call) => {
          if (call.arguments && !call.complete) {
            bumpPredictedUsage(call.arguments.length);
          }

          // Thinking-block chips record here, *outside* the agent guard:
          // web search and the calculator run in ordinary chats, where this
          // early return would otherwise swallow their calls. The stream
          // delivers reasoning and tool calls in order, so pinning the chip
          // to the thinking buffer's length at this moment places it exactly
          // where the model interrupted itself. Sandbox tools are excluded —
          // their commands belong to the side panel, not the thread.
          if (call.name && !SANDBOX_TOOL_NAMES.includes(call.name)) {
            appendTurnChip({ index: call.index, tool: call.name });
            if (call.arguments) {
              appendTurnChipArgs(call.index, call.arguments);
            }
          } else if (!call.name && call.arguments) {
            appendTurnChipArgs(call.index, call.arguments);
          }

          if (!needsAgentMode) return;

          if (call.name && SANDBOX_TOOL_NAMES.includes(call.name)) {
            updateSandboxTools((prev) => {
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
            updateSandboxTools((prev) =>
              prev.map((t) =>
                t.index === call.index
                  ? { ...t, code: t.code + call.arguments }
                  : t,
              ),
            );
          }

          if (call.complete) {
            updateSandboxTools((prev) => {
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
            conversationsActions.patchConversation(currentId, {
              sandboxId: result.sandboxId,
            });
          }
          sandboxResults.push({ ...result, conversationId: currentId });
          updateSandboxTools((prev) => {
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

        const onSearchResult = needsWebSearch
          ? (searchSources) => {
              sources = searchSources;
              // The domains land on the chip pinned where the call
              // happened; without this the pill would show the query
              // forever.
              fillLastSearchChip(searchSources);
            }
          : null;

        const runRound = async (roundMessages) => {
          // Per-round resets. sources / sandboxResults / totalMetrics
          // accumulate across rounds — the final message carries the turn's
          // totals. beginTurn is deliberately NOT called here: it resets
          // streamingSandboxTools and would wipe the terminal's run history.
          isStreamingComplete.current = false;
          pendingReplayClear.current = false;
          roundToolCalls = [];
          roundFailed = false;
          toolCallAccs.clear();

          await streamChatCompletion({
            messages: roundMessages,
            model: selectedModel,
            onChunk,
            onError: makeOnError(),
            onComplete: makeOnComplete(needsWebSearch),
            thinking: thinkingEnabled,
            artifacts: artifactsEnabled,
            tools,
            toolChoice: "auto",
            onToolCall: (call) => {
              // Visible call details are offset so round B can't disturb
              // round A's entries in the persisted streaming store.
              onToolCall({ ...call, index: call.index + toolIndexBase });
              // Assemble argument fragments by tool_call index.
              const acc = toolCallAccs.get(call.index) ?? {
                index: call.index,
                id: "",
                name: "",
                arguments: "",
              };
              if (call.id) acc.id = call.id;
              if (call.name) acc.name = call.name;
              if (call.arguments) acc.arguments += call.arguments;
              toolCallAccs.set(call.index, acc);
            },
            onSearchResult,
            onMetrics: (metricsData) => {
              if (!metricsData) return;
              // Each round reports its own usage; the turn's metrics are the
              // sum, and the running total is what the final message carries.
              totalMetrics = totalMetrics
                ? sumMetricsFrames(totalMetrics, metricsData)
                : { ...metricsData };
              metrics = totalMetrics;
              lastUsageRef.current = totalMetrics;
              predictedOutputTokensRef.current = 0;
              const total =
                (totalMetrics.inputTokens || 0) +
                (totalMetrics.outputTokens || 0);
              const usageFor = activeUsageConversationRef.current;
              if (usageFor) {
                conversationsActions.patchConversation(usageFor, {
                  contextUsage: total,
                });
              }
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
              // The replay regenerates the whole answer, so the dead stream's
              // partial must not double up underneath it — but do not drop it
              // yet: if the replay fails too, that text is all the user has.
              // Keep it on screen and swap it for the regenerated text on the
              // first replay chunk (see onChunk).
              sources = [];
              metrics = null;
              totalMetrics = null;
              sandboxResults.length = 0;
              isStreamingComplete.current = false;
              pendingReplayClear.current = true;
            },
            singleRound: true,
          });
          // Every call's argument-fragment deltas are complete now; fold them
          // into calls with the offset indices the UI already used.
          roundToolCalls = [...toolCallAccs.values()]
            .filter((acc) => acc.id !== "" && acc.name !== "")
            .map((acc) => ({
              index: acc.index + toolIndexBase,
              id: acc.id,
              name: acc.name,
              arguments: acc.arguments,
              complete: true,
            }));
          toolIndexBase += toolCallAccs.size;
        };

        // Client-side agent loop (Feature C): one short stream per model
        // round. A round that ends with tool calls runs the calls here via
        // the on-demand endpoints, then commits the assistant message (with
        // its tool_calls and any chips the tools filled) together with the
        // tool results — so no single connection spans the whole turn.
        // Unlimited rounds by default (Libre's tool_max_iterations pattern);
        // a settings cap plugs in here.
        let roundMessages = updatedMessages;
        // The buffers hold cumulative assistant deltas since the last
        // commit, so the per-round slice for the next request is the
        // difference between what was in the store before and after the round.
        let prevCum = readTurnDeltas();
        while (true) {
          await runRound(roundMessages);

          if (roundFailed) break; // the error path already committed

          if (roundToolCalls.length === 0) break; // final round: onComplete committed

          // Run the tool calls first: a search fills its chip's sources, and
          // the assistant message must carry those sources when it commits.
          // Each call is its own short request — a failure is a tool error
          // fed back to the model, never a lost stream.
          const toolMessages = [];
          for (const call of roundToolCalls) {
            const result = await executeClientTool(call, {
              conversationId: currentId,
              e2bApiKey,
              sandboxId,
              apiKey: getStoredApiKey(),
            });

            if (result.error) {
              toolMessages.push({
                role: "tool",
                content: `Error: ${result.error}`,
                tool_call_id: call.id,
              });
              if (SANDBOX_TOOL_NAMES.includes(call.name)) {
                updateSandboxTools((prev) =>
                  prev.map((t) =>
                    t.index === call.index
                      ? { ...t, status: "complete", stderr: result.error }
                      : t,
                  ),
                );
              }
              continue;
            }

            if (result.kind === "sandbox") {
              onSandboxResult({
                tool: call.name,
                code: result.data.code || result.data.command || "",
                stdout: result.data.stdout || "",
                stderr: result.data.stderr || "",
                exitCode: result.data.exitCode,
                sandboxId: result.data.sandboxId,
              });
              toolMessages.push({
                role: "tool",
                content: JSON.stringify(result.data),
                tool_call_id: call.id,
              });
            } else {
              if (call.name === "web_search") {
                onSearchResult?.(result.data.sources || []);
              }
              toolMessages.push({
                role: "tool",
                content: JSON.stringify(result.data.rawResult),
                tool_call_id: call.id,
              });
            }
          }

          // Advance the local history with this round's assistant text and
          // the tool results: this drives round N+1's /api/chat request. No
          // intermediate commit happens — the streaming stores flow through
          // into a single merged commit once the model finishes without tool
          // calls, avoiding one agent bubble per round.
          const cum = readTurnDeltas();
          const roundContent = cum.content.slice(prevCum.content.length);
          const roundThinking = (cum.thinking ?? "").slice(
            (prevCum.thinking ?? "").length,
          );
          prevCum = cum;
          const roundToolCallsWire = roundToolCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: {
              name: call.name,
              arguments: call.arguments,
            },
          }));
          // Keep the exchange for the commit: the loop's local history is
          // discarded once the turn ends, and without this the next turn's
          // request would carry the answer text but none of the tool output
          // behind it.
          turnToolCalls.push(...roundToolCallsWire);
          turnToolMessages.push(...toolMessages);

          roundMessages = [
            ...roundMessages,
            {
              role: "assistant",
              content: roundContent,
              ...(roundThinking ? { thinking: roundThinking } : {}),
              tool_calls: roundToolCallsWire,
            },
            ...toolMessages,
          ];
        }
      } catch (error) {
        isStreamingComplete.current = true;
        const { content: partialContent, thinking: partialThinking } =
          readTurnDeltas();
        clearTurnDeltas({
          streamingError: {
            title: "Error",
            details: error.message || "An unexpected error occurred.",
          },
          isLoading: false,
        });

        const errorMessage = {
          role: "assistant",
          content: partialContent,
          ...(partialThinking ? { thinking: partialThinking } : {}),
          error: {
            title: "Error",
            details: error.message || "An unexpected error occurred.",
          },
        };
        commitMessages([errorMessage]);
      } finally {
        isSubmittingRef.current = false;
      }
    },
    [
      agentModeEnabled,
      artifactsEnabled,
      maxTokens,
      selectedModel,
      thinkingEnabled,
      titleGenerationModel,
      toolsSupported,
      webSearchEnabled,
    ],
  );

  return {
    send,
    isLoading: turn.isLoading,
    streamingContent: turn.streamingContent,
    streamingThinking: turn.streamingThinking,
    streamingError: turn.streamingError,
    streamingSandboxTools: turn.streamingSandboxTools,
    streamingConversationId: turn.streamingConversationId,
    contextUsage: turn.contextUsage,
    resetForConversation,
  };
}
