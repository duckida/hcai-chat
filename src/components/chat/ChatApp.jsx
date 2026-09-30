"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import ArtifactPanel from "@/components/chat/ArtifactPanel";
import ChatInput from "@/components/chat/ChatInput";
import ChatLayout from "@/components/chat/ChatLayout";
import MessageList from "@/components/chat/MessageList";
import SettingsModal from "@/components/settings/SettingsModal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useChatTurn } from "@/hooks/use-chat-turn";
import { useIsDesktop } from "@/hooks/use-media-query";
import { getStoredApiKey, getStoredE2bApiKey } from "@/lib/api-client";
import { extractHtmlArtifacts } from "@/lib/artifacts";
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
    isDesktop,
  });

  // Reset streaming accumulators whenever the active conversation changes,
  // and persist the panel state from the newly-active conversation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    const conv = conversations.conversations.find(
      (c) => c.id === conversations.activeConversation,
    );
    stream.resetForConversation(conv ?? null);
    setArtifactPanelOpen(conv?.artifactPanelOpen ?? false);
    // activeConversation is the real dependency; conversations.find returns a
    // stable reference for the same id, so listing it would re-run on every
    // messages patch.
  }, [conversations.activeConversation]);

  const [artifactPanelOpen, setArtifactPanelOpen] = useState(false);
  const [artifactFullscreen, setArtifactFullscreen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false);
  const [hasE2bKey, setHasE2bKey] = useState(false);

  const initialSearchEnabledRef = useRef(initialSearchEnabled);
  const hasAutoSentRef = useRef(false);

  // Persist the artifact panel state onto the active conversation.
  const handleToggleArtifactPanel = useCallback(() => {
    setArtifactPanelOpen((prev) => {
      const next = !prev;
      if (conversations.activeConversation) {
        conversations.patchConversation(conversations.activeConversation, {
          artifactPanelOpen: next,
        });
      }
      return next;
    });
  }, [conversations]);

  // Open the panel alongside artifacts mode on desktop.
  useEffect(() => {
    if (
      settings.artifactsEnabled &&
      isDesktop &&
      !artifactPanelOpen &&
      conversations.activeConversation
    ) {
      setArtifactPanelOpen(true);
      conversations.patchConversation(conversations.activeConversation, {
        artifactPanelOpen: true,
      });
    }
  }, [settings.artifactsEnabled, isDesktop, artifactPanelOpen, conversations]);

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

  // Derive artifacts from persisted messages (only when artifacts mode is on)
  const messageArtifacts = useMemo(() => {
    if (!settings.artifactsEnabled) return [];
    const allArtifacts = [];
    for (const msg of conversations.messages) {
      if (msg.role === "assistant") {
        const { artifacts } = extractHtmlArtifacts(msg.content);
        allArtifacts.push(...artifacts);
      }
    }
    return allArtifacts;
  }, [conversations.messages, settings.artifactsEnabled]);

  // Derive streaming artifact from live streaming content (only when
  // artifacts mode is on — otherwise HTML fences are plain chat text)
  const { streamingArtifact } = useMemo(() => {
    if (!settings.artifactsEnabled || !stream.streamingContent)
      return { streamingArtifact: null };
    return extractHtmlArtifacts(stream.streamingContent);
  }, [stream.streamingContent, settings.artifactsEnabled]);

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
    conversations.newConversation({
      artifactPanelOpen: settings.artifactsEnabled && isDesktop,
    });
  }, [conversations, settings.artifactsEnabled, isDesktop]);

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
        contextUsage={stream.contextUsage}
        toolsSupported={toolsSupported}
        totalCost={totalCost}
        rightPanel={
          <ArtifactPanel
            artifacts={messageArtifacts}
            streamingArtifact={streamingArtifact}
            isOpen={artifactPanelOpen}
            onToggle={handleToggleArtifactPanel}
            fullscreen={artifactFullscreen}
            onFullscreenToggle={() => setArtifactFullscreen((prev) => !prev)}
          />
        }
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
      <Dialog open={isBalanceModalOpen} onOpenChange={setIsBalanceModalOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Hack Club AI is out of balance</DialogTitle>
            <DialogDescription>
              Hack Club AI is currently out of balance. Until then, you can use
              openrouter/free which routes to an available free model
              automatically.
            </DialogDescription>
          </DialogHeader>
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
        </DialogContent>
      </Dialog>
      <Toaster position="top-center" richColors />
    </>
  );
}
