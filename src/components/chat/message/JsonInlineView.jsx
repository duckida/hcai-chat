"use client";

import {
  defineRegistry,
  JSONUIProvider,
  Renderer,
  useBoundProp,
} from "@json-render/react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ExternalLink,
  Info,
  Lightbulb,
  Minus,
  RotateCcw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  Checkbox as AriaCheckbox,
  Link as AriaLink,
  Slider as AriaSlider,
  Tabs as AriaTabs,
  Disclosure,
  DisclosurePanel,
  Label,
  Radio,
  RadioGroup,
  SliderOutput,
  SliderThumb,
  SliderTrack,
  Tab,
  TabList,
  TabPanel,
} from "react-aria-components";
import { Button as AppButton } from "@/components/primitives/button";
import { Input as AppInput } from "@/components/primitives/input";
import {
  Select as AppSelect,
  SelectItem,
  SelectPopover,
  SelectTrigger,
  SelectValue,
} from "@/components/primitives/select";
import {
  inlineViewCatalog,
  validateInlineViewProps,
} from "@/lib/inline-view-catalog";
import { cn } from "@/lib/utils";
import { BarChart, LineChart, PieChart } from "./JsonInlineCharts";

const GAP = {
  none: "gap-0",
  xs: "gap-1.5",
  sm: "gap-2.5",
  md: "gap-4",
  lg: "gap-5",
  xl: "gap-6",
};
const GRID = {
  1: "grid-cols-1",
  2: "@[340px]/inline:grid-cols-2",
  3: "@[340px]/inline:grid-cols-2 @[500px]/inline:grid-cols-3",
  4: "@[340px]/inline:grid-cols-2 @[560px]/inline:grid-cols-4",
  5: "@[340px]/inline:grid-cols-2 @[500px]/inline:grid-cols-3 @[600px]/inline:grid-cols-5",
  6: "@[340px]/inline:grid-cols-2 @[500px]/inline:grid-cols-3 @[600px]/inline:grid-cols-6",
};
const ALIGN = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
};
const JUSTIFY = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
};
const SURFACE =
  "min-w-0 rounded-2xl border border-border bg-card text-card-foreground";
const HEADING = {
  h1: "text-2xl font-[900]",
  h2: "text-xl font-extrabold",
  h3: "text-base font-bold",
  h4: "text-[13px] font-bold",
};
const TONE = {
  default: "border-border bg-muted/70 text-muted-foreground",
  primary: "border-primary/20 bg-primary/10 text-foreground",
  success:
    "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning:
    "border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  danger: "border-destructive/20 bg-destructive/10 text-destructive",
  info: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  outline: "border-border bg-transparent text-foreground",
};
const CALLOUT = {
  info: { icon: Info, label: "Information", tone: TONE.info },
  tip: { icon: Lightbulb, label: "Tip", tone: TONE.success },
  warning: { icon: TriangleAlert, label: "Warning", tone: TONE.warning },
  important: {
    icon: Sparkles,
    label: "Important",
    tone: "border-primary/20 bg-primary/8 text-foreground",
  },
};
const NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});
const SKELETON_LINES = ["first", "second", "third", "fourth", "fifth", "sixth"];

function formatNumber(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? NUMBER_FORMAT.format(value)
    : value;
}

/**
 * json-render resolves `$bindState` to a live value and reports the write-back
 * path. The extra local state is only for a control the model bound to nothing:
 * it still moves, so a generated view does not look broken, while a bound
 * control keeps its state in the spec's state tree.
 */
function useLocalBound(propValue, bindingPath, fallback) {
  const [bound, setBound] = useBoundProp(propValue, bindingPath);
  const [local, setLocal] = useState(propValue ?? fallback);
  useEffect(() => {
    setLocal(propValue ?? fallback);
  }, [propValue, fallback]);
  return [
    bindingPath ? bound : local,
    (value) => (bindingPath ? setBound(value) : setLocal(value)),
  ];
}

function Stack({ props, children }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col",
        props.direction === "horizontal" && "flex-row flex-wrap",
        ALIGN[props.align] ||
          (props.direction === "horizontal" ? "items-center" : "items-stretch"),
        JUSTIFY[props.justify],
        GAP[props.gap] || "gap-4",
      )}
    >
      {children}
    </div>
  );
}

function Grid({ props, children }) {
  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-1",
        GRID[props.columns] || GRID[2],
        GAP[props.gap] || "gap-4",
      )}
    >
      {children}
    </div>
  );
}

function Card({ props, children }) {
  return (
    <div
      className={cn(
        SURFACE,
        "space-y-4 p-4 sm:p-5",
        props.variant === "muted" && "bg-muted/40",
        props.variant === "accent" && "border-primary/20 bg-primary/5",
      )}
    >
      {(props.title || props.description) && (
        <div className="space-y-1">
          {props.title && (
            <p className="text-[14px] font-extrabold tracking-tight text-foreground">
              {props.title}
            </p>
          )}
          {props.description && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {props.description}
            </p>
          )}
        </div>
      )}
      {children && (
        <div className="flex min-w-0 flex-col gap-4">{children}</div>
      )}
    </div>
  );
}

function Tabs({ props, bindings, emit, children }) {
  const [value, setValue] = useLocalBound(
    props.value,
    bindings?.value,
    props.tabs[0].value,
  );
  const selected = props.tabs.some((tab) => tab.value === value)
    ? value
    : props.tabs[0].value;
  return (
    <AriaTabs
      selectedKey={selected}
      onSelectionChange={(next) => {
        setValue(String(next));
        emit("change");
      }}
      className="min-w-0 space-y-4"
    >
      <TabList
        aria-label={props.label || "View sections"}
        className="flex min-w-0 gap-1 overflow-x-auto rounded-2xl border border-border bg-muted/60 p-1 [scrollbar-width:thin]"
      >
        {props.tabs.map((tab) => (
          <Tab
            key={tab.value}
            id={tab.value}
            className="flex min-h-9 min-w-fit flex-1 cursor-pointer items-center justify-center rounded-xl px-3 py-2 text-xs font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground data-selected:bg-background data-selected:text-foreground data-selected:shadow-sm data-focus-visible:ring-2 data-focus-visible:ring-ring/40"
          >
            {tab.label}
          </Tab>
        ))}
      </TabList>
      {children}
    </AriaTabs>
  );
}

function TabContent({ props, children }) {
  // Retain controls' local state on a tab switch; inactive panels are hidden
  // and inert, so keyboard users cannot wander into the other tab.
  return (
    <TabPanel
      id={props.value}
      shouldForceMount
      className="flex min-w-0 flex-col gap-4 rounded-xl outline-none data-inert:hidden data-focus-visible:ring-2 data-focus-visible:ring-ring/40"
    >
      {children}
    </TabPanel>
  );
}

function Accordion({ props, bindings, emit, children }) {
  const [expanded, setExpanded] = useLocalBound(
    props.expanded,
    bindings?.expanded,
    false,
  );
  return (
    <Disclosure
      isExpanded={!!expanded}
      onExpandedChange={(next) => {
        setExpanded(next);
        emit("change");
      }}
      className={cn(SURFACE, "group/accordion overflow-hidden bg-muted/20")}
    >
      <h4>
        <AppButton
          slot="trigger"
          variant="ghost"
          className="h-auto min-h-12 w-full justify-between gap-4 whitespace-normal rounded-none px-4 py-3 text-left hover:bg-muted/50"
        >
          <span className="min-w-0 space-y-1">
            <span className="block text-[13px] font-bold">{props.title}</span>
            {props.description && (
              <span className="block text-xs font-normal leading-relaxed text-muted-foreground">
                {props.description}
              </span>
            )}
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 text-muted-foreground group-data-expanded/accordion:rotate-180"
          />
        </AppButton>
      </h4>
      <DisclosurePanel className="border-t border-border/60 px-4 py-4">
        <div className="flex min-w-0 flex-col gap-4">{children}</div>
      </DisclosurePanel>
    </Disclosure>
  );
}

function Heading({ props }) {
  const Tag = props.level || "h3";
  return (
    <Tag
      className={cn(
        "leading-snug tracking-tight text-foreground",
        HEADING[Tag],
      )}
    >
      {props.text}
    </Tag>
  );
}

function Text({ props }) {
  return (
    <p
      className={cn(
        "text-[13px] leading-relaxed text-foreground",
        props.variant === "muted" && "text-muted-foreground",
        props.variant === "caption" && "text-[11px] text-muted-foreground",
        props.variant === "lead" && "text-[15px] leading-relaxed",
      )}
    >
      {props.text}
    </p>
  );
}

function Metric({ props }) {
  const trend = props.trend;
  const TrendIcon =
    trend?.direction === "up"
      ? ArrowUpRight
      : trend?.direction === "down"
        ? ArrowDownRight
        : Minus;
  const tone =
    trend?.sentiment === "positive"
      ? TONE.success
      : trend?.sentiment === "negative"
        ? TONE.danger
        : TONE.default;
  return (
    <div
      className={cn(SURFACE, "relative overflow-hidden bg-muted/20 p-4 sm:p-5")}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-4 left-0 w-0.5 rounded-full bg-primary/60"
      />
      <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        {props.label}
      </p>
      <p className="mt-2 break-words text-[28px] font-extrabold leading-tight tracking-tight tabular-nums text-foreground">
        {formatNumber(props.value)}
        {props.unit && (
          <span className="ml-1.5 text-sm font-medium tracking-normal text-muted-foreground">
            {props.unit}
          </span>
        )}
      </p>
      {trend && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
              tone,
            )}
          >
            <TrendIcon aria-hidden="true" className="size-3" />
            <span className="sr-only">{trend.direction}: </span>
            {formatNumber(trend.value)}
          </span>
          {trend.label && (
            <span className="text-[11px] text-muted-foreground">
              {trend.label}
            </span>
          )}
        </div>
      )}
      {props.description && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {props.description}
        </p>
      )}
    </div>
  );
}

function Table({ props }) {
  const columns = Array.isArray(props.columns) ? props.columns : [];
  const rows = Array.isArray(props.rows) ? props.rows : [];
  return (
    <div className={cn(SURFACE, "overflow-x-auto")}>
      <table className="w-full border-collapse text-left text-xs">
        {props.caption && (
          <caption className="border-b border-border bg-muted/20 px-4 py-3 text-left text-xs font-semibold text-foreground">
            {props.caption}
          </caption>
        )}
        <thead>
          <tr className="bg-muted/60">
            {columns.map((column) => (
              <th
                key={column}
                scope="col"
                className="border-b border-border px-4 py-2.5 font-bold text-foreground"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={`${rowIndex}-${row.join("|")}`}
              className="even:bg-muted/20 hover:bg-muted/40"
            >
              {columns.map((column, columnIndex) => (
                <td
                  key={column}
                  className={cn(
                    "border-b border-border/60 px-4 py-3 leading-relaxed tabular-nums",
                    columnIndex === 0
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {formatNumber(row[columnIndex] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Progress({ props }) {
  const max = props.max || 100;
  const percent = Math.max(0, Math.min(100, (props.value / max) * 100));
  return (
    <div className="min-w-0 space-y-2.5">
      <div className="flex justify-between gap-2 text-xs">
        <span className="truncate font-medium text-foreground">
          {props.label}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {formatNumber(props.value)}
          {max === 100 ? "%" : ` / ${formatNumber(max)}`}
        </span>
      </div>
      <progress
        aria-label={props.label}
        value={Math.max(0, Math.min(max, props.value))}
        max={max}
        className="sr-only"
      />
      <div
        aria-hidden="true"
        className="h-2.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary/85"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function Slider({ props, bindings, emit }) {
  const [value, setValue] = useLocalBound(
    props.value,
    bindings?.value,
    props.min ?? 0,
  );
  return (
    <AriaSlider
      className="min-w-0 space-y-2.5"
      minValue={props.min ?? 0}
      maxValue={props.max ?? 100}
      step={props.step ?? 1}
      value={value ?? 0}
      onChange={(next) => {
        setValue(next);
        emit("change");
      }}
    >
      <div className="flex justify-between gap-2 text-xs font-medium text-foreground">
        <Label>{props.label}</Label>
        <SliderOutput className="tabular-nums text-muted-foreground" />
      </div>
      <SliderTrack className="relative h-6 cursor-pointer">
        <div className="absolute top-2.5 h-1.5 w-full rounded-full bg-muted" />
        <SliderThumb className="top-1.5 size-3.5 rounded-full border-2 border-background bg-primary shadow-sm outline-none data-focus-visible:ring-3 data-focus-visible:ring-ring/40" />
      </SliderTrack>
    </AriaSlider>
  );
}

function Input({ props, bindings, emit }) {
  const id = useId();
  const [value, setValue] = useLocalBound(props.value, bindings?.value, "");
  return (
    <label htmlFor={id} className="block min-w-0 space-y-2">
      <span className="text-xs font-semibold text-foreground">
        {props.label}
      </span>
      <AppInput
        id={id}
        type="text"
        className="h-10 text-[13px] text-foreground"
        placeholder={props.placeholder || ""}
        value={value ?? ""}
        onChange={(event) => {
          setValue(event.target.value);
          emit("change");
        }}
      />
    </label>
  );
}

function Select({ props, bindings, emit }) {
  const [value, setValue] = useLocalBound(
    props.value,
    bindings?.value,
    props.options[0]?.value || "",
  );
  return (
    <AppSelect
      className="flex min-w-0 flex-col gap-2"
      selectedKey={value || null}
      onSelectionChange={(next) => {
        setValue(String(next));
        emit("change");
      }}
    >
      <Label className="text-xs font-semibold text-foreground">
        {props.label}
      </Label>
      <SelectTrigger className="h-10 text-[13px]">
        <SelectValue placeholder="Choose an option" />
      </SelectTrigger>
      <SelectPopover>
        {props.options.map((option) => (
          <SelectItem
            key={option.value}
            id={option.value}
            textValue={option.label}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectPopover>
    </AppSelect>
  );
}

function Checkbox({ props, bindings, emit }) {
  const [checked, setChecked] = useLocalBound(
    props.checked,
    bindings?.checked,
    false,
  );
  return (
    <AriaCheckbox
      className="group/checkbox flex min-w-0 cursor-pointer items-center gap-2.5 text-[13px] text-foreground"
      isSelected={!!checked}
      onChange={(next) => {
        setChecked(next);
        emit("change");
      }}
    >
      <span
        aria-hidden="true"
        className="flex size-4 shrink-0 items-center justify-center rounded-md border border-border bg-input/40 group-data-selected/checkbox:border-primary group-data-selected/checkbox:bg-primary group-data-selected/checkbox:text-primary-foreground group-data-focus-visible/checkbox:ring-3 group-data-focus-visible/checkbox:ring-ring/30"
      >
        <Check className="size-3 opacity-0 group-data-selected/checkbox:opacity-100" />
      </span>
      <span className="min-w-0 break-words">{props.label}</span>
    </AriaCheckbox>
  );
}

function Button({ props, emit }) {
  return (
    <AppButton
      type="button"
      onPress={() => emit("press")}
      variant={
        props.variant === "primary" ? "default" : props.variant || "default"
      }
      className="h-9 text-xs font-semibold"
    >
      {props.label}
    </AppButton>
  );
}

function Quiz({ props }) {
  const [selected, setSelected] = useState("");
  const [checked, setChecked] = useState(false);
  const correct = selected === props.answer;
  return (
    <div className={cn(SURFACE, "space-y-4 p-4 sm:p-5")}>
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        <Sparkles aria-hidden="true" className="size-3.5 text-primary" />
        Quick check
      </div>
      <RadioGroup
        value={selected}
        onChange={(next) => {
          setSelected(next);
          setChecked(false);
        }}
        className="space-y-3"
      >
        <Label className="block text-[14px] font-bold leading-relaxed text-foreground">
          {props.question}
        </Label>
        <div className="space-y-2">
          {props.options.map((option, index) => (
            <Radio
              key={option.value}
              value={option.value}
              className={cn(
                "group/answer flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-border bg-muted/20 px-3 py-3 text-[13px] text-foreground outline-none transition-colors hover:bg-muted/50 data-selected:border-primary/40 data-selected:bg-primary/8 data-focus-visible:ring-3 data-focus-visible:ring-ring/30",
                checked &&
                  option.value === props.answer &&
                  "border-emerald-500/30 bg-emerald-500/10",
                checked &&
                  option.value === selected &&
                  !correct &&
                  "border-destructive/30 bg-destructive/10",
              )}
            >
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-muted text-[11px] font-bold text-muted-foreground group-data-selected/answer:bg-primary group-data-selected/answer:text-primary-foreground"
              >
                {String.fromCharCode(65 + index)}
              </span>
              <span className="min-w-0 flex-1 leading-relaxed">
                {option.label}
              </span>
              {checked && option.value === props.answer && (
                <Check
                  aria-hidden="true"
                  className="size-4 text-emerald-600 dark:text-emerald-300"
                />
              )}
            </Radio>
          ))}
        </div>
      </RadioGroup>
      <div className="flex flex-wrap items-center gap-2">
        <AppButton
          isDisabled={!selected}
          onPress={() => setChecked(true)}
          size="sm"
          className="text-xs font-semibold"
        >
          Check answer
        </AppButton>
        {checked && (
          <AppButton
            variant="ghost"
            size="sm"
            onPress={() => {
              setSelected("");
              setChecked(false);
            }}
            className="gap-1.5 text-xs text-muted-foreground"
          >
            <RotateCcw aria-hidden="true" className="size-3.5" />
            Try again
          </AppButton>
        )}
      </div>
      {checked && (
        <output
          aria-live="polite"
          className={cn(
            "block space-y-1 rounded-xl border px-3 py-3 text-xs leading-relaxed",
            correct ? TONE.success : TONE.warning,
          )}
        >
          <span className="block font-bold">
            {correct ? "Correct!" : "Not quite."}
          </span>
          {props.explanation && (
            <span className="block">{props.explanation}</span>
          )}
        </output>
      )}
    </div>
  );
}

function Separator({ props }) {
  if (!props.label) return <hr className="border-0 border-t border-border" />;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {props.label}
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </div>
  );
}

function Badge({ props }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none",
        TONE[props.variant] || TONE.default,
      )}
    >
      {props.label}
    </span>
  );
}

function Timeline({ props }) {
  return (
    <div className="min-w-0 space-y-4">
      {props.title && (
        <p className="text-[13px] font-bold tracking-tight text-foreground">
          {props.title}
        </p>
      )}
      <ol className="list-none m-0 p-0">
        {props.items.map((item, index) => (
          <li
            key={`${item.title}-${index}`}
            className="relative m-0 flex min-w-0 gap-3 pb-5 last:pb-0"
          >
            {index < props.items.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute bottom-0 left-[11px] top-6 w-px bg-border"
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                "relative flex size-6 shrink-0 items-center justify-center rounded-full border",
                item.status === "complete"
                  ? "border-primary/20 bg-primary/10 text-primary"
                  : item.status === "current"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted text-muted-foreground",
              )}
            >
              {item.status === "complete" ? (
                <Check className="size-3.5" />
              ) : (
                <span className="size-1.5 rounded-full bg-current" />
              )}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-[13px] font-bold text-foreground">
                  {item.title}
                </p>
                {item.date && (
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {item.date}
                  </span>
                )}
              </div>
              {item.status && <span className="sr-only">{item.status}</span>}
              {item.description && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Callout({ props, children }) {
  const variant = CALLOUT[props.variant] || CALLOUT.info;
  const Icon = variant.icon;
  return (
    <aside
      className={cn("flex min-w-0 gap-3 rounded-2xl border p-4", variant.tone)}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-[13px] font-bold">{props.title || variant.label}</p>
        {props.text && <p className="text-xs leading-relaxed">{props.text}</p>}
        {children && (
          <div className="flex min-w-0 flex-col gap-3 text-xs leading-relaxed">
            {children}
          </div>
        )}
      </div>
    </aside>
  );
}

function Link({ props }) {
  return (
    <AriaLink
      href={props.href}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      className="group/link flex min-w-0 items-center gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3 text-foreground outline-none transition-colors hover:border-primary/30 hover:bg-primary/5 data-focus-visible:ring-3 data-focus-visible:ring-ring/30"
    >
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block text-[13px] font-semibold group-hover/link:underline underline-offset-4">
          {props.label}
        </span>
        {props.description && (
          <span className="block text-xs leading-relaxed text-muted-foreground">
            {props.description}
          </span>
        )}
      </span>
      <ExternalLink
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground"
      />
      <span className="sr-only"> (opens in a new tab)</span>
    </AriaLink>
  );
}

function Skeleton({ props }) {
  const shimmer =
    "animate-hcai-shimmer bg-[linear-gradient(90deg,var(--muted)_0%,var(--border)_50%,var(--muted)_100%)] bg-[length:200%_100%] motion-reduce:animate-none";
  return (
    <output
      aria-label={props.label || "Loading content"}
      aria-busy="true"
      className="block min-w-0"
    >
      {props.variant === "circle" ? (
        <span
          aria-hidden="true"
          className={cn("block size-12 rounded-full", shimmer)}
        />
      ) : props.variant === "card" ? (
        <span
          aria-hidden="true"
          className={cn("block h-32 w-full rounded-2xl", shimmer)}
        />
      ) : (
        <span aria-hidden="true" className="block space-y-2.5">
          {SKELETON_LINES.slice(0, props.lines || 3).map((key, index) => (
            <span
              key={key}
              className={cn(
                "block h-3 rounded-full",
                shimmer,
                index === (props.lines || 3) - 1 ? "w-2/3" : "w-full",
              )}
            />
          ))}
        </span>
      )}
    </output>
  );
}

const components = {
  Stack,
  Grid,
  Card,
  Tabs,
  TabContent,
  Accordion,
  Heading,
  Text,
  Quiz,
  InteractiveQuiz: Quiz,
  Separator,
  Metric,
  BarChart,
  LineChart,
  PieChart,
  BarGraph: BarChart,
  LineGraph: LineChart,
  Table,
  Badge,
  Timeline,
  Progress,
  Callout,
  Link,
  Skeleton,
  Slider,
  Input,
  Select,
  Checkbox,
  Button,
};

const { registry } = defineRegistry(inlineViewCatalog, {
  // Literal props were checked at parse time; expressions are resolved by
  // json-render later. Validate their results too, before they reach the DOM.
  components: Object.fromEntries(
    Object.entries(components).map(([name, Component]) => [
      name,
      (input) => {
        const props = validateInlineViewProps(name, input.props);
        return props ? <Component {...input} props={props} /> : null;
      },
    ]),
  ),
});

/** A validated json-render spec, rendered with the app's own components. */
export default function JsonInlineView({ spec }) {
  return (
    <JSONUIProvider registry={registry} initialState={spec.state || {}}>
      <div className="@container/inline min-w-0 font-sans text-[13px] font-normal leading-relaxed text-foreground">
        <Renderer spec={spec} registry={registry} />
      </div>
    </JSONUIProvider>
  );
}
