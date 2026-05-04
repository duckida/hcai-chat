"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  User,
  Sparkles,
  Brain,
  ChevronDown,
  ChevronUp,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { extractHtmlArtifacts } from "@/lib/artifacts";

const ThinkingBlock = ({ thinking, isStreaming = false }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!thinking && !isStreaming) return null;

  return (
    <div className="mb-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="text-xs text-slate-500 hover:text-slate-700 gap-1.5 h-7 px-2.5 rounded-lg"
      >
        <Brain className="w-3.5 h-3.5" />
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
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {thinking}
            </ReactMarkdown>
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
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-slate-200">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
        <Globe className="w-3.5 h-3.5" />
        Sources
      </div>
      <div className="space-y-1.5">
        {sources.map((source, index) => (
          <div
            key={index}
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
                  className="text-blue-600 hover:underline break-all"
                >
                  {source.title || source.url || `Source ${index + 1}`}
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Message = ({ message, isStreaming = false }) => {
  const isAssistant = message.role === "assistant";
  const { cleanedText: content } = extractHtmlArtifacts(message.content);
  const hasSources = message.sources && message.sources.length > 0;

  return (
    <div className="w-full">
      <div className="max-w-[700px] mx-auto px-6 py-8 flex gap-5 md:gap-7">
        <div
          className={`h-9 w-9 rounded-xl shrink-0 flex items-center justify-center ${isAssistant ? "bg-[#0f172a] text-white shadow-lg" : "bg-[#f1f5f9] text-slate-400 border border-slate-200"}`}
        >
          {isAssistant ? (
            <Sparkles className="h-4.5 w-4.5" />
          ) : (
            <User className="h-4.5 w-4.5" />
          )}
        </div>
        <div className="flex-1 space-y-4 overflow-hidden pt-1">
          {isAssistant && <ThinkingBlock thinking={message.thinking} />}

          {/* Web search indicator */}
          {isAssistant && message.webSearch && !isStreaming && (
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
              <Globe className="w-4 h-4 text-green-600" />
              <span className="text-green-600 font-medium">Web Search</span>
            </div>
          )}

          <div className="prose prose-slate max-w-none break-words leading-[1.8] text-slate-800 text-[15.5px] font-[450] selection:bg-slate-200">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>

          {/* Sources block */}
          {isAssistant && hasSources && (
            <SourcesBlock sources={message.sources} />
          )}
        </div>
      </div>
    </div>
  );
};

export default function MessageList({
  messages,
  isLoading,
  streamingContent,
  streamingThinking,
  thinkingEnabled,
  webSearchEnabled,
}) {
  const scrollRef = useRef(null);

  // Scroll to bottom whenever messages or streaming data change
  useEffect(() => {
    if (
      scrollRef.current &&
      (messages.length > 0 || streamingContent || streamingThinking)
    ) {
      scrollRef.current.scrollToBottom();
    }
  }, [messages, streamingContent, streamingThinking]);

  // Filter messages to exclude streaming content when not loading
  const activeMessages =
    streamingContent || streamingThinking ? [...messages] : messages;

  return (
    <ScrollArea
      ref={scrollRef}
      className="flex-1 h-full selection:bg-slate-200"
    >
      <div className="py-4">
        {activeMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[65vh] text-center opacity-40 select-none px-6">
            <div className="w-16 h-16 rounded-[2rem] bg-slate-900 text-white flex items-center justify-center shadow-2xl mb-8 transform hover:scale-110 transition-transform duration-500">
              <Sparkles className="h-8 w-8" />
            </div>
            <h1 className="text-2xl font-[800] tracking-[-0.03em] text-slate-900 mb-2 uppercase">
              Hack Club AI
            </h1>
            <p className="text-[13px] font-medium text-slate-500 max-w-[280px] leading-relaxed">
              Modern open source intelligence. Start a conversation to get
              started.
            </p>
          </div>
        ) : (
          <>
            {activeMessages.map((message, index) => (
              <Message
                key={`${message.role}-${index}-${message.content?.slice(0, 20)}`}
                message={message}
                isStreaming={false}
              />
            ))}

            {/* Streaming content */}
            {(streamingContent || streamingThinking) && (
              <div className="w-full">
                <div className="max-w-[700px] mx-auto px-6 py-8 flex gap-5 md:gap-7">
                  <div className="h-9 w-9 rounded-xl shrink-0 flex items-center justify-center bg-[#0f172a] text-white shadow-lg">
                    <Sparkles className="h-4.5 w-4.5" />
                  </div>
                  <div className="flex-1 space-y-4 overflow-hidden pt-1">
                    {/* Web search indicator during streaming */}
                    {webSearchEnabled && (
                      <WebSearchIndicator isSearching={true} />
                    )}

                    {streamingThinking && thinkingEnabled && (
                      <ThinkingBlock
                        thinking={streamingThinking}
                        isStreaming={true}
                      />
                    )}
                    <div className="prose prose-slate max-w-none break-words leading-[1.8] text-slate-800 text-[15.5px] font-[450] selection:bg-slate-200">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {streamingContent || "Thinking..."}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ScrollArea>
  );
}
