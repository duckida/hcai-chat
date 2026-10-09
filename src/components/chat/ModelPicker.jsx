"use client";

import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/primitives/button";
import {
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuTrigger,
} from "@/components/primitives/menu";
import { cn } from "@/lib/utils";
import { useModels } from "@/stores/models";

/**
 * Grouped model picker: one provider group per section at every breakpoint.
 *
 * The previous version branched into a desktop submenu and a tap-to-expand
 * mobile accordion — two markup paths to keep in sync, and a nested
 * interaction that had to be relearned per size. A flat grouped list is
 * shorter, scrolls, and takes typeahead (type "gpt" to jump) on both.
 */
export default function ModelPicker({
  value,
  onChange,
  triggerClassName = "",
  align = "start",
  emptyLabel = "Model",
}) {
  const groupedModels = useModels((s) => s.grouped);
  const hasModels = Object.keys(groupedModels).length > 0;
  const selectedName =
    Object.values(groupedModels)
      .flat()
      .find((m) => m.id === value)?.name || emptyLabel;

  return (
    <MenuTrigger>
      <Button
        variant="ghost"
        className={cn(
          "justify-between w-auto min-w-[64px] sm:min-w-[100px] border-none shadow-none hover:bg-accent transition-colors focus-visible:ring-0 font-bold text-[12px] sm:text-[14px] text-foreground bg-transparent gap-0.5 sm:gap-2 h-7 sm:h-9 px-1 sm:px-3 rounded-xl",
          triggerClassName,
        )}
      >
        <span className="truncate min-w-0 max-w-[40px] sm:max-w-[200px]">
          {selectedName}
        </span>
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
      </Button>

      <MenuContent
        align={align}
        ariaLabel="Models"
        onAction={(id) => onChange?.(id)}
        className="rounded-2xl border border-border shadow-2xl p-1 min-w-[220px] max-h-[60vh]"
      >
        {hasModels ? (
          Object.entries(groupedModels).map(([provider, models]) => (
            <MenuGroup key={provider} label={provider}>
              {models.map((model) => (
                <MenuItem
                  key={model.id}
                  id={model.id}
                  textValue={model.name}
                  className="text-[13px] rounded-lg py-2.5 px-4"
                >
                  <span className="truncate">{model.name}</span>
                  {value === model.id && (
                    <Check className="h-4 w-4 ml-auto shrink-0" />
                  )}
                </MenuItem>
              ))}
            </MenuGroup>
          ))
        ) : (
          <MenuItem
            id="__loading"
            isDisabled
            textValue="Loading models"
            className="text-[13px] rounded-lg py-2.5 px-4"
          >
            Loading models...
          </MenuItem>
        )}
      </MenuContent>
    </MenuTrigger>
  );
}
