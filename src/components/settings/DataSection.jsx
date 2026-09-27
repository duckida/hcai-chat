import { Download, ShieldCheck, Upload } from "lucide-react";
import { SectionHeading, SectionLabel } from "@/components/settings/chrome";
import { Button } from "@/components/ui/button";

export default function DataSection({ onImport, onExportAll }) {
  return (
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
          Your data stays on your device. Exports never include API keys.
        </p>
      </div>
    </div>
  );
}
