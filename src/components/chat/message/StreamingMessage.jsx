"use client";

import { memo } from "react";
import { useSettings } from "@/stores/settings";
import ThinkingIndicator from "../ThinkingIndicator";
import Markdown, { MESSAGE_BODY_CLASS } from "./Markdown";
import { AgentIndicator, WebSearchIndicator } from "./MessageParts";
import MessageRow from "./MessageRow";
import StreamingSandboxBlock from "./StreamingSandboxBlock";
import ThinkingBlock from "./ThinkingBlock";
import useMessageText from "./useMessageText";

const selectDisplaySettings = (state) => ({
  thinkingEnabled: state.thinkingEnabled,
  webSearchEnabled: state.webSearchEnabled,
  agentModeEnabled: state.agentModeEnabled,
  artifactsEnabled: state.artifactsEnabled,
  showSandboxCode: state.showSandboxCode,
  showSandboxOutput: state.showSandboxOutput,
  showThinking: state.showThinking,
});

/**
 * The stream text and tool list stay props, and that is deliberate: they are
 * the values the thread has already decided are safe to show here. Reading
 * them from the turn store instead would mean every message row in every open
 * conversation rendered whatever stream happened to be in flight. Only the
 * presentation settings are looked up here.
 */
const StreamingMessage = memo(function StreamingMessage({
  streamingContent,
  streamingThinking,
  streamingSandboxTools,
}) {
  const {
    thinkingEnabled,
    webSearchEnabled,
    agentModeEnabled,
    artifactsEnabled,
    showSandboxCode,
    showSandboxOutput,
    showThinking,
  } = useSettings(selectDisplaySettings);

  const {
    text: cleanedText,
    artifacts,
    streamingArtifact,
  } = useMessageText(streamingContent || "", { artifactsEnabled });
  const hasArtifact = artifacts.length > 0 || !!streamingArtifact;

  return (
    <div className="w-full animate-hcai-fade-in-slow">
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
          <div className={MESSAGE_BODY_CLASS}>
            {cleanedText ? (
              <Markdown mode="stream" streaming>
                {cleanedText}
              </Markdown>
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
