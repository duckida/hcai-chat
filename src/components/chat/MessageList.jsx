"use client";

import { ChevronDown } from "lucide-react";
import { Fragment, useMemo } from "react";
import { useThreadScroll } from "@/hooks/use-thread-scroll";
import { hasRenderableContent } from "@/lib/messages";
import { isThinkingOn } from "@/lib/thinking";
import { useSettings } from "@/stores/settings";
import { useTurn } from "@/stores/turn";
import EmptyState from "./message/EmptyState";
import ErrorMessage from "./message/ErrorMessage";
import Message from "./message/Message";
import MessageRow from "./message/MessageRow";
import SandboxFiles from "./message/SandboxFiles";
import StreamingMessage from "./message/StreamingMessage";
import ThinkingBlock from "./message/ThinkingBlock";

/** Only what the "still thinking, nothing on screen yet" placeholder needs. */
const selectPlaceholderSettings = (state) => ({
  thinkingLevel: state.thinkingLevel,
  showThinking: state.showThinking,
});

/**
 * The thread renders two stores and one prop.
 *
 * How the conversation should look is a display setting and how the current
 * turn is going is turn state, so both are looked up where they are written
 * instead of being threaded down from ChatApp through sixteen props. The
 * conversation on screen stays a prop: it is a view concern, and it is the one
 * thing that decides whether a running stream belongs on this screen at all.
 */
export default function MessageList({ messages, activeConversation = null }) {
  const {
    isLoading,
    streamingContent,
    streamingThinking,
    streamingError,
    streamingSandboxTools,
    streamingToolChips,
    streamingConversationId,
  } = useTurn();
  const { thinkingLevel, showThinking } = useSettings(
    selectPlaceholderSettings,
  );
  const thinkingOn = isThinkingOn(thinkingLevel);
  const activeMessages = useMemo(
    () => (messages || []).filter(hasRenderableContent),
    [messages],
  );

  // Only the stream owned by the conversation on screen may render — a stream
  // running for another conversation must never leak its text, thinking or
  // placeholder into this one. The sandbox transcript lives in the side panel,
  // which gates its own copy of the same values the same way.
  const streamVisible =
    streamingConversationId == null ||
    streamingConversationId === activeConversation;

  const isStreaming =
    streamVisible && !!(streamingContent || streamingThinking || isLoading);

  // The stream row shows exactly what is live: the instant the turn ends,
  // isLoading and the streaming values clear in the same batch that commits
  // the persisted assistant message, so the row disappears on exactly the
  // frame the persisted message appears — no latches, no stale tails, no
  // duplicated rows. The committed answer is built from the store's live
  // accumulators, so the tail is never dropped.
  const renderedStreamingContent = isStreaming ? streamingContent : "";
  const renderedStreamingThinking = isStreaming ? streamingThinking : "";

  const liveStreamingError = streamVisible ? streamingError : null;
  const liveSandboxTools = useMemo(
    () => (streamVisible ? streamingSandboxTools : []),
    [streamVisible, streamingSandboxTools],
  );
  const liveToolChips = useMemo(
    () => (streamVisible ? streamingToolChips : []),
    [streamVisible, streamingToolChips],
  );

  const { scrollRef, userScrolledAway, handleScroll, scrollToBottom } =
    useThreadScroll({ isStreaming });

  const hasContent =
    activeMessages.length > 0 ||
    !!renderedStreamingContent ||
    !!renderedStreamingThinking ||
    liveSandboxTools.length > 0 ||
    liveToolChips.length > 0 ||
    !!liveStreamingError;

  const completedTool = liveSandboxTools.find((t) => t.status === "complete");

  return (
    <div className="flex-1 h-full relative min-h-0 min-w-0">
      {/*
        A labelled section rather than a bare scroll box: a scrollable area has
        to be reachable and labelled, or it is invisible to anyone navigating
        by keyboard or by landmark. `scrollbar-gutter: stable` reserves the
        scrollbar's width for the life of the conversation, so the thread
        cannot shift sideways the moment the first long answer makes it
        scrollable. `overscroll-contain` stops a trackpad that reaches the top
        or bottom from taking the rest of the page with it.
      */}
      {/* biome-ignore-start lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable for arrow-key scrolling (WCAG 2.1.1) */}
      <section
        ref={scrollRef}
        onScroll={handleScroll}
        aria-label="Conversation"
        tabIndex={0}
        className="h-full min-h-0 min-w-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] selection:bg-accent"
      >
        <div className="py-4 min-w-0">
          {!hasContent ? (
            <EmptyState />
          ) : (
            <>
              {activeMessages.map((message, index) => {
                if (message.error) {
                  // A failed turn may still hold the partial it wrote before
                  // it died — show that text above the card instead of
                  // hiding it. An error with no body renders the card alone,
                  // exactly as before.
                  const partial = hasRenderableContent({
                    ...message,
                    error: undefined,
                  });
                  return (
                    <Fragment key={`error-${message.id || index}`}>
                      {partial && (
                        <Message message={{ ...message, error: undefined }} />
                      )}
                      <ErrorMessage error={message.error} />
                    </Fragment>
                  );
                }
                return (
                  <Message
                    key={`${message.role}-${message.id || index}`}
                    message={message}
                  />
                );
              })}

              {/*
                A running sandbox tool still counts as content, even though its
                transcript moved to the side panel: the row has to exist while
                the run is quiet, or a turn that wrote and ran code before the
                model said anything would show an empty thread until the reply
                arrived.
              */}
              {(renderedStreamingContent ||
                renderedStreamingThinking ||
                liveSandboxTools.length > 0 ||
                liveToolChips.length > 0) && (
                <StreamingMessage
                  streamingContent={renderedStreamingContent}
                  streamingThinking={renderedStreamingThinking}
                  streamingToolChips={liveToolChips}
                />
              )}

              {isStreaming &&
                !renderedStreamingContent &&
                !renderedStreamingThinking &&
                liveToolChips.length === 0 &&
                thinkingOn && (
                  <div className="w-full animate-hcai-fade-in-slow">
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
      </section>
      {/* biome-ignore-end lint/a11y/noNoninteractiveTabindex: see above */}
      {userScrolledAway && isStreaming && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 rounded-full bg-background border border-border shadow-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          Scroll to bottom
        </button>
      )}
    </div>
  );
}
