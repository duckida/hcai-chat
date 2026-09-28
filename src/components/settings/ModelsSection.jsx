import ModelPicker from "@/components/chat/ModelPicker";
import { SectionHeading, SectionLabel } from "@/components/settings/chrome";

export default function ModelsSection({
  titleGenerationModel,
  onTitleGenerationModelChange,
  maxTokens,
  onMaxTokensChange,
}) {
  return (
    <div className="space-y-6">
      <SectionHeading
        title="Models"
        description="Choose the model that generates conversation titles and set output limits."
      />

      <div className="space-y-3">
        <SectionLabel>Title Generation Model</SectionLabel>
        <ModelPicker
          value={titleGenerationModel}
          onChange={onTitleGenerationModelChange}
          triggerClassName="w-full justify-between border-border bg-muted rounded-xl px-4 h-12 font-medium text-sm"
          emptyLabel="Select Model"
        />
      </div>

      <div className="space-y-3">
        <SectionLabel description="Maximum number of tokens the model can generate per response.">
          Max Output Tokens
        </SectionLabel>
        <div className="flex items-center gap-4 px-1">
          <input
            type="range"
            min="256"
            max="1048576"
            step="256"
            value={maxTokens}
            onChange={(e) => onMaxTokensChange(Number(e.target.value))}
            className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-foreground"
          />
          <span className="text-sm font-bold text-foreground min-w-[4rem] text-right tabular-nums">
            {maxTokens.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
