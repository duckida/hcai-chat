"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import {
  Brain,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Globe,
  ImageIcon,
  Loader2,
  Sparkles,
  User,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Streamdown } from "streamdown";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { extractHtmlArtifacts } from "@/lib/artifacts";
import { normalizeLatexDelimiters } from "@/lib/latex";
import CustomLink from "./CustomLink";
import ResponseMetrics from "./ResponseMetrics";

const math = createMathPlugin({ singleDollarTextMath: true });
const streamdownPlugins = { code, math, mermaid, cjk };
const streamdownComponents = { a: CustomLink };

const ThinkingBlock = ({
  thinking,
  isStreaming = false,
  defaultView = "closed",
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultView === "open");

  useEffect(() => {
    setIsExpanded(defaultView === "open");
  }, [defaultView]);

  if (!thinking && !isStreaming) return null;

  return (
    <div className="mb-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="text-xs text-slate-500 hover:text-slate-700 gap-1.5 h-7 px-2.5 rounded-lg"
      >
        {isStreaming && !isExpanded ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Brain className="w-3.5 h-3.5" />
        )}
        <span className="font-medium">Thinking</span>
        {isStreaming && !thinking && (
          <span className="flex gap-1 ml-1">
            <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce"></span>
            <span
              className="w-1 h-1 bg-slate-400 rounded-full animate-bounce"
              style={{ animationDelay: "0.1s" }}
            ></span>
            <span
              className="w-1 h-1 bg-slate-400 rounded-full animate-bounce"
              style={{ animationDelay: "0.2s" }}
            ></span>
          </span>
        )}
        {isExpanded ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
      </Button>
      {isExpanded && (
        <div className="mt-2 ml-1 p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm text-slate-600 leading-relaxed">
          {thinking ? (
            <Streamdown
              mode={isStreaming ? "stream" : "static"}
              caret={isStreaming ? "block" : false}
              isAnimating={isStreaming}
              plugins={streamdownPlugins}
              components={streamdownComponents}
            >
              {normalizeLatexDelimiters(thinking)}
            </Streamdown>
          ) : (
            <span className="text-slate-400 italic">Thinking...</span>
          )}
        </div>
      )}
    </div>
  );
};

const WebSearchIndicator = ({ isSearching = false }) => {
  if (!isSearching) return null;

  return (
    <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
      <Globe className="w-4 h-4 animate-pulse" />
      <span>Searching the web...</span>
      <span className="flex gap-1">
        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
        <span
          className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
          style={{ animationDelay: "0.1s" }}
        ></span>
        <span
          className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
          style={{ animationDelay: "0.2s" }}
        ></span>
      </span>
    </div>
  );
};

const SourcesBlock = ({ sources }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-slate-200">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="mb-2 h-7 gap-1.5 rounded-lg px-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700"
      >
        <Globe className="w-3.5 h-3.5" />
        <span>Sources ({sources.length})</span>
        {isExpanded ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
      </Button>
      {isExpanded && (
        <div className="space-y-1.5">
          {sources.map((source, index) => {
            const sourceKey =
              typeof source === "string"
                ? source
                : source.id ||
                  source.url ||
                  source.title ||
                  `source-${index + 1}`;

            return (
              <div
                key={sourceKey}
                className="text-xs text-slate-600 bg-slate-50 px-3 py-2 rounded-lg flex items-start gap-2"
              >
                <span className="text-slate-400 shrink-0">{index + 1}.</span>
                <div className="flex-1 min-w-0">
                  {typeof source === "string" ? (
                    <span>{source}</span>
                  ) : (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 underline underline-offset-4 decoration-blue-300 hover:decoration-blue-600 transition-colors break-all inline-flex items-center gap-1"
                    >
                      {source.title || source.url || `Source ${index + 1}`}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

function getMessageText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n");
  }
  return "";
}

function getUserText(content) {
  if (typeof content === "string") return content;
  if (
    Array.isArray(content) &&
    content.length > 0 &&
    content[0].type === "text"
  ) {
    return content[0].text;
  }
  return "";
}

const ImageAttachment = ({ src, alt }) => {
  const [loaded, setLoaded] = useState(false);
  const content = (
    <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 max-w-md cursor-pointer transition-shadow hover:shadow-md">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
          <ImageIcon className="w-6 h-6 text-slate-300" />
        </div>
      )}
      <img
        src={src}
        alt={alt || "Image attachment"}
        onLoad={() => setLoaded(true)}
        className={`w-full h-auto max-h-80 object-contain ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );

  if (src?.startsWith("http")) {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }

  return content;
};

const FileBubble = ({ file }) => {
  const content = (
    <div className="inline-flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 shadow-sm cursor-default transition-shadow hover:shadow-md">
      <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
        <FileText className="w-5 h-5 text-blue-600" />
      </div>
      <div className="min-w-0 max-w-[200px]">
        <p className="text-sm font-medium text-slate-700 truncate">
          {file.name}
        </p>
        <p className="text-xs text-slate-400">
          {file.size < 1024 * 1024
            ? `${Math.round(file.size / 1024)} KB`
            : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}
        </p>
      </div>
    </div>
  );

  if (file.url) {
    return (
      <a href={file.url} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }

  return content;
};

const Message = ({
  message,
  isStreaming = false,
  thinkingDefaultView = "closed",
  showMetrics = true,
}) => {
  const isAssistant = message.role === "assistant";
  const content = message.content || "";
  const attachments = message._files;
  const text = attachments ? getUserText(content) : getMessageText(content);
  const { cleanedText, artifacts } = extractHtmlArtifacts(text);
  const renderedText = normalizeLatexDelimiters(cleanedText);
  const hasSources = message.sources && message.sources.length > 0;

  // Extract image sources from content parts for rendering
  const contentImages = useMemo(() => {
    if (!Array.isArray(message.content)) return [];
    return message.content
      .filter((p) => p.type === "image")
      .map((p) => p.image);
  }, [message.content]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="w-full"
    >
      <div className="max-w-[700px] mx-auto px-4 sm:px-6 py-5 sm:py-8 flex gap-3 sm:gap-5 md:gap-7">
        <div
          className={`h-8 w-8 sm:h-9 sm:w-9 rounded-xl shrink-0 flex items-center justify-center ${
            isAssistant
              ? "bg-primary text-primary-foreground shadow-lg"
              : "bg-[#f1f5f9] text-slate-400 border border-slate-200"
          }`}
        >
          {isAssistant ? (
            <Sparkles className="h-4.5 w-4.5" />
          ) : (
            <User className="h-4.5 w-4.5" />
          )}
        </div>
        <div className="flex-1 space-y-4 overflow-hidden pt-1">
          {isAssistant && (
            <ThinkingBlock
              thinking={message.thinking}
              defaultView={thinkingDefaultView}
            />
          )}

          {isAssistant && message.webSearch && !isStreaming && (
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
              <Globe className="w-4 h-4 text-green-600" />
              <span className="text-green-600 font-medium">Web Search</span>
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

          <div className="max-w-none break-words leading-[1.8] text-slate-800 text-[15.5px] font-[450] selection:bg-slate-200">
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
              <p className="text-sm text-slate-400 italic">
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
        </div>
      </div>
    </motion.div>
  );
};

export default function MessageList({
  messages,
  isLoading,
  streamingContent,
  streamingThinking,
  thinkingEnabled,
  webSearchEnabled,
  thinkingDefaultView = "closed",
  showMetrics = true,
}) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (
      scrollRef.current &&
      (messages.length > 0 ||
        streamingContent ||
        streamingThinking ||
        isLoading)
    ) {
      scrollRef.current.scrollToBottom();
    }
  }, [messages, streamingContent, streamingThinking, isLoading]);

  const activeMessages =
    streamingContent || streamingThinking
      ? [...(messages || [])]
      : messages || [];

  const hasContent =
    activeMessages.length > 0 || streamingContent || streamingThinking;

  return (
    <ScrollArea
      ref={scrollRef}
      className="flex-1 h-full selection:bg-slate-200"
    >
      <div className="py-4">
        {!hasContent ? (
          <div className="flex flex-col items-center justify-center min-h-[65vh] text-center opacity-40 select-none px-4 sm:px-6">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-[2rem] bg-slate-900 text-white flex items-center justify-center shadow-2xl mb-6 sm:mb-8 transform hover:scale-110 transition-transform duration-500">
              <Sparkles className="h-7 w-7 sm:h-8 sm:w-8" />
            </div>
            <h1 className="text-xl sm:text-2xl font-[800] tracking-[-0.03em] text-slate-900 mb-2 uppercase">
              Hack Club AI
            </h1>
            <p className="text-[12px] sm:text-[13px] font-medium text-slate-500 max-w-[260px] sm:max-w-[280px] leading-relaxed">
              Modern open source intelligence. Start a conversation to get
              started.
            </p>
          </div>
        ) : (
          <>
            {activeMessages
              .filter((message) => {
                if (message.role === "user") {
                  if (
                    typeof message.content === "string" &&
                    message.content.trim()
                  )
                    return true;
                  if (
                    Array.isArray(message.content) &&
                    message.content.length > 0
                  )
                    return true;
                  return false;
                }
                if (message.role === "tool") return false;
                const messageText =
                  typeof message.content === "string"
                    ? message.content
                    : getMessageText(message.content);
                const { artifacts } = extractHtmlArtifacts(messageText);
                return (
                  messageText.trim() !== "" ||
                  artifacts.length > 0 ||
                  (message.thinking && message.thinking.trim() !== "")
                );
              })
              .map((message, index) => (
                <Message
                  key={`${message.role}-${message.id || index}`}
                  message={message}
                  isStreaming={false}
                  thinkingDefaultView={thinkingDefaultView}
                  showMetrics={showMetrics}
                />
              ))}

            {(streamingContent || streamingThinking) && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="w-full"
              >
                <div className="max-w-[700px] mx-auto px-4 sm:px-6 py-5 sm:py-8 flex gap-3 sm:gap-5 md:gap-7">
                  <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl shrink-0 flex items-center justify-center bg-primary text-primary-foreground shadow-lg">
                    <Sparkles className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                  </div>
                  <div className="flex-1 space-y-4 overflow-hidden pt-1">
                    {webSearchEnabled && (
                      <WebSearchIndicator isSearching={true} />
                    )}
                    {streamingThinking && thinkingEnabled && (
                      <ThinkingBlock
                        thinking={streamingThinking}
                        isStreaming={true}
                        defaultView={thinkingDefaultView}
                      />
                    )}
                    {streamingContent && (
                      <div className="max-w-none break-words leading-[1.8] text-slate-800 text-[15.5px] font-[450] selection:bg-slate-200">
                        {normalizeLatexDelimiters(
                          extractHtmlArtifacts(streamingContent).cleanedText,
                        ) ? (
                          <Streamdown
                            mode="stream"
                            caret="block"
                            isAnimating={true}
                            plugins={streamdownPlugins}
                            components={streamdownComponents}
                          >
                            {normalizeLatexDelimiters(
                              extractHtmlArtifacts(streamingContent)
                                .cleanedText,
                            )}
                          </Streamdown>
                        ) : (
                          <div className="opacity-50 italic text-sm">
                            Streaming content...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {isLoading &&
              !streamingContent &&
              !streamingThinking &&
              thinkingEnabled && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="w-full"
                >
                  <div className="max-w-[700px] mx-auto px-4 sm:px-6 py-5 sm:py-8 flex gap-3 sm:gap-5 md:gap-7">
                    <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl shrink-0 flex items-center justify-center bg-primary text-primary-foreground shadow-lg">
                      <Sparkles className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                    </div>
                    <div className="flex-1 space-y-4 overflow-hidden pt-1">
                      <ThinkingBlock
                        thinking=""
                        isStreaming={true}
                        defaultView={thinkingDefaultView}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
          </>
        )}
      </div>
    </ScrollArea>
  );
}
