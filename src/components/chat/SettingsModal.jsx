"use client";

import {
  Brain,
  Check,
  ChevronDown,
  Cloud,
  Download,
  Eye,
  EyeOff,
  Key,
  Monitor,
  Moon,
  Palette,
  ShieldCheck,
  Sliders,
  Sun,
  Upload,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getStoredApiKey,
  getStoredE2bApiKey,
  setStoredApiKey,
  setStoredE2bApiKey,
} from "@/lib/api-client";
import { cn } from "@/lib/utils";

const Toggle = ({ checked, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
      checked ? "bg-primary" : "bg-muted-foreground/30"
    }`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
        checked ? "translate-x-6" : "translate-x-1"
      }`}
    />
  </button>
);

const SECTIONS = [
  {
    id: "connection",
    label: "Connection",
    description: "API key & security",
    icon: Key,
  },
  {
    id: "sandbox",
    label: "Sandbox",
    description: "Cloud Sandbox & E2B",
    icon: Cloud,
  },
  {
    id: "models",
    label: "Models",
    description: "Title generation & limits",
    icon: Brain,
  },
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme & color mode",
    icon: Palette,
  },
  {
    id: "behavior",
    label: "Behavior",
    description: "Defaults & metrics",
    icon: Sliders,
  },
  {
    id: "data",
    label: "Data",
    description: "Import & export",
    icon: Download,
  },
];

function SectionLabel({ htmlFor, children, description }) {
  return (
    <div className="space-y-1">
      <Label
        htmlFor={htmlFor}
        className="text-[13px] font-bold text-muted-foreground uppercase tracking-widest pl-1"
      >
        {children}
      </Label>
      {description && (
        <p className="text-xs text-muted-foreground pl-1 leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}

function SectionHeading({ title, description }) {
  return (
    <div className="space-y-1">
      <h3 className="text-xl font-[900] tracking-tight text-foreground">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}

function DarkModeSelector() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const current = mounted ? theme : "system";

  const options = [
    { value: "light", label: "Light", icon: Sun },
    { value: "system", label: "System", icon: Monitor },
    { value: "dark", label: "Dark", icon: Moon },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Color mode"
      className="flex items-center gap-1 p-1 bg-muted rounded-xl border border-border"
    >
      {options.map((opt) => {
        const active = current === opt.value;
        const Icon = opt.icon;
        return (
          <label
            key={opt.value}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 h-10 rounded-lg text-[13px] font-semibold transition-all cursor-pointer select-none",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <input
              type="radio"
              name="color-mode"
              value={opt.value}
              checked={active}
              onChange={() => setTheme(opt.value)}
              className="sr-only"
            />
            <Icon className="w-4 h-4" />
            <span>{opt.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function SidebarNav({ activeId, onSelect }) {
  return (
    <nav
      aria-label="Settings sections"
      className="hidden sm:flex w-56 shrink-0 flex-col gap-1 border-r border-border p-3 bg-muted/30"
    >
      <DialogTitle className="px-3 pb-3 mb-1 text-lg font-[900] tracking-tight text-foreground">
        Settings
      </DialogTitle>
      {SECTIONS.map((section) => {
        const Icon = section.icon;
        const active = activeId === section.id;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelect(section.id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-start gap-3 w-full text-left px-3 py-2.5 rounded-xl transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50",
            )}
          >
            <Icon
              className={cn(
                "w-4 h-4 mt-0.5 shrink-0",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            />
            <div className="min-w-0">
              <div className="text-[13px] font-bold leading-tight">
                {section.label}
              </div>
              <div className="text-[11px] text-muted-foreground font-medium mt-0.5 leading-snug">
                {section.description}
              </div>
            </div>
          </button>
        );
      })}
    </nav>
  );
}

function MobileSectionPills({ activeId, onSelect }) {
  return (
    <div className="sm:hidden border-b border-border px-4 py-3 overflow-x-auto bg-muted/30">
      <div className="flex items-center gap-1.5 min-w-min">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const active = activeId === section.id;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelect(section.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold whitespace-nowrap transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "bg-background text-muted-foreground",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {section.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
  const [groupedModels, setGroupedModels] = useState({});
  const [expandedProvider, setExpandedProvider] = useState(null);
  const [activeSection, setActiveSection] = useState("connection");

  const fetchModels = useRef(async () => {
    try {
      const response = await fetch("/api/models");
      if (response.ok) {
        const data = await response.json();
        if (data.data && Array.isArray(data.data)) {
          const uniqueModels = Array.from(
            new Map(data.data.map((m) => [m.id, m])).values(),
          );

          const grouped = uniqueModels.reduce((acc, model) => {
            let provider;
            let name;
            if (model.name?.includes(":")) {
              const parts = model.name.split(":");
              provider = parts[0].trim();
              name = parts.slice(1).join(":").trim();
            } else {
              const [providerRaw] = model.id.split("/");
              provider =
                providerRaw.charAt(0).toUpperCase() + providerRaw.slice(1);
              name = model.name || model.id.split("/").pop();
            }

            if (!acc[provider]) acc[provider] = [];
            acc[provider].push({ id: model.id, name });
            return acc;
          }, {});

          const sortedGrouped = {};
          Object.keys(grouped)
            .sort()
            .forEach((provider) => {
              sortedGrouped[provider] = grouped[provider].sort((a, b) =>
                a.name.localeCompare(b.name),
              );
            });

          setGroupedModels(sortedGrouped);
        }
      }
    } catch (_e) {}
  });

  useEffect(() => {
    if (isOpen) {
      const stored = getStoredApiKey();
      setApiKey(stored || "");
      const storedE2b = getStoredE2bApiKey();
      setE2bApiKey(storedE2b || "");
      setError("");
      fetchModels.current();
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
          <ScrollArea className="flex-1 w-full sm:max-h-[90vh]">
            <div className="p-6 sm:p-8">
              {activeSection === "connection" && (
                <div className="space-y-6">
                  <SectionHeading
                    title="Connection"
                    description="Connect to your AI provider. Your key is stored locally."
                  />

                  <div className="space-y-3">
                    <SectionLabel
                      htmlFor="apiKey"
                      description="Get your key at ai.hackclub.com."
                    >
                      Hack Club API Key
                    </SectionLabel>
                    <div className="relative group">
                      <Input
                        id="apiKey"
                        type={showKey ? "text" : "password"}
                        value={apiKey}
                        onChange={(e) => {
                          setApiKey(e.target.value);
                          setError("");
                        }}
                        placeholder="sk-hc-v1-..."
                        className={`h-12 border-border bg-muted rounded-xl px-5 transition-all focus:bg-background focus:ring-4 focus:ring-ring placeholder:text-muted-foreground font-medium ${error ? "border-red-400 focus:ring-destructive/10" : ""}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-2 top-0 h-full px-3 text-muted-foreground hover:text-foreground hover:bg-transparent transition-colors"
                      >
                        {showKey ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {error && (
                      <p className="text-xs text-red-500 font-bold pl-1 animate-in fade-in slide-in-from-top-1">
                        {error}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 bg-muted p-4 rounded-xl border border-border">
                    <ShieldCheck className="w-5 h-5 text-green-500 shrink-0" />
                    <p className="text-[12px] text-muted-foreground font-medium leading-normal">
                      Your key is stored only on your local device and never
                      sent to our servers.
                    </p>
                  </div>
                </div>
              )}

              {activeSection === "sandbox" && (
                <div className="space-y-6">
                  <SectionHeading
                    title="Sandbox"
                    description="Connect E2B to run code in a secure cloud sandbox."
                  />

                  <div className="space-y-3">
                    <SectionLabel
                      htmlFor="e2bApiKey"
                      description="Get your key at e2b.dev/dashboard?tab=keys. Sandbox usage is billed to your E2B account."
                    >
                      E2B API Key (optional)
                    </SectionLabel>
                    <div className="relative group">
                      <Input
                        id="e2bApiKey"
                        type={showE2bKey ? "text" : "password"}
                        value={e2bApiKey}
                        onChange={(e) => setE2bApiKey(e.target.value)}
                        placeholder="e2b_..."
                        className="h-12 border-border bg-muted rounded-xl px-5 transition-all focus:bg-background focus:ring-4 focus:ring-ring placeholder:text-muted-foreground font-medium"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowE2bKey(!showE2bKey)}
                        className="absolute right-2 top-0 h-full px-3 text-muted-foreground hover:text-foreground hover:bg-transparent transition-colors"
                      >
                        {showE2bKey ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-muted p-4 rounded-xl border border-border">
                    <ShieldCheck className="w-5 h-5 text-green-500 shrink-0" />
                    <p className="text-[12px] text-muted-foreground font-medium leading-normal">
                      Agent mode runs code in an isolated E2B cloud VM. Files
                      written to /workspace persist for the conversation while
                      the sandbox is running.
                    </p>
                  </div>

                  <div className="flex items-center justify-between py-3 px-4 bg-muted rounded-xl border border-border">
                    <div>
                      <Label className="text-[13px] font-bold text-foreground uppercase tracking-widest">
                        Show Sandbox Input
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5 pl-1">
                        Display code and commands sent to the sandbox.
                      </p>
                    </div>
                    <Toggle
                      checked={showSandboxCode}
                      onChange={onShowSandboxCodeChange}
                    />
                  </div>

                  <div className="flex items-center justify-between py-3 px-4 bg-muted rounded-xl border border-border">
                    <div>
                      <Label className="text-[13px] font-bold text-foreground uppercase tracking-widest">
                        Show Sandbox Output
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5 pl-1">
                        Display stdout and stderr from sandbox execution.
                      </p>
                    </div>
                    <Toggle
                      checked={showSandboxOutput}
                      onChange={onShowSandboxOutputChange}
                    />
                  </div>
                </div>
              )}

              {activeSection === "models" && (
                <div className="space-y-6">
                  <SectionHeading
                    title="Models"
                    description="Choose the model that generates conversation titles and set output limits."
                  />

                  <div className="space-y-3">
                    <SectionLabel>Title Generation Model</SectionLabel>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center justify-between w-full border-border bg-muted rounded-xl px-4 h-12 focus:bg-background focus:ring-4 focus:ring-ring text-sm"
                        >
                          <span className="truncate">
                            {Object.values(groupedModels)
                              .flat()
                              .find((m) => m.id === titleGenerationModel)
                              ?.name || "Select Model"}
                          </span>
                          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        className="w-[var(--radix-dropdown-menu-trigger-width)] border-border shadow-2xl rounded-2xl p-1 bg-popover z-[100] max-h-[40vh] overflow-y-auto"
                      >
                        {Object.entries(groupedModels).length > 0 ? (
                          <>
                            <div className="hidden md:block">
                              {Object.entries(groupedModels).map(
                                ([provider, models]) => (
                                  <DropdownMenuSub key={provider}>
                                    <DropdownMenuSubTrigger className="text-[13px] transition-colors rounded-lg py-2.5 px-4 cursor-default">
                                      {provider}
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuPortal>
                                      <DropdownMenuSubContent className="border-border shadow-2xl rounded-2xl p-1 min-w-[220px] bg-popover z-[100] max-h-[40vh] overflow-y-auto">
                                        {models.map((m) => (
                                          <DropdownMenuItem
                                            key={m.id}
                                            onClick={() =>
                                              onTitleGenerationModelChange(m.id)
                                            }
                                            className="text-[13px] transition-colors rounded-lg py-2.5 px-4 cursor-pointer flex items-center justify-between"
                                          >
                                            <span>{m.name}</span>
                                            {titleGenerationModel === m.id && (
                                              <Check className="h-4 w-4 ml-2" />
                                            )}
                                          </DropdownMenuItem>
                                        ))}
                                      </DropdownMenuSubContent>
                                    </DropdownMenuPortal>
                                  </DropdownMenuSub>
                                ),
                              )}
                            </div>
                            <div className="md:hidden">
                              {Object.entries(groupedModels).map(
                                ([provider, models]) => (
                                  <div key={provider}>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setExpandedProvider(
                                          expandedProvider === provider
                                            ? null
                                            : provider,
                                        );
                                      }}
                                      className="w-full flex items-center justify-between text-[13px] transition-colors rounded-lg py-2.5 px-4 cursor-pointer hover:bg-accent"
                                    >
                                      <span className="font-medium">
                                        {provider}
                                      </span>
                                      <ChevronDown
                                        className={`h-3.5 w-3.5 opacity-50 transition-transform ${expandedProvider === provider ? "rotate-180" : ""}`}
                                      />
                                    </button>
                                    {expandedProvider === provider && (
                                      <div className="pb-1 pl-4">
                                        {models.map((m) => (
                                          <DropdownMenuItem
                                            key={m.id}
                                            onClick={() =>
                                              onTitleGenerationModelChange(m.id)
                                            }
                                            className="text-[12px] transition-colors rounded-lg py-2 px-3 cursor-pointer flex items-center justify-between"
                                          >
                                            <span>{m.name}</span>
                                            {titleGenerationModel === m.id && (
                                              <Check className="h-3.5 w-3.5 ml-2" />
                                            )}
                                          </DropdownMenuItem>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ),
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="p-4 text-xs text-center text-muted-foreground font-medium">
                            Loading models...
                          </div>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="space-y-3">
                    <SectionLabel description="Maximum number of tokens the model can generate per response.">
                      Max Output Tokens
                    </SectionLabel>
                    <div className="flex items-center gap-4 px-1">
                      <input
                        type="range"
                        min="256"
                        max="32768"
                        step="256"
                        value={maxTokens}
                        onChange={(e) =>
                          onMaxTokensChange(Number(e.target.value))
                        }
                        className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-foreground"
                      />
                      <span className="text-sm font-bold text-foreground min-w-[4rem] text-right tabular-nums">
                        {maxTokens.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === "appearance" && (
                <div className="space-y-6">
                  <SectionHeading
                    title="Appearance"
                    description="Customize how the app looks."
                  />

                  <div className="space-y-3">
                    <SectionLabel description="Choose light, dark, or follow your system.">
                      Color Mode
                    </SectionLabel>
                    <DarkModeSelector />
                  </div>

                  <div className="space-y-3">
                    <SectionLabel description="Accent color palette for the interface.">
                      Color Theme
                    </SectionLabel>
                    <Select value={paletteTheme} onValueChange={onThemeChange}>
                      <SelectTrigger className="w-full border-border bg-muted rounded-xl px-4 h-12 focus:bg-background focus:ring-4 focus:ring-ring">
                        <SelectValue placeholder="Select Theme" />
                      </SelectTrigger>
                      <SelectContent
                        position="popper"
                        sideOffset={5}
                        className="border-border shadow-2xl rounded-2xl p-1 min-w-[220px] bg-popover z-[100]"
                      >
                        <SelectItem
                          value="aurora"
                          className="text-[13px] transition-colors rounded-lg py-2.5 px-4 focus:bg-accent cursor-pointer"
                        >
                          Aurora
                        </SelectItem>
                        <SelectItem
                          value="sunrise"
                          className="text-[13px] transition-colors rounded-lg py-2.5 px-4 focus:bg-accent cursor-pointer"
                        >
                          Sunrise
                        </SelectItem>
                        <SelectItem
                          value="hackclub"
                          className="text-[13px] transition-colors rounded-lg py-2.5 px-4 focus:bg-accent cursor-pointer"
                        >
                          Hack Club
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {activeSection === "behavior" && (
                <div className="space-y-6">
                  <SectionHeading
                    title="Behavior"
                    description="Defaults and display preferences."
                  />

                  <div className="flex items-center justify-between py-3 px-4 bg-muted rounded-xl border border-border">
                    <div>
                      <Label className="text-[13px] font-bold text-foreground uppercase tracking-widest">
                        Show Thinking
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5 pl-1">
                        Expand thinking blocks by default.
                      </p>
                    </div>
                    <Toggle
                      checked={showThinking}
                      onChange={onShowThinkingChange}
                    />
                  </div>

                  <div className="flex items-center justify-between py-3 px-4 bg-muted rounded-xl border border-border">
                    <div>
                      <Label className="text-[13px] font-bold text-foreground uppercase tracking-widest">
                        Show Response Metrics
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5 pl-1">
                        Display token count and timing info.
                      </p>
                    </div>
                    <Toggle
                      checked={showMetrics}
                      onChange={onShowMetricsChange}
                    />
                  </div>
                </div>
              )}

              {activeSection === "data" && (
                <div className="space-y-6">
                  <SectionHeading
                    title="Data"
                    description="Import and export your conversations."
                  />

                  <div className="space-y-3">
                    <SectionLabel description="Export all your conversations as a zip file.">
                      Export All Conversations
                    </SectionLabel>
                    <Button
                      onClick={onExportAll}
                      className="w-full h-12 rounded-xl font-bold gap-2"
                      variant="outline"
                    >
                      <Download className="w-4 h-4" />
                      Export All
                    </Button>
                  </div>

                  <div className="space-y-3">
                    <SectionLabel description="Import conversations from a zip or JSON file.">
                      Import Data
                    </SectionLabel>
                    <Button
                      onClick={onImport}
                      className="w-full h-12 rounded-xl font-bold gap-2"
                      variant="outline"
                    >
                      <Upload className="w-4 h-4" />
                      Import
                    </Button>
                  </div>

                  <div className="flex items-center gap-3 bg-muted p-4 rounded-xl border border-border">
                    <ShieldCheck className="w-5 h-5 text-green-500 shrink-0" />
                    <p className="text-[12px] text-muted-foreground font-medium leading-normal">
                      Your data stays on your device. Exports never include API
                      keys.
                    </p>
                  </div>
                </div>
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
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
