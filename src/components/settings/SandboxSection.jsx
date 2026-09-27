import { ShieldCheck } from "lucide-react";
import {
  KeyInput,
  SectionHeading,
  SectionLabel,
  SwitchRow,
} from "@/components/settings/chrome";

export default function SandboxSection({
  e2bApiKey,
  onE2bApiKeyChange,
  showE2bKey,
  onToggleShowE2bKey,
  showSandboxCode,
  onShowSandboxCodeChange,
  showSandboxOutput,
  onShowSandboxOutputChange,
}) {
  return (
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

      <div className="flex items-center gap-3 bg-muted p-4 rounded-xl border border-border">
        <ShieldCheck className="w-5 h-5 text-green-500 shrink-0" />
        <p className="text-[12px] text-muted-foreground font-medium leading-normal">
          Agent mode runs code in an isolated E2B cloud VM. Files written to
          /workspace persist for the conversation while the sandbox is running.
        </p>
      </div>

      <SwitchRow
        id="show-sandbox-input"
        label="Show Sandbox Input"
        description="Display code and commands sent to the sandbox."
        checked={showSandboxCode}
        onChange={onShowSandboxCodeChange}
      />

      <SwitchRow
        id="show-sandbox-output"
        label="Show Sandbox Output"
        description="Display stdout and stderr from sandbox execution."
        checked={showSandboxOutput}
        onChange={onShowSandboxOutputChange}
      />
    </div>
  );
}
