import { SECTIONS } from "@/components/settings/sections";
import { cn } from "@/lib/utils";

export default function SectionTabs({ activeId, onSelect }) {
  return (
    <nav
      aria-label="Settings sections"
      className="min-w-0 overflow-x-auto overscroll-x-contain border-b border-border bg-muted/30 px-4 sm:px-6"
    >
      <div
        className="flex w-max min-w-full items-center gap-2 py-2.5"
        role="tablist"
      >
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const active = activeId === section.id;
          return (
            <button
              key={section.id}
              id={`settings-tab-${section.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-current={active ? "page" : undefined}
              aria-controls="settings-panel"
              onClick={() => onSelect(section.id)}
              className={cn(
                "flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[13px] font-bold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:bg-background hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {section.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
