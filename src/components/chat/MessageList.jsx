"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cloud,
  Download,
  ExternalLink,
  FileText,
  Globe,
  ImageIcon,
  Sparkles,
  Terminal,
  User,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Streamdown } from "streamdown";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getStoredE2bApiKey } from "@/lib/api-client";
import { extractHtmlArtifacts } from "@/lib/artifacts";
import { normalizeLatexDelimiters } from "@/lib/latex";
import { useStreamdownPlugins } from "@/lib/streamdown";
import CustomLink from "./CustomLink";
import ResponseMetrics from "./ResponseMetrics";
import ThinkingIndicator from "./ThinkingIndicator";

const streamdownComponents = { a: CustomLink };

async function fetchSandboxFiles(conversationId, sandboxId) {
  const res = await fetch("/api/sandbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "list",
      conversationId,
      sandboxId: sandboxId || null,
      e2bApiKey: getStoredE2bApiKey(),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to list files");
  return data.files || [];
}

async function downloadSandboxFile(conversationId, file, sandboxId) {
  const res = await fetch("/api/sandbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "download_token",
      conversationId,
      file: file.path,
      sandboxId: sandboxId || null,
      e2bApiKey: getStoredE2bApiKey(),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to start download");
  window.location.href = `/api/sandbox?conversationId=${encodeURIComponent(conversationId)}&action=download&token=${encodeURIComponent(data.token)}`;
}

const ThinkingBlock = ({
  thinking,
  isStreaming = false,
  defaultView = "closed",
}) => {
  const streamdownPlugins = useStreamdownPlugins();
  const [isExpanded, setIsExpanded] = useState(defaultView === "open");

  useEffect(() => {
    setIsExpanded(defaultView === "open");
  }, [defaultView]);

  const normalizedThinking = useMemo(
    () => (thinking ? normalizeLatexDelimiters(thinking) : ""),
    [thinking],
  );

  if (!thinking && !isStreaming) return null;

  return (
    <div className="mb-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="text-xs text-muted-foreground hover:text-foreground gap-1.5 h-7 px-2.5 rounded-lg"
      >
        {isStreaming ? (
          <ThinkingIndicator size="sm" />
        ) : (
          <Brain className="w-3.5 h-3.5" />
        )}
        <span className="font-medium">Thinking</span>
        {isExpanded ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
      </Button>
      {isExpanded && (
        <div className="mt-2 ml-1 p-4 bg-muted rounded-xl border border-border text-sm text-muted-foreground leading-relaxed overflow-x-auto">
          {normalizedThinking ? (
            <Streamdown
              mode={isStreaming ? "stream" : "static"}
              caret={isStreaming ? "line" : false}
              isAnimating={isStreaming}
              animated={isStreaming ? STREAMDOWN_ANIMATED : false}
              plugins={streamdownPlugins}
              components={streamdownComponents}
            >
              {normalizedThinking}
            </Streamdown>
          ) : (
            <span className="text-muted-foreground inline-flex items-center">
              <ThinkingIndicator
                label="Thinking"
                size="sm"
                className="text-muted-foreground"
              />
            </span>
          )}
        </div>
      )}
    </div>
  );
};

const WebSearchIndicator = ({ isSearching = false }) => {
  if (!isSearching) return null;

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
      <Globe className="w-4 h-4 animate-pulse" />
      <span>Searching the web</span>
      <ThinkingIndicator size="md" className="text-muted-foreground" />
    </div>
  );
};

const SourcesBlock = ({ sources }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="mb-2 h-7 gap-1.5 rounded-lg px-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
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
                className="text-xs text-muted-foreground bg-muted px-3 py-2 rounded-lg flex items-start gap-2"
              >
                <span className="text-muted-foreground/60 shrink-0">
                  {index + 1}.
                </span>
                <div className="flex-1 min-w-0">
                  {typeof source === "string" ? (
                    <span>{source}</span>
                  ) : (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline underline-offset-4 decoration-blue-300 dark:decoration-blue-700 hover:decoration-blue-600 transition-colors break-all inline-flex items-center gap-1"
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
    <div className="relative rounded-xl overflow-hidden border border-border bg-muted max-w-md cursor-pointer transition-shadow hover:shadow-md">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <ImageIcon className="w-6 h-6 text-muted-foreground/50" />
        </div>
      )}
      <Image
        src={src}
        alt={alt || "Image attachment"}
        width={800}
        height={600}
        unoptimized
        style={{ width: "100%", height: "auto" }}
        onLoad={() => setLoaded(true)}
        className={`max-h-80 object-contain ${loaded ? "opacity-100" : "opacity-0"}`}
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

const SandboxFilePills = ({ conversationId, sandboxId }) => {
  const [files, setFiles] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchFiles = useCallback(async () => {
    if (files !== null) return;
    setLoading(true);
    setError(null);
    try {
      setFiles(await fetchSandboxFiles(conversationId, sandboxId));
    } catch (err) {
      setError(err.message);
      setFiles([]);
    }
    setLoading(false);
  }, [conversationId, sandboxId, files]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  if (loading || !files || files.length === 0) return null;

  return (
    <div className="max-w-[700px] mx-auto px-4 sm:px-6 py-3">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 pl-1">
        Generated Files
      </p>
      {error && <p className="text-[11px] text-red-500 mb-2 pl-1">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {files.map((file) => (
          <button
            key={file.path}
            type="button"
            onClick={() =>
              downloadSandboxFile(conversationId, file, sandboxId).catch(
                (err) => setError(err.message),
              )
            }
          >
            <FileBubble
              file={{
                name: file.name,
                size: file.size,
                url: null,
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
};

const CompletedSandboxFiles = ({
  streamingSandboxTools,
  isLoading,
  streamingContent,
  streamingThinking,
}) => {
  if (isLoading || streamingContent || streamingThinking) return null;

  const completedTool = streamingSandboxTools.find(
    (t) => t.status === "complete",
  );
  if (!completedTool?.conversationId) return null;

  return (
    <SandboxFilePills
      key={completedTool.conversationId}
      conversationId={completedTool.conversationId}
      sandboxId={completedTool.sandboxId}
    />
  );
};

const FileBubble = ({ file }) => {
  const content = (
    <div className="inline-flex items-center gap-2.5 bg-background border border-border rounded-xl px-3.5 py-2.5 shadow-sm cursor-default transition-shadow hover:shadow-md">
      <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center shrink-0">
        <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
      </div>
      <div className="min-w-0 max-w-[200px]">
        <p className="text-sm font-medium text-foreground truncate">
          {file.name}
        </p>
        <p className="text-xs text-muted-foreground">
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

const SandboxFiles = ({ conversationId, sandboxId }) => {
  const [files, setFiles] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setFiles(await fetchSandboxFiles(conversationId, sandboxId));
    } catch (err) {
      setError(err.message);
      setFiles([]);
    }
    setLoading(false);
  }, [conversationId, sandboxId]);

  if (files === null) {
    return (
      <button
        type="button"
        onClick={fetchFiles}
        className="w-full mt-0.5 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors py-1"
      >
        <Download className="w-3 h-3" />
        Show generated files
      </button>
    );
  }

  if (loading) {
    return (
      <div className="mt-0.5 text-[11px] text-muted-foreground/60 text-center py-1">
        Loading files...
      </div>
    );
  }

  if (files.length === 0) {
    return error ? (
      <div className="mt-0.5 text-[11px] text-red-500/80 text-center py-1">
        {error}
      </div>
    ) : null;
  }

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="border-t border-border mt-2 pt-2">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
        Generated Files
      </div>
      {error && (
        <div className="text-[11px] text-red-500/80 mb-1.5">{error}</div>
      )}
      <div className="space-y-1">
        {files.map((file) => (
          <button
            key={file.path}
            type="button"
            onClick={() =>
              downloadSandboxFile(conversationId, file, sandboxId).catch(
                (err) => setError(err.message),
              )
            }
            className="w-full flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-1 px-2 rounded-lg hover:bg-muted/50 text-left"
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate flex-1 font-mono">{file.path}</span>
            <span className="text-[10px] text-muted-foreground/60 shrink-0">
              {formatSize(file.size)}
            </span>
            <Download className="w-3 h-3 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
};

const AgentIndicator = () => (
  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
    <Cloud className="w-4 h-4 text-sky-500 dark:text-sky-400 animate-pulse" />
    <span className="text-sky-500 dark:text-sky-400 font-medium">
      Running code in sandbox
    </span>
    <ThinkingIndicator size="sm" className="text-muted-foreground" />
  </div>
);

const ErrorMessage = ({ error }) => {
  if (!error) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full"
    >
      <div className="max-w-[700px] mx-auto px-4 sm:px-6 py-5 sm:py-8 flex gap-3 sm:gap-5 md:gap-7">
        <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl shrink-0 flex items-center justify-center bg-red-500 text-white shadow-lg">
          <AlertTriangle className="h-4.5 w-4.5" />
        </div>
        <div className="flex-1 space-y-4 overflow-hidden pt-1">
          <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
              <span className="font-semibold text-red-700 dark:text-red-400 text-[15.5px]">
                {error.title || "Error"}
              </span>
            </div>
            {error.details && (
              <p className="text-[14px] text-red-600/80 dark:text-red-400/80 leading-relaxed">
                {error.details}
              </p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const Message = memo(function Message({
  message,
  isStreaming = false,
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

  const { cleanedText, artifacts } = useMemo(
    () => extractHtmlArtifacts(text),
    [text],
  );
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
              : "bg-muted text-muted-foreground border border-border"
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
        </div>
      </div>
    </motion.div>
  );
});

const STREAMDOWN_ANIMATED = {
  animation: "blurIn",
  duration: 200,
  easing: "ease-out",
};

const LINE_LIMIT = 4;

const StreamingSandboxBlock = ({
  tool,
  showSandboxCode = true,
  showSandboxOutput = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showFullCode, setShowFullCode] = useState(false);

  const isRunning = tool.status === "running" || tool.status === "writing";
  const isComplete = tool.status === "complete";
  const hasOutput = tool.stdout || tool.stderr;

  const codeLines = (tool.code || "").split("\n");
  const isLongCode = codeLines.length > LINE_LIMIT;
  const displayCode =
    showFullCode || !isLongCode
      ? tool.code
      : `${codeLines.slice(0, LINE_LIMIT).join("\n")}\n···`;

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-muted/50">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors bg-muted/30"
      >
        <Terminal className="w-3.5 h-3.5 shrink-0" />
        <span className="font-semibold">Sandbox</span>
        {isRunning && (
          <ThinkingIndicator size="sm" className="text-muted-foreground ml-1" />
        )}
        {isComplete && tool.exitCode === 0 && (
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 ml-1" />
        )}
        {isComplete && tool.exitCode !== 0 && (
          <XCircle className="w-3.5 h-3.5 text-red-500 ml-1" />
        )}
        {hasOutput && (
          <span className="text-[11px] text-muted-foreground/70 ml-auto">
            {isExpanded ? "Hide" : "Show"} output
          </span>
        )}
      </button>
      {isExpanded && (
        <div className="p-3 space-y-2 border-t border-border">
          {showSandboxCode && (
            <>
              <pre className="text-xs leading-relaxed bg-muted p-2.5 rounded-lg overflow-x-auto text-foreground/90 whitespace-pre-wrap font-mono">
                {displayCode}
              </pre>
              {isLongCode && (
                <button
                  type="button"
                  onClick={() => setShowFullCode(!showFullCode)}
                  className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showFullCode
                    ? "Show less"
                    : `Show all (${codeLines.length} lines)`}
                </button>
              )}
            </>
          )}
          {isRunning && !tool.stdout && !tool.stderr && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                {tool.status === "writing" ? "Writing code..." : "Running..."}
              </span>
              <ThinkingIndicator size="sm" className="text-muted-foreground" />
            </div>
          )}
          {showSandboxOutput && tool.stdout && (
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Output
              </div>
              <pre className="text-xs leading-relaxed bg-background p-2.5 rounded-lg overflow-x-auto text-foreground/80 whitespace-pre-wrap font-mono">
                {tool.stdout}
              </pre>
            </div>
          )}
          {showSandboxOutput && tool.stderr && (
            <div>
              <div className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider mb-1">
                Error
              </div>
              <pre className="text-xs leading-relaxed bg-red-50 dark:bg-red-950/50 p-2.5 rounded-lg overflow-x-auto text-red-600 dark:text-red-400 whitespace-pre-wrap font-mono">
                {tool.stderr}
              </pre>
            </div>
          )}
        </div>
      )}
      {isComplete && tool.conversationId && (
        <SandboxFiles
          conversationId={tool.conversationId}
          sandboxId={tool.sandboxId}
        />
      )}
    </div>
  );
};

const StreamingMessage = memo(function StreamingMessage({
  streamingContent,
  streamingThinking,
  thinkingEnabled,
  webSearchEnabled,
  agentModeEnabled,
  streamingSandboxTools,
  showSandboxCode,
  showSandboxOutput,
  showThinking,
}) {
  const streamdownPlugins = useStreamdownPlugins();
  const { cleanedText, hasArtifact } = useMemo(() => {
    const {
      cleanedText: cleaned,
      artifacts,
      streamingArtifact,
    } = extractHtmlArtifacts(streamingContent || "");
    return {
      cleanedText: normalizeLatexDelimiters(cleaned),
      hasArtifact: artifacts.length > 0 || !!streamingArtifact,
    };
  }, [streamingContent]);

  return (
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
        </div>
      </div>
    </motion.div>
  );
});

const hasRenderableContent = (message) => {
  if (message.role === "user") {
    if (typeof message.content === "string" && message.content.trim())
      return true;
    if (Array.isArray(message.content) && message.content.length > 0)
      return true;
    return false;
  }
  if (message.role === "tool") return false;
  if (message.error) return true;
  const messageText =
    typeof message.content === "string"
      ? message.content
      : getMessageText(message.content);
  if (messageText.trim() !== "") return true;
  if (message.thinking && message.thinking.trim() !== "") return true;
  return false;
};

export default function MessageList({
  messages,
  isLoading,
  streamingContent,
  streamingThinking,
  streamingError,
  thinkingEnabled,
  webSearchEnabled,
  agentModeEnabled = false,
  streamingSandboxTools = [],
  showThinking = false,
  showSandboxCode = true,
  showSandboxOutput = true,
  showMetrics = true,
}) {
  const scrollRef = useRef(null);

  const deferredStreamingContent = useDeferredValue(streamingContent);
  const deferredStreamingThinking = useDeferredValue(streamingThinking);

  useEffect(() => {
    if (
      scrollRef.current &&
      (messages.length > 0 ||
        streamingContent ||
        streamingThinking ||
        streamingError ||
        streamingSandboxTools.length > 0 ||
        isLoading)
    ) {
      scrollRef.current.scrollToBottom();
    }
  }, [
    messages,
    streamingContent,
    streamingThinking,
    streamingError,
    streamingSandboxTools,
    isLoading,
  ]);

  const activeMessages = useMemo(
    () => (messages || []).filter(hasRenderableContent),
    [messages],
  );

  const hasContent =
    activeMessages.length > 0 ||
    streamingContent ||
    streamingThinking ||
    streamingError ||
    streamingSandboxTools.length > 0;

  return (
    <ScrollArea ref={scrollRef} className="flex-1 h-full selection:bg-accent">
      <div className="py-4">
        {!hasContent ? (
          <div className="flex flex-col items-center justify-center min-h-[65vh] text-center opacity-40 select-none px-4 sm:px-6">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-[2rem] bg-foreground text-background flex items-center justify-center shadow-2xl mb-6 sm:mb-8 transform hover:scale-110 transition-transform duration-500">
              <Sparkles className="h-7 w-7 sm:h-8 sm:w-8" />
            </div>
            <h1 className="text-xl sm:text-2xl font-[800] tracking-[-0.03em] text-foreground mb-2 uppercase">
              Hack Club AI
            </h1>
            <p className="text-[12px] sm:text-[13px] font-medium text-muted-foreground max-w-[260px] sm:max-w-[280px] leading-relaxed">
              What do you need help with?
            </p>
          </div>
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
                  showThinking={showThinking}
                  showSandboxCode={showSandboxCode}
                  showSandboxOutput={showSandboxOutput}
                  showMetrics={showMetrics}
                />
              );
            })}

            {(deferredStreamingContent || deferredStreamingThinking) && (
              <StreamingMessage
                streamingContent={deferredStreamingContent}
                streamingThinking={deferredStreamingThinking}
                thinkingEnabled={thinkingEnabled}
                webSearchEnabled={webSearchEnabled}
                agentModeEnabled={agentModeEnabled}
                streamingSandboxTools={streamingSandboxTools}
                showSandboxCode={showSandboxCode}
                showSandboxOutput={showSandboxOutput}
                showThinking={showThinking}
              />
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
                        defaultView={showThinking ? "open" : "closed"}
                      />
                    </div>
                  </div>
                </motion.div>
              )}

            <CompletedSandboxFiles
              streamingSandboxTools={streamingSandboxTools}
              isLoading={isLoading}
              streamingContent={streamingContent}
              streamingThinking={streamingThinking}
            />
          </>
        )}
      </div>
    </ScrollArea>
  );
}
