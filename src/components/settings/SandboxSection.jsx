import { ShieldCheck } from "lucide-react";
import { SectionHeading } from "@/components/settings/chrome";

export default function SandboxSection() {
  return (
    <div className="space-y-6">
      <SectionHeading
        title="Sandbox"
        description="Connect E2B to run code in a secure cloud sandbox."
      />

      <div className="flex items-center gap-3 bg-muted p-4 rounded-xl border border-border">
        <ShieldCheck className="w-5 h-5 text-green-500 shrink-0" />
        <p className="text-[12px] text-muted-foreground font-medium leading-normal">
          Agent mode runs code in an isolated E2B cloud VM. Files written to
          /workspace persist for the conversation while the sandbox is running.
        </p>
      </div>
    </div>
  );
}
