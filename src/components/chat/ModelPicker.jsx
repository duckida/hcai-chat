"use client";

import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Grouped model selector: a submenu per provider on desktop, a tap-to-expand
 * accordion on mobile. The trigger label shows the selected model's name.
 */
export default function ModelPicker({
  groupedModels = {},
  value,
  onChange,
  triggerClassName = "",
  align = "start",
  emptyLabel = "Model",
}) {
  const [expandedProvider, setExpandedProvider] = useState(null);
  const hasModels = Object.keys(groupedModels).length > 0;
  const selectedName =
    Object.values(groupedModels)
      .flat()
      .find((m) => m.id === value)?.name || emptyLabel;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`flex items-center justify-between w-auto min-w-[100px] border-none shadow-none hover:bg-accent transition-colors focus:ring-0 font-bold text-[12px] sm:text-[14px] text-foreground bg-transparent gap-0.5 sm:gap-2 h-7 sm:h-9 px-1.5 sm:px-3 rounded-xl ${triggerClassName}`}
        >
          <span className="truncate min-w-0 max-w-[120px] sm:max-w-[200px]">
            {selectedName}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="border-border shadow-2xl rounded-2xl p-1 min-w-[220px] bg-popover z-[100] max-h-[60vh] overflow-y-auto"
      >
        {hasModels ? (
          <>
            <div className="hidden md:block">
              {Object.entries(groupedModels).map(([provider, models]) => (
                <DropdownMenuSub key={provider}>
                  <DropdownMenuSubTrigger className="text-[13px] transition-colors rounded-lg py-2.5 px-4 cursor-default">
                    {provider}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="border-border shadow-2xl rounded-2xl p-1 min-w-[220px] bg-popover z-[100] max-h-[60vh] overflow-y-auto">
                      {models.map((m) => (
                        <DropdownMenuItem
                          key={m.id}
                          onClick={() => onChange(m.id)}
                          className="text-[13px] transition-colors rounded-lg py-2.5 px-4 cursor-pointer flex items-center justify-between"
                        >
                          <span>{m.name}</span>
                          {value === m.id && <Check className="h-4 w-4 ml-2" />}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              ))}
            </div>
            <div className="md:hidden">
              {Object.entries(groupedModels).map(([provider, models]) => (
                <div key={provider}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setExpandedProvider(
                        expandedProvider === provider ? null : provider,
                      );
                    }}
                    className="w-full flex items-center justify-between text-[13px] transition-colors rounded-lg py-2.5 px-4 cursor-pointer hover:bg-accent"
                  >
                    <span className="font-medium">{provider}</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 opacity-50 transition-transform ${expandedProvider === provider ? "rotate-180" : ""}`}
                    />
                  </button>
                  {expandedProvider === provider && (
                    <div className="pb-1 pl-4">
                      {models.map((m) => (
                        <DropdownMenuItem
                          key={m.id}
                          onClick={() => onChange(m.id)}
                          className="text-[12px] transition-colors rounded-lg py-2 px-3 cursor-pointer flex items-center justify-between"
                        >
                          <span>{m.name}</span>
                          {value === m.id && (
                            <Check className="h-3.5 w-3.5 ml-2" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="p-4 text-xs text-center text-muted-foreground font-medium">
            Loading models...
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
