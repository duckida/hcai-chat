"use client";

import { useState, useEffect, useRef } from "react";
import {
  Eye,
  EyeOff,
  Key,
  ShieldCheck,
  Check,
  ChevronDown,
} from "lucide-react";
import { getStoredApiKey, setStoredApiKey } from "@/lib/api-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

const Toggle = ({ checked, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
      checked ? "bg-primary" : "bg-slate-300"
    }`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
        checked ? "translate-x-6" : "translate-x-1"
      }`}
    />
  </button>
);

export default function ApiKeyModal({
  isOpen,
  onClose,
  onSave,
  titleGenerationModel,
  onTitleGenerationModelChange,
  theme = "aurora",
  onThemeChange,
  thinkingDefaultView = "closed",
  onThinkingDefaultViewChange,
  showMetrics = true,
  onShowMetricsChange,
}) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");
  const [groupedModels, setGroupedModels] = useState({});
  const [expandedProvider, setExpandedProvider] = useState(null);

  const fetchModels = useRef(async () => {
    try {
      const response = await fetch("/api/models");
      if (response.ok) {
        const data = await response.json();
        if (data.data && Array.isArray(data.data)) {
          // Remove duplicates and group by provider
          const uniqueModels = Array.from(
            new Map(data.data.map((m) => [m.id, m])).values(),
          );

          const grouped = uniqueModels.reduce((acc, model) => {
            let provider, name;
            if (model.name && model.name.includes(":")) {
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

          // Sort providers and their models
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
    } catch (e) {}
  });

  useEffect(() => {
    if (isOpen) {
      const stored = getStoredApiKey();
      setApiKey(stored || "");
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
    onSave?.(apiKey.trim());
    onClose?.();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-white border-[#ececec] rounded-3xl shadow-2xl p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <ScrollArea className="w-full h-[90vh] max-h-[90vh]">
          <div className="p-8">
            <DialogHeader>
              <div className="mx-auto w-16 h-16 rounded-[2rem] bg-slate-900 flex items-center justify-center mb-6 shadow-xl">
                <Key className="h-8 w-8 text-white" />
              </div>
              <DialogTitle className="text-center text-2xl font-[900] tracking-tight text-slate-900 border-none">
                Settings
              </DialogTitle>
              <DialogDescription className="text-center text-slate-500 font-medium text-[14px] mt-2 leading-relaxed">
                Configure your AI endpoint securely. Get your key at
                <a
                  href="https://ai.hackclub.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-900 font-bold hover:underline underline-offset-4 ml-1"
                >
                  ai.hackclub.com
                </a>
                .
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-6 border-none">
              <div className="space-y-3">
                <Label
                  htmlFor="apiKey"
                  className="text-[13px] font-bold text-slate-400 uppercase tracking-widest pl-1"
                >
                  Hack Club API Key
                </Label>
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
                    className={`h-12 border-[#ececec] bg-[#f9f9f9] rounded-xl px-5 transition-all focus:bg-white focus:ring-4 focus:ring-slate-100 placeholder:text-slate-300 font-medium ${error ? "border-red-400 focus:ring-red-500/10" : ""}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-0 h-full px-3 text-slate-400 hover:text-slate-900 hover:bg-transparent transition-colors"
                  >
                    {showKey ? (
                      <EyeOff className="h-4.5 w-4.5" />
                    ) : (
                      <Eye className="h-4.5 w-4.5" />
                    )}
                  </Button>
                </div>
                {error && (
                  <p className="text-xs text-red-500 font-bold pl-1 animate-in fade-in slide-in-from-top-1">
                    {error}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <Label className="text-[13px] font-bold text-slate-400 uppercase tracking-widest pl-1">
                  Title Generation Model
                </Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center justify-between w-full border-[#ececec] bg-[#f9f9f9] rounded-xl px-4 h-12 focus:bg-white focus:ring-4 focus:ring-slate-100 text-sm"
                    >
                      <span className="truncate">
                        {Object.values(groupedModels)
                          .flat()
                          .find((m) => m.id === titleGenerationModel)?.name ||
                          "Select Model"}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-[var(--radix-dropdown-menu-trigger-width)] border-[#ececec] shadow-2xl rounded-2xl p-1 bg-white z-[100] max-h-[40vh] overflow-y-auto"
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
                                  <DropdownMenuSubContent className="border-[#ececec] shadow-2xl rounded-2xl p-1 min-w-[220px] bg-white z-[100] max-h-[40vh] overflow-y-auto">
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
                                  className="w-full flex items-center justify-between text-[13px] transition-colors rounded-lg py-2.5 px-4 cursor-pointer hover:bg-slate-100"
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
                      <div className="p-4 text-xs text-center text-slate-400 font-medium">
                        Loading models...
                      </div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="space-y-3">
                <Label className="text-[13px] font-bold text-slate-400 uppercase tracking-widest pl-1">
                  Theme
                </Label>
                <Select value={theme} onValueChange={onThemeChange}>
                  <SelectTrigger className="w-full border-[#ececec] bg-[#f9f9f9] rounded-xl px-4 h-12 focus:bg-white focus:ring-4 focus:ring-slate-100">
                    <SelectValue placeholder="Select Theme" />
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    sideOffset={5}
                    className="border-[#ececec] shadow-2xl rounded-2xl p-1 min-w-[220px] bg-white z-[100]"
                  >
                    <SelectItem
                      value="aurora"
                      className="text-[13px] transition-colors rounded-lg py-2.5 px-4 focus:bg-slate-100 cursor-pointer"
                    >
                      Aurora
                    </SelectItem>
                    <SelectItem
                      value="sunrise"
                      className="text-[13px] transition-colors rounded-lg py-2.5 px-4 focus:bg-slate-100 cursor-pointer"
                    >
                      Sunrise
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-[13px] font-bold text-slate-400 uppercase tracking-widest pl-1">
                  Thinking Default View
                </Label>
                <Select
                  value={thinkingDefaultView}
                  onValueChange={onThinkingDefaultViewChange}
                >
                  <SelectTrigger className="w-full border-[#ececec] bg-[#f9f9f9] rounded-xl px-4 h-12 focus:bg-white focus:ring-4 focus:ring-slate-100">
                    <SelectValue placeholder="Select Default View" />
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    sideOffset={5}
                    className="border-[#ececec] shadow-2xl rounded-2xl p-1 min-w-[220px] bg-white z-[100]"
                  >
                    <SelectItem
                      value="closed"
                      className="text-[13px] transition-colors rounded-lg py-2.5 px-4 focus:bg-slate-100 cursor-pointer"
                    >
                      Closed
                    </SelectItem>
                    <SelectItem
                      value="open"
                      className="text-[13px] transition-colors rounded-lg py-2.5 px-4 focus:bg-slate-100 cursor-pointer"
                    >
                      Open
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between py-3 px-4 bg-slate-50 rounded-xl border border-slate-100">
                <Label className="text-[13px] font-bold text-slate-700 uppercase tracking-widest">
                  Show Response Metrics
                </Label>
                <Toggle checked={showMetrics} onChange={onShowMetricsChange} />
              </div>

              <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <ShieldCheck className="w-5 h-5 text-green-500 shrink-0" />
                <p className="text-[12px] text-slate-500 font-medium leading-normal">
                  Your key is stored only on your local device and never sent to
                  our servers.
                </p>
              </div>
            </div>

            <DialogFooter className="sm:flex-col sm:space-x-0 space-y-2 mt-2">
              <Button
                onClick={handleSave}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 rounded-xl text-[14px] font-bold shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                Save and Connect
              </Button>
              <Button
                variant="ghost"
                onClick={onClose}
                className="w-full text-slate-400 hover:text-slate-900 h-10 rounded-xl text-[13px] font-semibold"
              >
                Cancel
              </Button>
            </DialogFooter>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
