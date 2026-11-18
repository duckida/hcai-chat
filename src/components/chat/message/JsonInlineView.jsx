"use client";

import {
  defineRegistry,
  JSONUIProvider,
  Renderer,
  useBoundProp,
} from "@json-render/react";
import { useState } from "react";
import { inlineViewCatalog } from "@/lib/inline-view-catalog";
import { cn } from "@/lib/utils";

const GAP = { sm: "gap-2", md: "gap-3", lg: "gap-4" };
const GRID = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
};

function formatNumber(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString()
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
        props.direction === "horizontal" &&
          "flex-row flex-wrap items-center justify-start",
        GAP[props.gap] || "gap-3",
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
        GRID[props.columns] || "sm:grid-cols-2",
        GAP[props.gap] || "gap-3",
      )}
    >
      {children}
    </div>
  );
}

function Card({ props, children }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-muted/30 p-3">
      {props.title && (
        <p className="text-sm font-semibold text-foreground">{props.title}</p>
      )}
      {props.description && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {props.description}
        </p>
      )}
      {children && <div className="mt-2 min-w-0">{children}</div>}
    </div>
  );
}

function Heading({ props }) {
  const Tag = props.level || "h3";
  return (
    <Tag className="text-sm font-semibold tracking-tight text-foreground">
      {props.text}
    </Tag>
  );
}

function Text({ props }) {
  return (
    <p
      className={cn(
        "text-sm leading-relaxed",
        props.variant === "muted" && "text-muted-foreground",
      )}
    >
      {props.text}
    </p>
  );
}

function Metric({ props }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-muted/30 p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {props.label}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
        {formatNumber(props.value)}
        {props.unit && (
          <span className="ml-1 text-xs font-medium text-muted-foreground">
            {props.unit}
          </span>
        )}
      </p>
    </div>
  );
}

function BarGraph({ props }) {
  const data = Array.isArray(props.data) ? props.data : [];
  if (data.length === 0) return null;
  const max = Math.max(1, ...data.map((item) => Math.abs(item.value)));
  return (
    <figure className="min-w-0 space-y-2">
      {props.title && (
        <figcaption className="text-xs font-semibold text-foreground">
          {props.title}
        </figcaption>
      )}
      {data.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          className="flex min-w-0 items-center gap-2"
        >
          <span className="w-20 shrink-0 truncate text-[11px] text-muted-foreground">
            {item.label}
          </span>
          <span className="relative h-4 min-w-0 flex-1 overflow-hidden rounded bg-muted">
            <span
              className={cn(
                "absolute inset-y-0 left-0 rounded",
                item.value < 0 ? "bg-destructive/70" : "bg-primary/70",
              )}
              style={{ width: `${(Math.abs(item.value) / max) * 100}%` }}
            />
          </span>
          <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-foreground">
            {formatNumber(item.value)}
          </span>
        </div>
      ))}
    </figure>
  );
}

function LineGraph({ props }) {
  const data = Array.isArray(props.data) ? props.data : [];
  if (data.length === 0) return null;
  const values = data.map((item) => item.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coordinates = data.map((item, index) => ({
    x: data.length === 1 ? 50 : (index / (data.length - 1)) * 100,
    y: 37 - ((item.value - min) / span) * 34,
  }));
  const points = coordinates.map(({ x, y }) => `${x},${y}`).join(" ");
  return (
    <figure className="min-w-0 space-y-1">
      {props.title && (
        <figcaption className="text-xs font-semibold text-foreground">
          {props.title}
        </figcaption>
      )}
      <svg
        viewBox="0 0 100 40"
        className="h-32 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={props.title || "Line graph"}
      >
        {coordinates.length > 1 && (
          <polyline
            points={points}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {coordinates.map(({ x, y }, index) => (
          <circle
            key={`${data[index].label}-${index}`}
            cx={x}
            cy={y}
            r="1.4"
            fill="var(--primary)"
          />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{data[0].label}</span>
        <span>{data[data.length - 1].label}</span>
      </div>
    </figure>
  );
}

function Table({ props }) {
  const columns = Array.isArray(props.columns) ? props.columns : [];
  const rows = Array.isArray(props.rows) ? props.rows : [];
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full border-collapse text-left text-[11px]">
        {props.caption && (
          <caption className="pb-1 text-left text-xs text-muted-foreground">
            {props.caption}
          </caption>
        )}
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                className="border-b border-border px-2 py-1 font-semibold text-foreground"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${rowIndex}-${row.join("|")}`}>
              {columns.map((column, columnIndex) => (
                <td
                  key={column}
                  className="border-b border-border/60 px-2 py-1 text-muted-foreground"
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
    <div className="min-w-0 space-y-1">
      <div className="flex justify-between gap-2 text-[11px]">
        <span className="truncate font-medium text-foreground">
          {props.label}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {formatNumber(props.value)}
          {max === 100 ? "%" : ` / ${formatNumber(max)}`}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
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
    <label className="block min-w-0 space-y-1">
      <span className="flex justify-between gap-2 text-[11px] font-medium text-foreground">
        <span className="truncate">{props.label}</span>
        <span className="tabular-nums text-muted-foreground">
          {formatNumber(value)}
        </span>
      </span>
      <input
        type="range"
        className="h-2 w-full cursor-pointer accent-primary"
        min={props.min ?? 0}
        max={props.max ?? 100}
        step={props.step ?? 1}
        value={value ?? 0}
        onChange={(event) => {
          const next = Number(event.target.value);
          setValue(next);
          emit("change");
        }}
      />
    </label>
  );
}

function Input({ props, bindings, emit }) {
  const [value, setValue] = useLocalBound(props.value, bindings?.value, "");
  return (
    <label className="block min-w-0 space-y-1">
      <span className="text-[11px] font-medium text-foreground">
        {props.label}
      </span>
      <input
        type="text"
        className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
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
  const [value, setValue] = useLocalBound(props.value, bindings?.value, "");
  return (
    <label className="block min-w-0 space-y-1">
      <span className="text-[11px] font-medium text-foreground">
        {props.label}
      </span>
      <select
        className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
        value={value ?? ""}
        onChange={(event) => {
          setValue(event.target.value);
          emit("change");
        }}
      >
        {(props.options || []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Checkbox({ props, bindings, emit }) {
  const [checked, setChecked] = useLocalBound(
    props.checked,
    bindings?.checked,
    false,
  );
  return (
    <label className="flex min-w-0 items-center gap-2 text-sm text-foreground">
      <input
        type="checkbox"
        className="h-4 w-4 shrink-0 cursor-pointer accent-primary"
        checked={!!checked}
        onChange={(event) => {
          setChecked(event.target.checked);
          emit("change");
        }}
      />
      <span className="truncate">{props.label}</span>
    </label>
  );
}

function Button({ props, emit }) {
  return (
    <button
      type="button"
      onClick={() => emit("press")}
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-lg px-3 text-[12px] font-semibold transition-colors",
        props.variant === "secondary"
          ? "bg-muted text-foreground hover:bg-muted/80"
          : "bg-primary text-primary-foreground hover:bg-primary/90",
      )}
    >
      {props.label}
    </button>
  );
}

const { registry } = defineRegistry(inlineViewCatalog, {
  components: {
    Stack,
    Grid,
    Card,
    Heading,
    Text,
    Metric,
    BarGraph,
    LineGraph,
    Table,
    Progress,
    Slider,
    Input,
    Select,
    Checkbox,
    Button,
  },
});

/** A validated json-render spec, rendered with the app's own components. */
export default function JsonInlineView({ spec }) {
  return (
    <JSONUIProvider registry={registry} initialState={spec.state || {}}>
      <Renderer spec={spec} registry={registry} />
    </JSONUIProvider>
  );
}
