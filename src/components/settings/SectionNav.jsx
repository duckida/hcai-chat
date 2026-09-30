import { DialogTitle } from "@/components/primitives/dialog";
import { SECTIONS } from "@/components/settings/sections";
import { cn } from "@/lib/utils";

function SidebarNav({ activeId, onSelect }) {
  return (
    <nav
      aria-label="Settings sections"
      className="hidden sm:flex w-56 shrink-0 flex-col gap-1 border-r border-border p-3 bg-muted/30"
    >
      <DialogTitle className="px-3 pb-3 mb-1 text-lg font-[900] tracking-tight text-foreground">
        Settings
      </DialogTitle>
      {SECTIONS.map((section) => {
        const Icon = section.icon;
        const active = activeId === section.id;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelect(section.id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-start gap-3 w-full text-left px-3 py-2.5 rounded-xl transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50",
            )}
          >
            <Icon
              className={cn(
                "w-4 h-4 mt-0.5 shrink-0",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            />
            <div className="min-w-0">
              <div className="text-[13px] font-bold leading-tight">
                {section.label}
              </div>
              <div className="text-[11px] text-muted-foreground font-medium mt-0.5 leading-snug">
                {section.description}
              </div>
            </div>
          </button>
        );
      })}
    </nav>
  );
}

function MobileSectionPills({ activeId, onSelect }) {
  return (
    <div className="sm:hidden border-b border-border px-4 py-3 overflow-x-auto bg-muted/30">
      <div className="flex items-center gap-1.5 min-w-min">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const active = activeId === section.id;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelect(section.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold whitespace-nowrap transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "bg-background text-muted-foreground",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {section.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { MobileSectionPills, SidebarNav };
