"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/primitives/button";
import {
  Dialog,
  DialogDescription,
  DialogTitle,
} from "@/components/primitives/dialog";
import AppearanceSection from "@/components/settings/AppearanceSection";
import KeysSection from "@/components/settings/KeysSection";
import ModelsSection from "@/components/settings/ModelsSection";
import SandboxSection from "@/components/settings/SandboxSection";
import SectionTabs from "@/components/settings/SectionNav";
import {
  getStoredApiKey,
  getStoredE2bApiKey,
  setStoredApiKey,
  setStoredE2bApiKey,
} from "@/lib/api-client";
import { loadModels } from "@/stores/models";

export default function SettingsModal({
  isOpen,
  onClose,
  onSave,
  selectedModel = "deepseek/deepseek-v4.1-flash",
  onSelectedModelChange,
  titleGenerationModel,
  onTitleGenerationModelChange,
  openRouterProviders = {},
  onOpenRouterProvidersChange,
  theme: paletteTheme = "aurora",
  onThemeChange,
  googleFont = "Inter",
  onGoogleFontChange,
  accentColor = "#ec3750",
  onAccentColorChange,
  showThinking = false,
  onShowThinkingChange,
  showMetrics = true,
  onShowMetricsChange,
  maxTokens = 32000,
  onMaxTokensChange,
}) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [e2bApiKey, setE2bApiKey] = useState("");
  const [showE2bKey, setShowE2bKey] = useState(false);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState("keys");

  // Settings has to be able to fetch the catalog by itself: it is rendered
  // without the app shell in tests, so the request must originate here.
  useEffect(() => {
    loadModels();
  }, []);

  useEffect(() => {
    if (isOpen) {
      const stored = getStoredApiKey();
      setApiKey(stored || "");
      const storedE2b = getStoredE2bApiKey();
      setE2bApiKey(storedE2b || "");
      setError("");
    }
  }, [isOpen]);

  const handleSave = () => {
    if (!apiKey.trim()) {
      setError("A valid API key is required");
      return;
    }
    setStoredApiKey(apiKey.trim());
    setStoredE2bApiKey(e2bApiKey.trim());
    onSave?.(apiKey.trim());
    onClose?.();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && onClose?.()}
      className="w-[calc(100vw-2rem)] max-w-none sm:max-w-2xl bg-background border-border rounded-3xl shadow-2xl p-0 overflow-hidden"
    >
      <DialogDescription className="sr-only">
        Configure your keys, models, sandbox, and appearance.
      </DialogDescription>
      <div className="flex max-h-[90vh] min-h-0 min-w-0 flex-col">
        <div className="px-6 pb-4 pt-6 sm:px-8">
          <DialogTitle className="text-xl font-[900] tracking-tight text-foreground">
            Settings
          </DialogTitle>
        </div>
        <SectionTabs activeId={activeSection} onSelect={setActiveSection} />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          <div
            id="settings-panel"
            role="tabpanel"
            aria-labelledby={`settings-tab-${activeSection}`}
            className="p-6 sm:p-8"
          >
            {activeSection === "keys" && (
              <KeysSection
                apiKey={apiKey}
                onApiKeyChange={(value) => {
                  setApiKey(value);
                  setError("");
                }}
                error={error}
                showKey={showKey}
                onToggleShowKey={() => setShowKey((prev) => !prev)}
                e2bApiKey={e2bApiKey}
                onE2bApiKeyChange={setE2bApiKey}
                showE2bKey={showE2bKey}
                onToggleShowE2bKey={() => setShowE2bKey((prev) => !prev)}
              />
            )}

            {activeSection === "sandbox" && <SandboxSection />}

            {activeSection === "models" && (
              <ModelsSection
                selectedModel={selectedModel}
                onSelectedModelChange={onSelectedModelChange}
                titleGenerationModel={titleGenerationModel}
                onTitleGenerationModelChange={onTitleGenerationModelChange}
                maxTokens={maxTokens}
                onMaxTokensChange={onMaxTokensChange}
                openRouterProviders={openRouterProviders}
                onOpenRouterProvidersChange={onOpenRouterProvidersChange}
              />
            )}

            {activeSection === "appearance" && (
              <AppearanceSection
                theme={paletteTheme}
                onThemeChange={onThemeChange}
                googleFont={googleFont}
                onGoogleFontChange={onGoogleFontChange}
                accentColor={accentColor}
                onAccentColorChange={onAccentColorChange}
                showThinking={showThinking}
                onShowThinkingChange={onShowThinkingChange}
                showMetrics={showMetrics}
                onShowMetricsChange={onShowMetricsChange}
              />
            )}

            <div className="mt-8 pt-6 border-t border-border flex flex-col sm:flex-row gap-2">
              <Button
                onClick={handleSave}
                className="w-full sm:flex-1 bg-primary hover:bg-primary/90 text-primary-foreground h-12 rounded-xl text-[14px] font-bold shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                Save and Connect
              </Button>
              <Button
                variant="ghost"
                onClick={onClose}
                className="w-full sm:w-auto sm:px-6 text-muted-foreground hover:text-foreground h-12 rounded-xl text-[13px] font-semibold"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
