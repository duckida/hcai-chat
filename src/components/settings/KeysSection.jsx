import {
  KeyInput,
  SectionHeading,
  SectionLabel,
} from "@/components/settings/chrome";

export default function KeysSection({
  apiKey,
  onApiKeyChange,
  error,
  showKey,
  onToggleShowKey,
  e2bApiKey,
  onE2bApiKeyChange,
  showE2bKey,
  onToggleShowE2bKey,
}) {
  return (
    <div className="space-y-6">
      <SectionHeading title="Keys" />

      <div className="space-y-3">
        <SectionLabel
          htmlFor="apiKey"
          description="Get your key at ai.hackclub.com."
        >
          HCAI API Key
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

      <div className="space-y-3">
        <SectionLabel htmlFor="e2bApiKey">E2B API Key (optional)</SectionLabel>
        <KeyInput
          id="e2bApiKey"
          type={showE2bKey ? "text" : "password"}
          value={e2bApiKey}
          onChange={(e) => onE2bApiKeyChange(e.target.value)}
          placeholder="e2b_..."
          showValue={showE2bKey}
          onToggleShow={onToggleShowE2bKey}
        />
      </div>
    </div>
  );
}
