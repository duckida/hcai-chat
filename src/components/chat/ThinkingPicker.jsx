"use client";

import { Brain, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/primitives/button";
import {
  MenuContent,
  MenuItem,
  MenuTrigger,
} from "@/components/primitives/menu";
import {
  isThinkingOn,
  resolveThinkingLevel,
  thinkingLevelLabel,
  thinkingOptionsFor,
} from "@/lib/thinking";
import { cn } from "@/lib/utils";
import { useModels } from "@/stores/models";

/**
 * Thinking control, offering the levels the selected model actually takes.
 *
 * The list is not fixed: `/api/models` reports each model's `supported_efforts`
 * (a model may accept only high/medium/low, or none at all, or be unable to be
 * switched off), and the menu is that list. A model with no effort selection
 * gets the on/off switch, and one the catalog says cannot reason gets no menu —
 * the same "not supported by current model" state the web-search and sandbox
 * toggles use.
 *
 * The level is stored globally but resolved per model, so a level the current
 * model does not take shows as the one that will actually be sent; the stored
 * choice is left alone for the model it came from.
 *
 * The label sits on the trigger because "am I thinking, and how hard?" is the
 * question the old binary toggle answered at a glance. It is hidden on the
 * narrowest screens, where the menu is a tap away and the icon keeps its
 * accessible name.
 */
export default function ThinkingPicker({ modelId, value, onChange }) {
  const reasoning = useModels((state) => state.reasoningByModel[modelId]);
  const options = thinkingOptionsFor(reasoning);
  const resolved = resolveThinkingLevel(value, reasoning);

  if (options.length === 0) {
    return (
      <Button
        variant="ghost"
        isDisabled
        aria-label="Thinking not supported by current model"
        className="h-7 sm:h-8 w-auto px-1 sm:px-2 rounded-xl border-none shadow-none opacity-40 cursor-not-allowed text-muted-foreground"
      >
        <Brain className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </Button>
    );
  }

  const label = thinkingLevelLabel(resolved);
  const active = isThinkingOn(resolved);

  return (
    <MenuTrigger>
      <Button
        variant="ghost"
        aria-label={`Thinking level: ${label}`}
        className={cn(
          "h-7 sm:h-8 w-auto gap-0.5 sm:gap-1 px-1 sm:px-2 rounded-xl border-none shadow-none transition-colors",
          active
            ? "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Brain className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        <span className="hidden sm:inline text-[11px] font-semibold">
          {label}
        </span>
        <ChevronDown className="w-3 h-3 opacity-50" />
      </Button>

      <MenuContent
        align="start"
        ariaLabel="Thinking level"
        onAction={(id) => onChange?.(id)}
        className="rounded-2xl border border-border shadow-2xl p-1 min-w-[160px]"
      >
        {options.map((option) => (
          <MenuItem
            key={option.value}
            id={option.value}
            textValue={option.label}
            className="text-[13px] rounded-lg py-2.5 px-4"
          >
            <span className="truncate">{option.label}</span>
            {resolved === option.value && (
              <Check className="h-4 w-4 ml-auto shrink-0" />
            )}
          </MenuItem>
        ))}
      </MenuContent>
    </MenuTrigger>
  );
}
