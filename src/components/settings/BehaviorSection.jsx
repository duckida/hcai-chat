import { SectionHeading, SwitchRow } from "@/components/settings/chrome";

export default function BehaviorSection({
  showThinking,
  onShowThinkingChange,
  showMetrics,
  onShowMetricsChange,
}) {
  return (
    <div className="space-y-6">
      <SectionHeading
        title="Behavior"
        description="Defaults and display preferences."
      />

      <SwitchRow
        id="show-thinking"
        label="Show Thinking"
        description="Expand thinking blocks by default."
        checked={showThinking}
        onChange={onShowThinkingChange}
      />

      <SwitchRow
        id="show-response-metrics"
        label="Show Response Metrics"
        description="Display token count and timing info."
        checked={showMetrics}
        onChange={onShowMetricsChange}
      />
    </div>
  );
}
