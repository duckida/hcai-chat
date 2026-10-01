"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
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

  // Open whenever there is something to show and the user has not dismissed it
  // on this visit. Both branches of the guard are needed: artifacts that exist,
  // and a fence still arriving.
  const artifactPanelOpen =
    !panelDismissed && (messageArtifacts.length > 0 || !!streamingArtifact);

  // An arriving artifact reopens a panel that was closed before the answer
  // finished — otherwise the user closes it once mid-turn and never sees the
  // thing the turn was for.
  useEffect(() => {
    if (streamingArtifact && !hadStreamingArtifactRef.current) {
      setPanelDismissed(false);
    }
    hadStreamingArtifactRef.current = !!streamingArtifact;
  }, [streamingArtifact]);

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
        hasE2bKey={hasE2bKey}
        artifactFullscreen={artifactFullscreen}
        artifactPanelOpen={artifactPanelOpen}
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
            isOpen={artifactPanelOpen}
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
