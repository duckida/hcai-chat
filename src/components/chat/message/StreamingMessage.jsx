"use client";

import { memo, useMemo } from "react";
import { Streamdown } from "streamdown";
import { extractHtmlArtifacts } from "@/lib/artifacts";
import { normalizeLatexDelimiters } from "@/lib/latex";
import { useStreamdownPlugins } from "@/lib/streamdown";
import CustomLink from "../CustomLink";
import ThinkingIndicator from "../ThinkingIndicator";
import { AgentIndicator, WebSearchIndicator } from "./MessageParts";
import MessageRow from "./MessageRow";
import StreamingSandboxBlock from "./StreamingSandboxBlock";
import ThinkingBlock from "./ThinkingBlock";

const streamdownComponents = { a: CustomLink };
const STREAMDOWN_ANIMATED = {
  animation: "blurIn",
  duration: 200,
  easing: "ease-out",
};

const StreamingMessage = memo(function StreamingMessage({
  streamingContent,
  streamingThinking,
  thinkingEnabled,
  webSearchEnabled,
  agentModeEnabled,
  artifactsEnabled,
  streamingSandboxTools,
  showSandboxCode,
  showSandboxOutput,
  showThinking,
}) {
  const streamdownPlugins = useStreamdownPlugins();
  const { cleanedText, hasArtifact } = useMemo(() => {
    // Only treat ```html fences as artifacts when artifacts mode is on;
    // otherwise stream them as plain chat text.
    if (!artifactsEnabled) {
      return {
        cleanedText: normalizeLatexDelimiters(streamingContent || ""),
        hasArtifact: false,
      };
    }
    const {
      cleanedText: cleaned,
      artifacts,
      streamingArtifact,
    } = extractHtmlArtifacts(streamingContent || "");
    return {
      cleanedText: normalizeLatexDelimiters(cleaned),
      hasArtifact: artifacts.length > 0 || !!streamingArtifact,
    };
  }, [streamingContent, artifactsEnabled]);

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
      <MessageRow variant="assistant">
        {webSearchEnabled && <WebSearchIndicator isSearching={true} />}
        {agentModeEnabled && <AgentIndicator />}
        {streamingSandboxTools?.map((tool) => (
          <StreamingSandboxBlock
            key={tool.index}
            tool={tool}
            showSandboxCode={showSandboxCode}
            showSandboxOutput={showSandboxOutput}
          />
        ))}
        {streamingThinking && thinkingEnabled && (
          <ThinkingBlock
            thinking={streamingThinking}
            isStreaming={true}
            defaultView={showThinking ? "open" : "closed"}
          />
        )}
        {streamingContent && (
          <div className="max-w-none break-words leading-[1.8] text-foreground text-[15.5px] font-[450] selection:bg-accent overflow-x-auto">
            {cleanedText ? (
              <Streamdown
                mode="stream"
                caret="line"
                isAnimating={true}
                animated={STREAMDOWN_ANIMATED}
                plugins={streamdownPlugins}
                components={streamdownComponents}
              >
                {cleanedText}
              </Streamdown>
            ) : hasArtifact ? (
              <p className="text-sm text-muted-foreground italic">
                Generating artifact...
              </p>
            ) : (
              <span className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
                <span>Streaming</span>
                <ThinkingIndicator
                  size="sm"
                  className="text-muted-foreground"
                />
              </span>
            )}
          </div>
        )}
      </MessageRow>
    </div>
  );
});

export default StreamingMessage;
