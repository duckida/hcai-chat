import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { SectionHeading, SectionLabel } from "@/components/settings/chrome";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
        <SectionLabel description="Accent color palette for the interface.">
          Color Theme
        </SectionLabel>
        <Select value={paletteTheme} onValueChange={onThemeChange}>
          <SelectTrigger className="w-full border-border bg-muted rounded-xl px-4 h-12 focus:bg-background focus:ring-4 focus:ring-ring">
            <SelectValue placeholder="Select Theme" />
          </SelectTrigger>
          <SelectContent
            position="popper"
            sideOffset={5}
            className="border-border shadow-2xl rounded-2xl p-1 min-w-[220px] bg-popover z-[100]"
          >
            <SelectItem
              value="aurora"
              className="text-[13px] transition-colors rounded-lg py-2.5 px-4 focus:bg-accent cursor-pointer"
            >
              Aurora
            </SelectItem>
            <SelectItem
              value="sunrise"
              className="text-[13px] transition-colors rounded-lg py-2.5 px-4 focus:bg-accent cursor-pointer"
            >
              Sunrise
            </SelectItem>
            <SelectItem
              value="hackclub"
              className="text-[13px] transition-colors rounded-lg py-2.5 px-4 focus:bg-accent cursor-pointer"
            >
              Hack Club
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
