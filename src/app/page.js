"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import ArtifactPanel from "@/components/chat/ArtifactPanel";
import ChatInput from "@/components/chat/ChatInput";
import ChatLayout from "@/components/chat/ChatLayout";
import ImportDialog from "@/components/chat/ImportDialog";
import MessageList from "@/components/chat/MessageList";
import SettingsModal from "@/components/chat/SettingsModal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useChatStream } from "@/hooks/use-chat-stream";
import { useConversations } from "@/hooks/use-conversations";
import { useIsDesktop } from "@/hooks/use-media-query";
import { useModels } from "@/hooks/use-models";
import { useSettings } from "@/hooks/use-settings";
import { getStoredApiKey, getStoredE2bApiKey } from "@/lib/api-client";
import { extractHtmlArtifacts } from "@/lib/artifacts";
import { getAllConversations } from "@/lib/db";
import {
  exportAllToZip,
  generateExportFilename,
  triggerDownload,
} from "@/lib/import-export";
import { getModelPricingMap, isModelFree } from "@/lib/model-pricing";

export default function Home({
  initialQuery = null,
  initialSearchEnabled = false,
} = {}) {
  const { values: settings, setValue: setSetting } = useSettings();
  const isDesktop = useIsDesktop();
  const { groupedModels, contextWindowMap, toolsSupportedMap } = useModels();

  const conversations = useConversations({
    selectedModel: settings.selectedModel,
  });

  const toolsSupported = toolsSupportedMap[settings.selectedModel] ?? true;

  const stream = useChatStream({
    conversations,
    activeConversation: conversations.activeConversation,
    messagesRef: conversations.messagesRef,
    setMessages: conversations.setMessages,
    patchConversation: conversations.patchConversation,
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
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
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
    [conversations, setSetting],
  );

  const handleExportAll = useCallback(async () => {
    try {
      const blob = await exportAllToZip({
        includeChats: true,
        includeSettings: true,
      });
      triggerDownload(blob, generateExportFilename());
      toast.success("Export complete");
    } catch (error) {
      toast.error(`Export failed: ${error.message || "Unknown error"}`);
    }
  }, []);

  const handleImport = useCallback(() => {
    setIsImportDialogOpen(true);
  }, []);

  const handleImportComplete = useCallback(
    async (result) => {
      toast.success(
        `Imported ${result.chats.imported} conversation(s)` +
          (result.chats.replaced > 0
            ? `, replaced ${result.chats.replaced}`
            : "") +
          (result.settings ? " (settings imported)" : ""),
      );
      // Refresh conversations from DB; incremental writes mean the DB is now
      // authoritative and cannot be clobbered by a pending save.
      try {
        const convs = await getAllConversations();
        conversations.replaceConversations(convs);
      } catch (error) {
        console.error("Failed to refresh conversations after import:", error);
      }
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
        groupedModels={groupedModels}
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
        contextWindowMap={contextWindowMap}
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
            isLoading={stream.isLoading}
            streamingContent={stream.streamingContent}
            streamingThinking={stream.streamingThinking}
            streamingError={stream.streamingError}
            thinkingEnabled={settings.thinkingEnabled}
            webSearchEnabled={settings.webSearchEnabled}
            agentModeEnabled={settings.agentModeEnabled}
            artifactsEnabled={settings.artifactsEnabled}
            streamingSandboxTools={stream.streamingSandboxTools}
            showThinking={settings.showThinking}
            showSandboxCode={settings.showSandboxCode}
            showSandboxOutput={settings.showSandboxOutput}
            showMetrics={settings.showMetrics}
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
        groupedModels={groupedModels}
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
        onImport={handleImport}
        onExportAll={handleExportAll}
      />
      <ImportDialog
        isOpen={isImportDialogOpen}
        onClose={() => setIsImportDialogOpen(false)}
        onImportComplete={handleImportComplete}
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
