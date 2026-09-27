"use client";

import { useEffect, useState } from "react";
import AppearanceSection from "@/components/settings/AppearanceSection";
import BehaviorSection from "@/components/settings/BehaviorSection";
import ConnectionSection from "@/components/settings/ConnectionSection";
import DataSection from "@/components/settings/DataSection";
import ModelsSection from "@/components/settings/ModelsSection";
import SandboxSection from "@/components/settings/SandboxSection";
import {
  MobileSectionPills,
  SidebarNav,
} from "@/components/settings/SectionNav";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
} from "@/components/ui/dialog";
import { useModels } from "@/hooks/use-models";
import {
  getStoredApiKey,
  getStoredE2bApiKey,
  setStoredApiKey,
  setStoredE2bApiKey,
} from "@/lib/api-client";

export default function SettingsModal({
  isOpen,
  onClose,
  onSave,
  titleGenerationModel,
  onTitleGenerationModelChange,
  theme: paletteTheme = "aurora",
  onThemeChange,
  showThinking = false,
  onShowThinkingChange,
  showSandboxCode = true,
  onShowSandboxCodeChange,
  showSandboxOutput = true,
  onShowSandboxOutputChange,
  showMetrics = true,
  onShowMetricsChange,
  maxTokens = 32000,
  onMaxTokensChange,
  onImport,
  onExportAll,
}) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [e2bApiKey, setE2bApiKey] = useState("");
  const [showE2bKey, setShowE2bKey] = useState(false);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState("connection");

  const { groupedModels } = useModels();

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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl bg-background border-border rounded-3xl shadow-2xl p-0 overflow-hidden">
        <DialogDescription className="sr-only">
          Configure your AI connection, models, appearance, and behavior.
        </DialogDescription>
        <div className="flex flex-col sm:flex-row max-h-[90vh]">
          <SidebarNav activeId={activeSection} onSelect={setActiveSection} />
          <MobileSectionPills
            activeId={activeSection}
            onSelect={setActiveSection}
          />
          <div className="flex-1 min-h-0 w-full overflow-y-auto sm:max-h-[90vh]">
            <div className="p-6 sm:p-8">
              {activeSection === "connection" && (
                <ConnectionSection
                  apiKey={apiKey}
                  onApiKeyChange={(value) => {
                    setApiKey(value);
                    setError("");
                  }}
                  error={error}
                  showKey={showKey}
                  onToggleShowKey={() => setShowKey((prev) => !prev)}
                />
              )}

              {activeSection === "sandbox" && (
                <SandboxSection
                  e2bApiKey={e2bApiKey}
                  onE2bApiKeyChange={setE2bApiKey}
                  showE2bKey={showE2bKey}
                  onToggleShowE2bKey={() => setShowE2bKey((prev) => !prev)}
                  showSandboxCode={showSandboxCode}
                  onShowSandboxCodeChange={onShowSandboxCodeChange}
                  showSandboxOutput={showSandboxOutput}
                  onShowSandboxOutputChange={onShowSandboxOutputChange}
                />
              )}

              {activeSection === "models" && (
                <ModelsSection
                  groupedModels={groupedModels}
                  titleGenerationModel={titleGenerationModel}
                  onTitleGenerationModelChange={onTitleGenerationModelChange}
                  maxTokens={maxTokens}
                  onMaxTokensChange={onMaxTokensChange}
                />
              )}

              {activeSection === "appearance" && (
                <AppearanceSection
                  theme={paletteTheme}
                  onThemeChange={onThemeChange}
                />
              )}

              {activeSection === "behavior" && (
                <BehaviorSection
                  showThinking={showThinking}
                  onShowThinkingChange={onShowThinkingChange}
                  showMetrics={showMetrics}
                  onShowMetricsChange={onShowMetricsChange}
                />
              )}

              {activeSection === "data" && (
                <DataSection onImport={onImport} onExportAll={onExportAll} />
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
      </DialogContent>
    </Dialog>
  );
}
