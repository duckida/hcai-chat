"use client";

import { EyeOff, Globe } from "lucide-react";
import { memo, useMemo } from "react";
import { getMessageText, getUserText } from "@/lib/messages";
import { useSettings } from "@/stores/settings";
import ResponseMetrics from "../ResponseMetrics";
import InlineView from "./InlineView";
import Markdown, { MESSAGE_BODY_CLASS } from "./Markdown";
import ImageAttachment, { FileBubble } from "./MessageParts";
import MessageRow from "./MessageRow";
import SourcesBlock from "./SourcesBlock";
import ThinkingBlock from "./ThinkingBlock";
import useMessageText from "./useMessageText";

/**
 * How a persisted message presents itself — artifacts, inline views,
 * reasoning, metrics — is all display settings, so a committed message reads
 * them itself rather than being handed flags it never varies. Sandbox runs
 * deliberately do not appear here: their transcript lives in the Cloud sandbox
 * side panel.
 */
const selectDisplaySettings = (state) => ({
  artifactsEnabled: state.artifactsEnabled,
  inlineViewsEnabled: state.inlineViewsEnabled,
  inlineViewModel: state.inlineViewModel,
  openRouterProviders: state.openRouterProviders,
  showThinking: state.showThinking,
  showMetrics: state.showMetrics,
});

const Message = memo(function Message({ message }) {
  const {
    artifactsEnabled,
    inlineViewsEnabled,
    inlineViewModel,
    openRouterProviders,
    showThinking,
    showMetrics,
  } = useSettings(selectDisplaySettings);
  const isAssistant = message.role === "assistant";
  const content = message.content || "";
  const attachments = message._files;
  const text = attachments ? getUserText(content) : getMessageText(content);

  const { parts, artifacts, inlineViews, hiddenInlineViews } = useMessageText(
    text,
    { artifactsEnabled, inlineViewsEnabled },
  );
  const hasText = parts.some((part) => part.type === "text");
  const hasSources = message.sources && message.sources.length > 0;

  // Extract image sources from content parts for rendering
  const contentImages = useMemo(() => {
    if (!Array.isArray(message.content)) return [];
    return message.content
      .filter((p) => p.type === "image" && !!p.image)
      .map((p) => p.image);
  }, [message.content]);

  const hasVisibleBody =
    hasText ||
    (isAssistant && (inlineViews.length > 0 || hiddenInlineViews > 0)) ||
    artifacts.length > 0 ||
    contentImages.length > 0 ||
    (attachments && attachments.length > 0) ||
    !!message.thinking ||
    (message.thinkingChips && message.thinkingChips.length > 0) ||
    hasSources ||
    !!message.webSearch ||
    (showMetrics && !!message.metrics);

  if (!hasVisibleBody) return null;

  return (
    <div className="w-full animate-hcai-fade-in-slow">
      <MessageRow variant={message.role}>
        {isAssistant && (
          <ThinkingBlock
            thinking={message.thinking}
            chips={message.thinkingChips}
            defaultView={showThinking ? "open" : "closed"}
          />
        )}

        {isAssistant && message.webSearch && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Globe className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-green-600 dark:text-green-400 font-medium">
              Web Search
            </span>
          </div>
        )}

        {!isAssistant &&
          (contentImages.length > 0 ||
            attachments?.some((f) => !f.type?.startsWith("image/"))) && (
            <div className="flex flex-wrap gap-2.5">
              {contentImages.map((src, i) => (
                <ImageAttachment
                  key={src || i}
                  src={src}
                  alt={`Image ${i + 1}`}
                />
              ))}
              {attachments
                ?.filter((f) => !f.type?.startsWith("image/"))
                .map((file) => (
                  <FileBubble key={file.id} file={file} />
                ))}
            </div>
          )}

        {isAssistant ? (
          <div className={MESSAGE_BODY_CLASS}>
            {parts.map((part) =>
              part.type === "inline" ? (
                <InlineView
                  key={part.key}
                  prompt={part.prompt}
                  title={part.title}
                  model={inlineViewModel}
                  providerSlug={openRouterProviders?.[inlineViewModel] || null}
                />
              ) : (
                <Markdown key={part.key}>{part.text}</Markdown>
              ),
            )}
            {!hasText && artifacts.length > 0 && (
              <p className="text-sm text-muted-foreground italic">
                Artifact generated
              </p>
            )}
            {hiddenInlineViews > 0 && (
              <div className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-3 py-2 text-[12px] font-medium text-muted-foreground">
                <EyeOff className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {hiddenInlineViews === 1
                    ? "Inline view hidden"
                    : `${hiddenInlineViews} inline views hidden`}
                </span>
                <span className="text-muted-foreground/60">
                  · enable Inline Views in Settings
                </span>
              </div>
            )}
          </div>
        ) : (
          (hasText || artifacts.length > 0) && (
            <div className="w-fit max-w-full rounded-3xl border border-primary/25 bg-[color-mix(in_oklab,var(--primary)_14%,var(--background))] px-4 py-2.5">
              <div className={MESSAGE_BODY_CLASS}>
                {parts
                  .filter((part) => part.type === "text")
                  .map((part) => (
                    <Markdown key={part.key}>{part.text}</Markdown>
                  ))}
                {!hasText && artifacts.length > 0 && (
                  <p className="text-sm text-muted-foreground italic">
                    Artifact generated
                  </p>
                )}
              </div>
            </div>
          )
        )}

        {isAssistant && hasSources && (
          <SourcesBlock sources={message.sources} />
        )}

        {isAssistant && showMetrics && message.metrics && (
          <ResponseMetrics
            usage={message.metrics}
            duration={message.metrics.duration}
          />
        )}
      </MessageRow>
    </div>
  );
});

export default Message;
