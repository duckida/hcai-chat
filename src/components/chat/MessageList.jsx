"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { User, Sparkles, Brain, ChevronDown, ChevronUp, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { extractHtmlArtifacts } from "@/lib/artifacts";
import { Image } from "react-konva";

// Custom components for ReactMarkdown to render all markdown elements properly
const MarkdownComponents = {
  // Headings
  h1: ({ children }) => (
    <h1 className="text-3xl font-bold mt-6 mb-4 text-slate-900 leading-tight">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-2xl font-bold mt-5 mb-3 text-slate-800 leading-tight">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-xl font-bold mt-4 mb-2 text-slate-700 leading-tight">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-lg font-bold mt-3 mb-2 text-slate-700 leading-tight">
      {children}
    </h4>
  ),
  // Paragraphs - critical for line breaks
  p: ({ children }) => (
    <p className="mb-3 leading-relaxed whitespace-pre-wrap">{children}</p>
  ),
  // Unordered lists
  ul: ({ children }) => (
    <ul className="space-y-1 my-3 list-disc list-inside pl-4">{children}</ul>
  ),
  // Ordered lists
  ol: ({ children }) => (
    <ol className="space-y-1 my-3 list-decimal list-inside pl-4">{children}</ol>
  ),
  // List items with proper spacing
  li: ({ children }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  // Blockquotes
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-slate-300 pl-4 my-4 italic text-slate-600">
      {children}
    </blockquote>
  ),
  // Inline code
  code: ({ children, className }) => {
    if (className?.includes("language-")) return null; // Let SyntaxHighlighter handle code blocks
    return (
      <code className="bg-slate-100 text-sm text-red-600 px-1.5 py-0.5 rounded font-mono">
        {children}
      </code>
    );
  },
  // Code blocks with syntax highlighting via SyntaxHighlighter
  pre: ({ children, node }) => {
    const language = node?.children?.[0]?.props?.className?.replace(
      "language-",
      ""
    ) || "text";

    return (
      <div className="my-4 rounded-lg overflow-hidden border border-slate-200">
        <SyntaxHighlighter
          language={language}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            borderRadius: 0,
            fontSize: "13px",
            lineHeight: 1.5,
          }}
          showLineNumbers
          wrapLines
        >
          {children}
        </SyntaxHighlighter>
      </div>
    );
  },
  // Tables with proper styling
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table className="min-w-full table-auto border-collapse border border-slate-300">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-slate-100">{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-slate-200">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-4 py-2 text-left text-sm font-semibold text-slate-700 border-r border-slate-200">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2 text-sm text-slate-600 border-r border-slate-200">
      {children}
    </td>
  ),
  // Horizontal rules
  hr: () => <hr className="my-4 border-slate-200" />,
  // Bold text
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-900">{children}</strong>
  ),
  // Emphasis/italic
  em: ({ children }) => <em className="italic text-slate-700">{children}</em>,
  // Links
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 hover:text-blue-800 underline decoration-blue-300 hover:decoration-blue-500 transition-colors"
    >
      {children}
    </a>
  ),
  // Images
}

// Web search indicator component
function WebSearchIndicator({ isSearching }) {
  if (!isSearching) return null;

  return (
    <div className="flex items-center gap-2 text-sm text-slate-500 mb-3">
      <div className="flex items-center gap-1">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </span>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" style={{ animationDelay: '0.2s' }}></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" style={{ animationDelay: '0.2s' }}></span>
        </span>
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" style={{ animationDelay: '0.4s' }}></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" style={{ animationDelay: '0.4s' }}></span>
        </span>
      </div>
      <span className="text-slate-600">Searching the web</span>
    </div>
  );
}

// Message component for rendering individual messages
function Message({ message, isStreaming }) {
  const { role, content, thinking, sources } = message;
  const isUser = role === "user";
  const isAssistant = role === "assistant";
  
  return (
    <div
      className={`w-full flex gap-5 md:gap-7 px-6 py-8 ${
        isUser ? "bg-white" : "bg-slate-50/50"
      }`}
    >
      {/* Avatar */}
      <div
        className={`h-9 w-9 rounded-xl shrink-0 flex items-center justify-center shadow-lg ${
          isUser
            ? "bg-slate-700 text-white"
            : "bg-[#0f172a] text-white"
        }`}
      >
        {isUser ? (
          <User className="h-4.5 w-4.5" />
        ) : (
          <Sparkles className="h-4.5 w-4.5" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {thinking && (
          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 text-blue-700 text-sm font-medium mb-1">
              <Brain className="h-3.5 w-3.5" />
              Thinking
            </div>
            <div className="text-sm text-blue-800 whitespace-pre-wrap">
              {thinking}
            </div>
          </div>
        )}

        {content && (
          <div className="prose prose-slate max-w-none prose-sm md:prose-base">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={MarkdownComponents}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}

        {/* Sources */}
        {sources && sources.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <SourcesBlock sources={sources} />
          </div>
        )}
      </div>
    </div>
  );
}

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
      (messages.length > 0 ||
        streamingContent ||
        streamingThinking ||
        isLoading)
    ) {
      scrollRef.current.scrollToBottom();
    }
  }, [messages, streamingContent, streamingThinking, isLoading]);

  // Filter messages to exclude streaming content when not loading
  const activeMessages =
    streamingContent || streamingThinking ? [...messages] : messages;

  return (
    <ScrollArea
      ref={scrollRef}
      className="flex-1 h-full selection:bg-slate-200 pb-[96px]"
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
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                        {streamingContent || "Thinking..."}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Loading/Thinking indicator when isLoading but no streaming content yet */}
            {isLoading &&
              !streamingContent &&
              !streamingThinking &&
              thinkingEnabled && (
                <div className="w-full">
                  <div className="max-w-[700px] mx-auto px-6 py-8 flex gap-5 md:gap-7">
                    <div className="h-9 w-9 rounded-xl shrink-0 flex items-center justify-center bg-[#0f172a] text-white shadow-lg">
                      <Sparkles className="h-4.5 w-4.5" />
                    </div>
                    <div className="flex-1 space-y-4 overflow-hidden pt-1">
                      <ThinkingBlock thinking="" isStreaming={true} />
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
