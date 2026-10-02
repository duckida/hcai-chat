"use client";

import { Calculator, Search, Wrench } from "lucide-react";

const TOOL_META = {
  web_search: { name: "Search", Icon: Search },
  javascript_calculator: { name: "Calculator", Icon: Calculator },
};

/**
 * A deterministic colour per site, so `reddit.com` keeps its dot between
 * renders and across a reload. Deliberately not a favicon service: that would
 * phone home for every site the model looked up, from inside the thinking
 * block.
 */
function domainHue(domain) {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = (hash * 31 + domain.charCodeAt(i)) % 360;
  }
  return hash;
}

const PILL_CLASS =
  "inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-2.5 py-0.5 text-xs text-muted-foreground";

/**
 * One tool call as it happened: a pill sitting at the point in the reasoning
 * where the model stopped to make it. Search pills become the sites that came
 * back (links, one pill each — the sketch shows them side by side) and show
 * only the query until then; the calculator shows its expression.
 */
export default function ToolChip({ chip }) {
  const { Icon, name } = TOOL_META[chip.tool] ?? {
    Icon: Wrench,
    name: chip.tool,
  };

  if (chip.tool === "web_search" && chip.sources?.length > 0) {
    return (
      <span className="my-1 flex flex-wrap gap-1.5">
        {chip.sources.map((source) => {
          // New chips carry { domain, href }; persisted legacy ones are bare
          // domain strings and keep their old target. Either way the label
          // is the domain and the link is the full result URL.
          const { domain, href } =
            typeof source === "string"
              ? { domain: source, href: `https://${source}` }
              : source;
          return (
            <a
              key={domain}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={PILL_CLASS}
            >
              <span
                aria-hidden="true"
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  backgroundColor: `hsl(${domainHue(domain)} 62% 52%)`,
                }}
              />
              {domain}
            </a>
          );
        })}
      </span>
    );
  }

  const label =
    chip.label ?? (chip.tool === "web_search" ? "Searching…" : name);

  return (
    <span className={`my-1 ${PILL_CLASS}`}>
      <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
