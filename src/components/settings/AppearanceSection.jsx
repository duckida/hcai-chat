import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Input } from "@/components/primitives/input";
import {
  Select,
  SelectItem,
  SelectPopover,
  SelectTrigger,
  SelectValue,
} from "@/components/primitives/select";
import {
  SectionHeading,
  SectionLabel,
  SwitchRow,
} from "@/components/settings/chrome";
import { GOOGLE_FONT_FAMILIES } from "@/lib/settings";
import { cn } from "@/lib/utils";

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

export default function AppearanceSection({
  theme: paletteTheme,
  onThemeChange,
  googleFont = "Inter",
  onGoogleFontChange,
  accentColor = "#ec3750",
  onAccentColorChange,
  showThinking,
  onShowThinkingChange,
  showMetrics,
  onShowMetricsChange,
}) {
  return (
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
        <SectionLabel
          id="color-theme-label"
          description="Accent color palette for the interface."
        >
          Color Theme
        </SectionLabel>
        {/* A React Aria Select's trigger is a button, so the <label for> above
            cannot name it and its hidden input warned on every render. Pointing
            at the label element's id is the association that does work. */}
        <Select
          aria-labelledby="color-theme-label"
          selectedKey={paletteTheme}
          onSelectionChange={onThemeChange}
        >
          <SelectTrigger className="w-full border-border bg-muted rounded-xl px-4 h-12 focus:bg-background focus:ring-4 focus:ring-ring">
            <SelectValue placeholder="Select Theme" />
          </SelectTrigger>
          <SelectPopover
            offset={5}
            className="border-border shadow-2xl rounded-2xl p-1 min-w-[220px] bg-popover z-[100]"
          >
            <SelectItem
              id="aurora"
              className="text-[13px] transition-colors rounded-lg py-2.5 px-4 focus:bg-accent cursor-pointer"
            >
              Aurora
            </SelectItem>
            <SelectItem
              id="sunrise"
              className="text-[13px] transition-colors rounded-lg py-2.5 px-4 focus:bg-accent cursor-pointer"
            >
              Sunrise
            </SelectItem>
            <SelectItem
              id="hackclub"
              className="text-[13px] transition-colors rounded-lg py-2.5 px-4 focus:bg-accent cursor-pointer"
            >
              Hack Club
            </SelectItem>
            <SelectItem
              id="custom"
              className="text-[13px] transition-colors rounded-lg py-2.5 px-4 focus:bg-accent cursor-pointer"
            >
              Custom
            </SelectItem>
          </SelectPopover>
        </Select>
      </div>

      {paletteTheme === "custom" && (
        <div className="space-y-4 rounded-2xl border border-border bg-muted/30 p-4 sm:p-5">
          <div className="space-y-2">
            <SectionLabel
              id="google-font-label"
              description="Choose the Google Font used throughout the app."
            >
              Google Font
            </SectionLabel>
            <Select
              aria-labelledby="google-font-label"
              selectedKey={googleFont}
              onSelectionChange={onGoogleFontChange}
            >
              <SelectTrigger className="w-full border-border bg-background rounded-xl px-4 h-12">
                <SelectValue placeholder="Select a font" />
              </SelectTrigger>
              <SelectPopover
                offset={5}
                className="border-border shadow-2xl rounded-2xl p-1 min-w-[220px] bg-popover z-[100]"
              >
                {GOOGLE_FONT_FAMILIES.map((font) => (
                  <SelectItem
                    key={font}
                    id={font}
                    className="text-[13px] transition-colors rounded-lg py-2.5 px-4 focus:bg-accent cursor-pointer"
                  >
                    {font}
                  </SelectItem>
                ))}
              </SelectPopover>
            </Select>
          </div>

          <div className="space-y-2">
            <SectionLabel
              htmlFor="custom-accent-color"
              description="Used for primary buttons, focus rings, and selected accents."
            >
              Accent Color
            </SectionLabel>
            <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-background p-2">
              <Input
                id="custom-accent-color"
                type="color"
                value={accentColor}
                onChange={(event) => onAccentColorChange?.(event.target.value)}
                className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-1"
              />
              <span className="truncate font-mono text-sm font-semibold uppercase text-foreground">
                {accentColor}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3 border-t border-border pt-5">
        <SwitchRow
          id="show-thinking"
          label="Show Thinking"
          description="Expand thinking blocks by default."
          checked={showThinking}
          onChange={onShowThinkingChange}
        />

        <SwitchRow
          id="show-response-metrics"
          label="Show Metrics"
          description="Display token count and timing info."
          checked={showMetrics}
          onChange={onShowMetricsChange}
        />
      </div>
    </div>
  );
}
