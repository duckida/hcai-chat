"use client";

import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, Key, ShieldCheck } from "lucide-react";
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
  Select,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function ApiKeyModal({
  isOpen,
  onClose,
  onSave,
  titleGenerationModel,
  onTitleGenerationModelChange,
}) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");
  const [groupedModels, setGroupedModels] = useState({});

  useEffect(() => {
    if (isOpen) {
      const stored = getStoredApiKey();
      setApiKey(stored || "");
      setError("");
      fetchModels();
    }
  }, [isOpen]);

  const fetchModels = async () => {
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
            const [providerRaw] = model.id.split("/");
            const provider =
              providerRaw.charAt(0).toUpperCase() + providerRaw.slice(1);
            // Keep model name as it comes from hcai (e.g., qwen-3.6-flash)
            const name = model.id.split("/").pop();

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
  };

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
      <DialogContent className="sm:max-w-md bg-white border-[#ececec] rounded-3xl shadow-2xl p-8">
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
            <Select
              value={titleGenerationModel}
              onValueChange={onTitleGenerationModelChange}
            >
              <SelectTrigger className="w-full border-[#ececec] bg-[#f9f9f9] rounded-xl px-4 h-12 focus:bg-white focus:ring-4 focus:ring-slate-100">
                <SelectValue placeholder="Select Model" />
              </SelectTrigger>
              <SelectContent
                position="popper"
                sideOffset={5}
                className="border-[#ececec] shadow-2xl rounded-2xl p-1 min-w-[220px] bg-white z-[100]"
              >
                <ScrollArea className="h-[200px]">
                  {Object.entries(groupedModels).length > 0 ? (
                    Object.entries(groupedModels).map(([provider, models]) => (
                      <SelectGroup key={provider}>
                        <SelectLabel className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-8 py-2 bg-slate-50/50">
                          {provider}
                        </SelectLabel>
                        {models.map((m) => (
                          <SelectItem
                            key={m.id}
                            value={m.id}
                            className="text-[13px] transition-colors rounded-lg py-2.5 px-4 focus:bg-slate-100 cursor-pointer"
                          >
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))
                  ) : (
                    <div className="p-4 text-xs text-center text-slate-400 font-medium">
                      Loading models...
                    </div>
                  )}
                </ScrollArea>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
            <ShieldCheck className="w-5 h-5 text-green-500 shrink-0" />
            <p className="text-[12px] text-slate-500 font-medium leading-normal">
              Your key is stored only on your local device and never sent to our
              servers.
            </p>
          </div>
        </div>

        <DialogFooter className="sm:flex-col sm:space-x-0 space-y-2 mt-2">
          <Button
            onClick={handleSave}
            className="w-full bg-slate-900 hover:bg-black text-white h-12 rounded-xl text-[14px] font-bold shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
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
      </DialogContent>
    </Dialog>
  );
}
