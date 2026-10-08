"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import ArtifactGallery from "@/components/chat/ArtifactGallery";
import ArtifactPanel from "@/components/chat/ArtifactPanel";
import ChatInput from "@/components/chat/ChatInput";
import ChatLayout from "@/components/chat/ChatLayout";
import MessageList from "@/components/chat/MessageList";
import { Button } from "@/components/primitives/button";
import { Dialog, DialogFooter } from "@/components/primitives/dialog";
import SettingsModal from "@/components/settings/SettingsModal";
import { useChatTurn } from "@/hooks/use-chat-turn";
import { useIsDesktop } from "@/hooks/use-media-query";
import { getStoredApiKey, getStoredE2bApiKey } from "@/lib/api-client";
import { extractHtmlArtifacts } from "@/lib/artifacts";
import { getMessageText } from "@/lib/messages";
import { getModelPricingMap, isModelFree } from "@/lib/model-pricing";
import { useConversations } from "@/stores/conversations";
import { loadModels, useModels } from "@/stores/models";
import { hydrateSettings, setSetting, useSettings } from "@/stores/settings";

export default function ChatApp({
  initialQuery = null,
  initialSearchEnabled = false,
} = {}) {
  const settings = useSettings();

  useEffect(() => {
    hydrateSettings();
    loadModels();
  }, []);

  const isDesktop = useIsDesktop();

  const conversations = useConversations();

  const toolsSupported = useModels(
    (s) => s.toolsSupported[settings.selectedModel] ?? true,
  );

  const stream = useChatTurn({
    selectedModel: settings.selectedModel,
    titleGenerationModel: settings.titleGenerationModel,
    thinkingEnabled: settings.thinkingEnabled,
    artifactsEnabled: settings.artifactsEnabled,
    webSearchEnabled: settings.webSearchEnabled,
    agentModeEnabled: settings.agentModeEnabled,
    maxTokens: settings.maxTokens,
    toolsSupported,
  });

  const [artifactFullscreen, setArtifactFullscreen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false);
  const [hasE2bKey, setHasE2bKey] = useState(false);
  const [isArtifactGalleryOpen, setIsArtifactGalleryOpen] = useState(false);

  // Whether the panel has been dismissed on this visit to the conversation on
  // screen. Deliberately not stored on the conversation: returning to a chat
  // that owns an artifact should reopen it, which is the whole reason it is
  // forgotten rather than remembered.
  const [panelDismissed, setPanelDismissed] = useState(false);

  const initialSearchEnabledRef = useRef(initialSearchEnabled);
  const hasAutoSentRef = useRef(false);
  const hadStreamingArtifactRef = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    const conv = conversations.conversations.find(
      (c) => c.id === conversations.activeConversation,
    );
    stream.resetForConversation(conv ?? null);
    setPanelDismissed(false);
    setPanelTab("artifact");
    // activeConversation is the real dependency; conversations.find returns a
    // stable reference for the same id, so listing it would re-run on every
    // messages patch.
  }, [conversations.activeConversation]);

  const handleToggleArtifactPanel = useCallback(() => {
    setPanelDismissed((prev) => !prev);
  }, []);

  // Models that cannot call tools must not advertise tool-backed features.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    if (!toolsSupported) {
      if (settings.webSearchEnabled) setSetting("webSearchEnabled", false);
      if (settings.agentModeEnabled) setSetting("agentModeEnabled", false);
    }
  }, [toolsSupported]);

  // Prompt for an API key on first run.
  useEffect(() => {
    setHasE2bKey(!!getStoredE2bApiKey());
    if (!getStoredApiKey()) setIsApiKeyModalOpen(true);
  }, []);

  // Offer the free fallback model when the proxy reports a negative balance.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [balanceResponse, pricingMap] = await Promise.all([
          fetch("/api/balance"),
          getModelPricingMap(),
        ]);
        if (!balanceResponse.ok || cancelled) return;
        const data = await balanceResponse.json();
        if (cancelled) return;
        if (isModelFree(pricingMap[settings.selectedModel])) {
          setIsBalanceModalOpen(false);
          return;
        }
        if (
          typeof data?.balanceRemaining === "number" &&
          data.balanceRemaining < 0
        ) {
          setIsBalanceModalOpen(true);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [settings.selectedModel]);

  // Artifacts the committed thread owns. Never gated on the artifacts toggle:
  // a chat that already produced one keeps it, so switching artifacts off for
  // the next chat cannot blank the panel when you come back to this one. The
  // text goes through getMessageText because content parts are stored, and
  // extractHtmlArtifacts only reads strings.
  const messageArtifacts = useMemo(() => {
    const allArtifacts = [];
    for (const msg of conversations.messages) {
      if (msg.role === "assistant") {
        const { artifacts } = extractHtmlArtifacts(getMessageText(msg.content));
        allArtifacts.push(...artifacts);
      }
    }
    return allArtifacts;
  }, [conversations.messages]);

  const galleryArtifacts = useMemo(() => {
    const allArtifacts = [];
    for (const conversation of conversations.conversations) {
      for (const msg of conversation.messages || []) {
        if (msg.role !== "assistant") continue;
        allArtifacts.push(
          ...extractHtmlArtifacts(getMessageText(msg.content)).artifacts,
        );
      }
    }
    return allArtifacts;
  }, [conversations.conversations]);

  // The toggle still governs whether a thread *produces* artifacts: with it off,
  // a fresh chat streams nothing into the panel and HTML lands as plain chat
  // text. Once this conversation owns an artifact it streams them too, so a new
  // one does not appear only after the message commits.
  const streamArtifacts =
    settings.artifactsEnabled || messageArtifacts.length > 0;

  const { streamingArtifact } = useMemo(() => {
    if (!streamArtifacts || !stream.streamingContent)
      return { streamingArtifact: null };
    return extractHtmlArtifacts(stream.streamingContent);
  }, [stream.streamingContent, streamArtifacts]);

  // Every command this conversation ran, as one transcript: the runs already
  // persisted on committed messages, plus the live ones — but only while their
  // turn is still running, because the same runs are committed to the message
  // the moment it finishes, and showing both would double every line. The
  // conversation gate matches the thread's: a stream running for some other
  // chat is not content of this one.
  const sandboxRuns = useMemo(() => {
    const runs = [];
    for (const msg of conversations.messages) {
      if (msg.role !== "assistant" || !Array.isArray(msg.sandboxResults))
        continue;
      for (const result of msg.sandboxResults) {
        runs.push({
          key: `persisted-${runs.length}`,
          tool: result.tool,
          code: result.code || result.command || "",
          stdout: result.stdout || "",
          stderr: result.stderr || "",
          exitCode: result.exitCode ?? null,
          status: "complete",
        });
      }
    }
    const liveIsMine =
      stream.isLoading &&
      stream.streamingConversationId === conversations.activeConversation;
    if (liveIsMine) {
      for (const tool of stream.streamingSandboxTools) {
        runs.push({
          key: `live-${tool.index}`,
          tool: tool.tool,
          code: tool.code || "",
          stdout: tool.stdout || "",
          stderr: tool.stderr || "",
          exitCode: tool.exitCode ?? null,
          status: tool.status,
        });
      }
    }
    return runs;
  }, [
    conversations.messages,
    conversations.activeConversation,
    stream.isLoading,
    stream.streamingConversationId,
    stream.streamingSandboxTools,
  ]);

  // Open whenever there is something to show and the user has not dismissed it
  // on this visit. All three branches of the content guard are needed: artifacts
  // that exist, a fence still arriving, and commands that ran. Availability is
  // kept separate from the open decision because the Header needs to know
  // whether there is anything to *reopen* — a closed panel with nothing behind
  // it must not advertise a button that cannot do anything.
  const panelAvailable =
    messageArtifacts.length > 0 ||
    !!streamingArtifact ||
    sandboxRuns.length > 0;
  const panelOpen = !panelDismissed && panelAvailable;

  // Which half of the panel is showing. A preference, not a fact: it resets
  // per conversation to the artifact (the historical behavior), and the panel
  // falls back on its own when the requested side has nothing to show.
  const [panelTab, setPanelTab] = useState("artifact");

  // An arriving artifact reopens a panel that was closed before the answer
  // finished — otherwise the user closes it once mid-turn and never sees the
  // thing the turn was for. The first command of a turn does the same, and
  // brings its own side of the panel with it: a run you can watch is the whole
  // point of agent mode. A streaming artifact wins the switch, so a panel
  // that is actively generating is not yanked away mid-fence.
  useEffect(() => {
    if (streamingArtifact && !hadStreamingArtifactRef.current) {
      setPanelDismissed(false);
    }
    hadStreamingArtifactRef.current = !!streamingArtifact;
  }, [streamingArtifact]);

  const liveRunCount =
    stream.isLoading &&
    stream.streamingConversationId === conversations.activeConversation
      ? stream.streamingSandboxTools.length
      : 0;
  const hadLiveRunRef = useRef(false);
  useEffect(() => {
    if (liveRunCount > 0 && !hadLiveRunRef.current) {
      setPanelDismissed(false);
      if (!streamingArtifact) setPanelTab("sandbox");
    }
    hadLiveRunRef.current = liveRunCount > 0;
  }, [liveRunCount, streamingArtifact]);

  // Derive total cost from persisted messages
  const totalCost = useMemo(() => {
    let total = 0;
    for (const msg of conversations.messages) {
      if (msg.role === "assistant" && msg.metrics?.cost) {
        total += msg.metrics.cost;
      }
    }
    return total;
  }, [conversations.messages]);

  const handleNewChat = useCallback(() => {
    // No override: a fresh chat has no artifacts, so the panel derives closed
    // with nothing to open onto. Carrying the toggle over would leave the third
    // grid track paid for a panel that renders nothing.
    conversations.newConversation();
  }, [conversations]);

  const handleModelChange = useCallback(
    (model) => {
      setSetting("selectedModel", model);
      conversations.setConversationModel(model);
    },
    [conversations],
  );

  // Auto-send initial query from URL params (/search?q=...). Web search is
  // forced on for this send when the page was opened with ?search=true.
  // Intentionally depends only on the query (stream.send identity changes
  // with model/tools state; the timer must not re-fire on every switch).
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    if (!initialQuery || hasAutoSentRef.current) return;
    const timer = setTimeout(() => {
      if (!hasAutoSentRef.current && initialQuery) {
        hasAutoSentRef.current = true;
        if (initialSearchEnabledRef.current) {
          setSetting("webSearchEnabled", true);
        }
        // send() resolves its target from the conversations store at call
        // time, which is whichever conversation hydration restored. The search
        // page opens its own chat, so claim one first instead of appending an
        // unrelated query to the user's most recent conversation.
        handleNewChat();
        stream.send(initialQuery, []);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [initialQuery]);

  return (
    <>
      <ChatLayout
        onNewChat={handleNewChat}
        conversations={conversations.conversations}
        activeConversation={conversations.activeConversation}
        onSelectConversation={conversations.selectConversation}
        onDeleteConversation={conversations.deleteConversation}
        onRenameConversation={conversations.renameConversation}
        selectedModel={settings.selectedModel}
        onModelChange={handleModelChange}
        thinkingEnabled={settings.thinkingEnabled}
        onThinkingChange={(v) => setSetting("thinkingEnabled", v)}
        artifactsEnabled={settings.artifactsEnabled}
        onArtifactsChange={(v) => setSetting("artifactsEnabled", v)}
        webSearchEnabled={settings.webSearchEnabled}
        onWebSearchChange={(v) => setSetting("webSearchEnabled", v)}
        agentModeEnabled={settings.agentModeEnabled}
        onAgentModeChange={(v) => setSetting("agentModeEnabled", v)}
        onApiKeyClick={() => setIsApiKeyModalOpen(true)}
        onSettingsClick={() => setIsApiKeyModalOpen(true)}
        onArtifactGalleryClick={() => setIsArtifactGalleryOpen(true)}
        hasE2bKey={hasE2bKey}
        artifactFullscreen={artifactFullscreen}
        panelOpen={panelOpen}
        panelAvailable={panelAvailable}
        onTogglePanel={handleToggleArtifactPanel}
        isDesktop={isDesktop}
        contextUsage={stream.contextUsage}
        toolsSupported={toolsSupported}
        totalCost={totalCost}
        // A function, not an element: the row owns the panel's width and hands
        // it down, so the panel has to be built where that width is known.
        rightPanel={(panel) => (
          <ArtifactPanel
            artifacts={messageArtifacts}
            streamingArtifact={streamingArtifact}
            sandboxRuns={sandboxRuns}
            tab={panelTab}
            onTabChange={setPanelTab}
            isOpen={panelOpen}
            onToggle={handleToggleArtifactPanel}
            fullscreen={artifactFullscreen}
            onFullscreenToggle={() => setArtifactFullscreen((prev) => !prev)}
            width={panel.width}
            isResizing={panel.isResizing}
            onWidthChange={panel.onWidthChange}
            onResizingChange={panel.onResizingChange}
          />
        )}
      >
        <div className="flex flex-col h-full bg-background relative min-h-0 min-w-0">
          <MessageList
            messages={conversations.messages}
            activeConversation={conversations.activeConversation}
          />
          <ChatInput onSend={stream.send} isLoading={stream.isLoading} />
        </div>
      </ChatLayout>

      <ArtifactGallery
        artifacts={galleryArtifacts}
        open={isArtifactGalleryOpen}
        onOpenChange={setIsArtifactGalleryOpen}
      />

      <SettingsModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        onSave={() => {
          setHasE2bKey(!!getStoredE2bApiKey());
          toast.success("Settings updated");
        }}
        titleGenerationModel={settings.titleGenerationModel}
        onTitleGenerationModelChange={(v) =>
          setSetting("titleGenerationModel", v)
        }
        theme={settings.theme}
        onThemeChange={(v) => setSetting("theme", v)}
        showThinking={settings.showThinking}
        onShowThinkingChange={(v) => setSetting("showThinking", v)}
        showSandboxCode={settings.showSandboxCode}
        onShowSandboxCodeChange={(v) => setSetting("showSandboxCode", v)}
        showSandboxOutput={settings.showSandboxOutput}
        onShowSandboxOutputChange={(v) => setSetting("showSandboxOutput", v)}
        showMetrics={settings.showMetrics}
        onShowMetricsChange={(v) => setSetting("showMetrics", v)}
        maxTokens={settings.maxTokens}
        onMaxTokensChange={(v) => setSetting("maxTokens", v)}
      />
      <Dialog
        open={isBalanceModalOpen}
        onOpenChange={setIsBalanceModalOpen}
        title="Hack Club AI is out of balance"
        description="Hack Club AI is currently out of balance. Until then, you can use openrouter/free which routes to an available free model automatically."
        showCloseButton={false}
      >
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setIsBalanceModalOpen(false)}
          >
            Skip
          </Button>
          <Button
            onClick={() => {
              handleModelChange("openrouter/free");
              setIsBalanceModalOpen(false);
            }}
          >
            Use it
          </Button>
        </DialogFooter>
      </Dialog>
      <Toaster position="top-center" richColors />
    </>
  );
}
