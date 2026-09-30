import { ShieldCheck } from "lucide-react";
import {
  KeyInput,
  SectionHeading,
  SectionLabel,
} from "@/components/settings/chrome";

export default function ConnectionSection({
  apiKey,
  onApiKeyChange,
  error,
  showKey,
  onToggleShowKey,
}) {
  return (
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
        <KeyInput
          id="apiKey"
          type={showKey ? "text" : "password"}
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          placeholder="sk-hc-v1-..."
          showValue={showKey}
          onToggleShow={onToggleShowKey}
          error={Boolean(error)}
        />
        {error && (
          <p className="text-xs text-red-500 font-bold pl-1 animate-hcai-fade-in-slow">
            {error}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 bg-muted p-4 rounded-xl border border-border">
        <ShieldCheck className="w-5 h-5 text-green-500 shrink-0" />
        <p className="text-[12px] text-muted-foreground font-medium leading-normal">
          Your key is stored only on your local device and never sent to our
          servers.
        </p>
      </div>
    </div>
  );
}
