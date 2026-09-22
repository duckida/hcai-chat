"use client";

import { Globe } from "lucide-react";
import { memo, useMemo } from "react";
import { Streamdown } from "streamdown";
import { extractHtmlArtifacts } from "@/lib/artifacts";
import { normalizeLatexDelimiters } from "@/lib/latex";
import { getMessageText, getUserText } from "@/lib/messages";
import { useStreamdownPlugins } from "@/lib/streamdown";
import CustomLink from "../CustomLink";
import ResponseMetrics from "../ResponseMetrics";
import ImageAttachment, { FileBubble } from "./MessageParts";
import MessageRow from "./MessageRow";
import SourcesBlock from "./SourcesBlock";
import StreamingSandboxBlock from "./StreamingSandboxBlock";
import ThinkingBlock from "./ThinkingBlock";

const streamdownComponents = { a: CustomLink };

const Message = memo(function Message({
  message,
  isStreaming = false,
  artifactsEnabled = false,
  showThinking = false,
  showSandboxCode = true,
  showSandboxOutput = true,
  showMetrics = true,
}) {
  const streamdownPlugins = useStreamdownPlugins();
  const isAssistant = message.role === "assistant";
  const content = message.content || "";
  const attachments = message._files;
  const text = attachments ? getUserText(content) : getMessageText(content);

  const { cleanedText, artifacts } = useMemo(() => {
    // Only strip ```html fences into artifacts when artifacts mode is on;
    // otherwise render them as plain chat text.
    if (!artifactsEnabled) return { cleanedText: text, artifacts: [] };
    return extractHtmlArtifacts(text);
  }, [text, artifactsEnabled]);
  const renderedText = useMemo(
    () => normalizeLatexDelimiters(cleanedText),
    [cleanedText],
  );
  const hasSources = message.sources && message.sources.length > 0;

  // Extract image sources from content parts for rendering
  const contentImages = useMemo(() => {
    if (!Array.isArray(message.content)) return [];
    return message.content
      .filter((p) => p.type === "image")
      .map((p) => p.image);
  }, [message.content]);

  return (
    <div className="w-full animate-in fade-in duration-300">
      <MessageRow variant={message.role}>
        {isAssistant && (
          <ThinkingBlock
            thinking={message.thinking}
            defaultView={showThinking ? "open" : "closed"}
          />
        )}

        {isAssistant && message.webSearch && !isStreaming && (
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

        <div className="max-w-none break-words leading-[1.8] text-foreground text-[15.5px] font-[450] selection:bg-accent overflow-x-auto">
          {renderedText && (
            <Streamdown
              mode="static"
              plugins={streamdownPlugins}
              components={streamdownComponents}
            >
              {renderedText}
            </Streamdown>
          )}
          {!renderedText && artifacts.length > 0 && (
            <p className="text-sm text-muted-foreground italic">
              Artifact generated
            </p>
          )}
        </div>

        {isAssistant && hasSources && (
          <SourcesBlock sources={message.sources} />
        )}

        {isAssistant && message.sandboxResults?.length > 0 && (
          <div className="space-y-2">
            {message.sandboxResults.map((result, i) => (
              <StreamingSandboxBlock
                key={`${result.tool}-${result.code || result.command || i}`}
                tool={{
                  index: i,
                  tool: result.tool,
                  code: result.code || result.command || "",
                  status: "complete",
                  stdout: result.stdout || "",
                  stderr: result.stderr || "",
                  exitCode: result.exitCode,
                  conversationId: result.conversationId,
                  sandboxId: result.sandboxId,
                }}
                showSandboxCode={showSandboxCode}
                showSandboxOutput={showSandboxOutput}
              />
            ))}
          </div>
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
