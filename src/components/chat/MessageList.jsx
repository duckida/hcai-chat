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
  activeConversation = null,
  streamingConversationId = null,
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

  const deferredStreamingContent = useDeferredValue(streamingContent);
  const deferredStreamingThinking = useDeferredValue(streamingThinking);

  // Only the stream owned by the conversation on screen may render — a stream
  // running for another conversation must never leak its text, thinking,
  // placeholder, or sandbox blocks into this one.
  const streamVisible =
    streamingConversationId == null ||
    streamingConversationId === activeConversation;

  const isStreaming =
    streamVisible && !!(streamingContent || streamingThinking || isLoading);

  // While the stream is live, render the deferred values (they lag the raw
  // buffers by at most one render, purely for responsiveness). The instant the
  // stream ends, isLoading and the raw buffers clear in the same batch that
  // commits the persisted assistant message, so the stream row disappears on
  // exactly the frame the persisted message appears — no latches, no stale
  // tails, no duplicated rows. The commit is built from live accumulators, so
  // the tail is never dropped here.
  const renderedStreamingContent = isStreaming
    ? (deferredStreamingContent ?? "")
    : "";
  const renderedStreamingThinking = isStreaming
    ? (deferredStreamingThinking ?? "")
    : "";

  const liveStreamingError = streamVisible ? streamingError : null;
  const liveSandboxTools = useMemo(
    () => (streamVisible ? streamingSandboxTools : []),
    [streamVisible, streamingSandboxTools],
  );

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
        renderedStreamingContent ||
        renderedStreamingThinking ||
        liveStreamingError ||
        liveSandboxTools.length > 0 ||
        isLoading)
    ) {
      scrollRef.current.scrollToBottom();
    }
  }, [
    messages,
    renderedStreamingContent,
    renderedStreamingThinking,
    liveStreamingError,
    liveSandboxTools,
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

  const hasStreamingMessage =
    !!renderedStreamingContent ||
    !!renderedStreamingThinking ||
    liveSandboxTools.length > 0;

  const hasContent =
    activeMessages.length > 0 || hasStreamingMessage || !!liveStreamingError;

  const completedTool = liveSandboxTools.find((t) => t.status === "complete");

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
                  streamingSandboxTools={liveSandboxTools}
                  showSandboxCode={showSandboxCode}
                  showSandboxOutput={showSandboxOutput}
                  showThinking={showThinking}
                />
              )}

              {isStreaming &&
                !renderedStreamingContent &&
                !renderedStreamingThinking &&
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
                !renderedStreamingContent &&
                !renderedStreamingThinking && (
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
