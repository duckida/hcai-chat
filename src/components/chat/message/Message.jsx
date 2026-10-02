"use client";

import { Globe } from "lucide-react";
import { memo, useMemo } from "react";
import { getMessageText, getUserText } from "@/lib/messages";
import { useSettings } from "@/stores/settings";
import ResponseMetrics from "../ResponseMetrics";
import Markdown, { MESSAGE_BODY_CLASS } from "./Markdown";
import ImageAttachment, { FileBubble } from "./MessageParts";
import MessageRow from "./MessageRow";
import SourcesBlock from "./SourcesBlock";
import ThinkingBlock from "./ThinkingBlock";
import useMessageText from "./useMessageText";

/**
 * How a persisted message presents itself — artifacts, reasoning, metrics —
 * is all display settings, so a committed message reads them itself rather
 * than being handed flags it never varies. Sandbox runs deliberately do not
 * appear here: their transcript lives in the Cloud sandbox side panel.
 */
const selectDisplaySettings = (state) => ({
  artifactsEnabled: state.artifactsEnabled,
  showThinking: state.showThinking,
  showMetrics: state.showMetrics,
});

const Message = memo(function Message({ message }) {
  const { artifactsEnabled, showThinking, showMetrics } = useSettings(
    selectDisplaySettings,
  );
  const isAssistant = message.role === "assistant";
  const content = message.content || "";
  const attachments = message._files;
  const text = attachments ? getUserText(content) : getMessageText(content);

  const { text: renderedText, artifacts } = useMessageText(text, {
    artifactsEnabled,
  });
  const hasSources = message.sources && message.sources.length > 0;

  // Extract image sources from content parts for rendering
  const contentImages = useMemo(() => {
    if (!Array.isArray(message.content)) return [];
    return message.content
      .filter((p) => p.type === "image" && !!p.image)
      .map((p) => p.image);
  }, [message.content]);

  const hasVisibleBody =
    !!renderedText ||
    artifacts.length > 0 ||
    contentImages.length > 0 ||
    (attachments && attachments.length > 0) ||
    !!message.thinking ||
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

        {!isAssistant && (
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

        <div className={MESSAGE_BODY_CLASS}>
          {renderedText && <Markdown>{renderedText}</Markdown>}
          {!renderedText && artifacts.length > 0 && (
            <p className="text-sm text-muted-foreground italic">
              Artifact generated
            </p>
          )}
        </div>

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
