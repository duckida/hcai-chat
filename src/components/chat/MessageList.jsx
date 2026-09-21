"use client";

import { ChevronDown } from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { hasRenderableContent } from "@/lib/messages";
import EmptyState from "./message/EmptyState";
import ErrorMessage from "./message/ErrorMessage";
import Message from "./message/Message";
import MessageRow from "./message/MessageRow";
import SandboxFiles from "./message/SandboxFiles";
import StreamingMessage from "./message/StreamingMessage";
import ThinkingBlock from "./message/ThinkingBlock";

export default function MessageList({
  messages,
  isLoading,
  streamingContent,
  streamingThinking,
  streamingError,
  thinkingEnabled,
  webSearchEnabled,
  agentModeEnabled = false,
  artifactsEnabled = false,
  streamingSandboxTools = [],
  showThinking = false,
  showSandboxCode = true,
  showSandboxOutput = true,
  showMetrics = true,
}) {
  const scrollRef = useRef(null);
  const [userScrolledAway, setUserScrolledAway] = useState(false);
  const isStreaming = !!(streamingContent || streamingThinking || isLoading);

  const deferredStreamingContent = useDeferredValue(streamingContent);
  const deferredStreamingThinking = useDeferredValue(streamingThinking);

  // A deferred value can lag behind the real one by a render. When a stream
  // ends we clear the live buffers, so a still-lagging deferred value would
  // momentarily render stale text and drop the final deltas — the visible
  // "response cuts off" symptom. Latch the last non-empty values so the tail
  // is never discarded while the persisted message takes over.
  const lastContentRef = useRef("");
  const lastThinkingRef = useRef("");
  if (streamingContent) lastContentRef.current = streamingContent;
  if (streamingThinking) lastThinkingRef.current = streamingThinking;

  const settledStreamingContent = deferredStreamingContent ?? "";
  const settledStreamingThinking = deferredStreamingThinking ?? "";

  const hasLiveStream = !!(streamingContent || streamingThinking || isLoading);

  // Once loading has stopped, keep showing the latched tail only until the
  // persisted assistant message is present, then let the message list own it.
  const lastMessage = messages?.[messages.length - 1];
  const tailAlreadyPersisted =
    !isLoading &&
    lastMessage?.role === "assistant" &&
    !!lastMessage?.content &&
    lastMessage.content === lastContentRef.current;

  const renderedStreamingContent =
    settledStreamingContent ||
    (hasLiveStream || tailAlreadyPersisted ? "" : lastContentRef.current);
  const renderedStreamingThinking =
    settledStreamingThinking ||
    (hasLiveStream || tailAlreadyPersisted ? "" : lastThinkingRef.current);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollHeight, scrollTop, clientHeight } = scrollRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const wasAway = distanceFromBottom > 100;
    setUserScrolledAway((prev) => (prev !== wasAway ? wasAway : prev));
  }, []);

  // Auto-scroll only when the user hasn't scrolled away
  useEffect(() => {
    if (
      scrollRef.current &&
      !userScrolledAway &&
      (messages.length > 0 ||
        streamingContent ||
        streamingThinking ||
        streamingError ||
        streamingSandboxTools.length > 0 ||
        isLoading)
    ) {
      scrollRef.current.scrollToBottom();
    }
  }, [
    messages,
    streamingContent,
    streamingThinking,
    streamingError,
    streamingSandboxTools,
    isLoading,
    userScrolledAway,
  ]);

  // Reset scroll-away state when streaming ends
  const prevIsStreaming = useRef(false);
  useEffect(() => {
    if (prevIsStreaming.current && !isStreaming) {
      setUserScrolledAway(false);
    }
    prevIsStreaming.current = isStreaming;
  }, [isStreaming]);

  const activeMessages = useMemo(
    () => (messages || []).filter(hasRenderableContent),
    [messages],
  );

  const hasContent =
    activeMessages.length > 0 ||
    streamingContent ||
    streamingThinking ||
    streamingError ||
    streamingSandboxTools.length > 0;

  const completedTool = streamingSandboxTools.find(
    (t) => t.status === "complete",
  );

  return (
    <div className="flex-1 h-full relative min-h-0 min-w-0">
      <ScrollArea
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full min-w-0 selection:bg-accent"
      >
        <div className="py-4 min-w-0">
          {!hasContent ? (
            <EmptyState />
          ) : (
            <>
              {activeMessages.map((message, index) => {
                if (message.error) {
                  return (
                    <ErrorMessage
                      key={`error-${message.id || index}`}
                      error={message.error}
                    />
                  );
                }
                return (
                  <Message
                    key={`${message.role}-${message.id || index}`}
                    message={message}
                    isStreaming={false}
                    artifactsEnabled={artifactsEnabled}
                    showThinking={showThinking}
                    showSandboxCode={showSandboxCode}
                    showSandboxOutput={showSandboxOutput}
                    showMetrics={showMetrics}
                  />
                );
              })}

              {(renderedStreamingContent || renderedStreamingThinking) && (
                <StreamingMessage
                  streamingContent={renderedStreamingContent}
                  streamingThinking={renderedStreamingThinking}
                  thinkingEnabled={thinkingEnabled}
                  webSearchEnabled={webSearchEnabled}
                  agentModeEnabled={agentModeEnabled}
                  artifactsEnabled={artifactsEnabled}
                  streamingSandboxTools={streamingSandboxTools}
                  showSandboxCode={showSandboxCode}
                  showSandboxOutput={showSandboxOutput}
                  showThinking={showThinking}
                />
              )}

              {isLoading &&
                !streamingContent &&
                !streamingThinking &&
                thinkingEnabled && (
                  <div className="w-full animate-in fade-in duration-300">
                    <MessageRow variant="assistant">
                      <ThinkingBlock
                        thinking=""
                        isStreaming={true}
                        defaultView={showThinking ? "open" : "closed"}
                      />
                    </MessageRow>
                  </div>
                )}

              {completedTool?.conversationId &&
                !isLoading &&
                !streamingContent &&
                !streamingThinking && (
                  <SandboxFiles
                    key={completedTool.conversationId}
                    conversationId={completedTool.conversationId}
                    sandboxId={completedTool.sandboxId}
                    autoFetch
                  />
                )}
            </>
          )}
        </div>
      </ScrollArea>
      {userScrolledAway && isStreaming && (
        <button
          type="button"
          onClick={() => {
            scrollRef.current?.scrollToBottom();
            setUserScrolledAway(false);
          }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 rounded-full bg-background border border-border shadow-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          Scroll to bottom
        </button>
      )}
    </div>
  );
}
