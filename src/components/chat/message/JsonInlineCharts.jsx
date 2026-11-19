"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];
const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});
const compactFormat = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function ChartHeader({ title, description }) {
  if (!title && !description) return null;
  return (
    <figcaption className="space-y-1">
      {title && (
        <p className="text-[13px] font-bold tracking-tight text-foreground">
          {title}
        </p>
      )}
      {description && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </figcaption>
  );
}

function EmptyChart() {
  return (
    <p className="rounded-xl bg-muted/50 px-4 py-6 text-center text-xs text-muted-foreground">
      No data to display.
    </p>
  );
}

/** Scaling first keeps even large finite values from overflowing the geometry. */
function normalizedSeries(data) {
  const magnitude = Math.max(1, ...data.map((item) => Math.abs(item.value)));
  return { magnitude, values: data.map((item) => item.value / magnitude) };
}

export function BarChart({ props }) {
  const data = props.data;
  const { magnitude, values } = normalizedSeries(data);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const zero = (-min / span) * 100;
  return (
    <figure className="min-w-0 space-y-4">
      <ChartHeader {...props} />
      {data.length === 0 ? (
        <EmptyChart />
      ) : (
        <div className="space-y-3">
          {data.map((item, index) => {
            const end = ((values[index] - min) / span) * 100;
            return (
              <div key={`${item.label}-${index}`} className="space-y-1.5">
                <div className="flex min-w-0 items-baseline justify-between gap-3 text-xs">
                  <span className="min-w-0 break-words font-medium text-foreground">
                    {item.label}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-foreground">
                    {numberFormat.format(item.value)}
                  </span>
                </div>
                <div className="relative h-7 overflow-hidden rounded-lg bg-muted/70">
                  <span
                    className="absolute inset-y-0 w-px bg-foreground/20"
                    style={{ left: `${zero}%` }}
                  />
                  <span
                    className={cn(
                      "absolute inset-y-1 rounded-md",
                      item.value < 0 ? "bg-destructive/75" : "bg-primary/80",
                    )}
                    style={{
                      left: `${Math.min(zero, end)}%`,
                      width: `${Math.abs(end - zero)}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
          <div className="flex justify-between border-t border-border/60 pt-2 text-[11px] tabular-nums text-muted-foreground">
            <span>{compactFormat.format(min * magnitude)}</span>
            <span>{compactFormat.format(max * magnitude)}</span>
          </div>
        </div>
      )}
    </figure>
  );
}

export function LineChart({ props }) {
  const gradientId = `inline-line-${useId().replace(/:/g, "")}`;
  const data = props.data;
  const { magnitude, values } = normalizedSeries(data);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0) || (min === 0 ? 1 : 0);
  const span = max - min || 1;
  const left = 56;
  const right = 560;
  const top = 20;
  const bottom = 180;
  const coordinates = values.map((value, index) => ({
    x:
      data.length === 1
        ? (left + right) / 2
        : left + (index / (data.length - 1)) * (right - left),
    y: bottom - ((value - min) / span) * (bottom - top),
  }));
  const points = coordinates.map(({ x, y }) => `${x},${y}`).join(" ");
  const ticks = Array.from({ length: 5 }, (_, index) => ({
    y: top + (index / 4) * (bottom - top),
    value: (max - (index / 4) * span) * magnitude,
  }));
  return (
    <figure className="min-w-0 space-y-3">
      <ChartHeader {...props} />
      {data.length === 0 ? (
        <EmptyChart />
      ) : (
        <>
          <svg
            viewBox="0 0 580 200"
            className="block w-full overflow-visible"
            role="img"
            aria-label={props.title || "Line chart"}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--primary)"
                  stopOpacity="0.22"
                />
                <stop
                  offset="100%"
                  stopColor="var(--primary)"
                  stopOpacity="0.02"
                />
              </linearGradient>
            </defs>
            {ticks.map((tick) => (
              <g key={tick.y}>
                <line
                  x1={left}
                  x2={right}
                  y1={tick.y}
                  y2={tick.y}
                  stroke="var(--border)"
                  strokeDasharray="3 5"
                />
                <text
                  x={left - 10}
                  y={tick.y + 4}
                  textAnchor="end"
                  fill="var(--muted-foreground)"
                  fontSize="11"
                >
                  {compactFormat.format(tick.value)}
                </text>
              </g>
            ))}
            {coordinates.length > 1 && (
              <>
                <polygon
                  points={`${left},${bottom} ${points} ${right},${bottom}`}
                  fill={`url(#${gradientId})`}
                />
                <polyline
                  points={points}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}
            {coordinates.map(({ x, y }, index) => (
              <circle
                key={`${data[index].label}-${index}`}
                cx={x}
                cy={y}
                r="4"
                fill="var(--primary)"
                stroke="var(--card)"
                strokeWidth="2"
              >
                <title>
                  {data[index].label}: {numberFormat.format(data[index].value)}
                </title>
              </circle>
            ))}
          </svg>
          <div className="flex min-w-0 justify-between gap-4 text-[11px] text-muted-foreground">
            <span className="min-w-0 break-words">{data[0].label}</span>
            {data.length > 1 && (
              <span className="min-w-0 break-words text-right">
                {data.at(-1).label}
              </span>
            )}
          </div>
          <details className="rounded-xl border border-border/60 bg-muted/25 text-xs">
            <summary className="cursor-pointer px-3 py-2 font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
              View chart data
            </summary>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 border-t border-border/60 px-3 py-3">
              {data.map((item, index) => (
                <DataPair key={`${item.label}-${index}`} item={item} />
              ))}
            </dl>
          </details>
        </>
      )}
    </figure>
  );
}

function DataPair({ item }) {
  return (
    <>
      <dt className="min-w-0 break-words text-muted-foreground">
        {item.label}
      </dt>
      <dd className="font-medium tabular-nums text-foreground">
        {numberFormat.format(item.value)}
      </dd>
    </>
  );
}

function arcPath(start, end) {
  const point = (angle) => {
    const radians = ((angle - 90) * Math.PI) / 180;
    return [100 + 78 * Math.cos(radians), 100 + 78 * Math.sin(radians)];
  };
  const [x1, y1] = point(start);
  const [x2, y2] = point(end);
  return `M 100 100 L ${x1} ${y1} A 78 78 0 ${end - start > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
}

export function PieChart({ props }) {
  const data = props.data;
  const { values } = normalizedSeries(data);
  const total = values.reduce((sum, value) => sum + value, 0);
  const shares = values.map((value) => (total > 0 ? value / total : 0));
  const donut = props.variant !== "pie";
  let angle = 0;
  return (
    <figure className="min-w-0 space-y-4">
      <ChartHeader {...props} />
      {total === 0 ? (
        <EmptyChart />
      ) : (
        <div className="flex min-w-0 flex-col items-center gap-5 @[400px]/inline:flex-row">
          <svg
            viewBox="0 0 200 200"
            className="size-44 shrink-0"
            role="img"
            aria-label={props.title || (donut ? "Donut chart" : "Pie chart")}
          >
            {shares.map((share, index) => {
              const start = angle;
              angle += share * 360;
              if (share === 0) return null;
              const color = COLORS[index % COLORS.length];
              return share >= 1 ? (
                <circle
                  key={data[index].label}
                  cx="100"
                  cy="100"
                  r="78"
                  fill={color}
                >
                  <title>{data[index].label}: 100%</title>
                </circle>
              ) : (
                <path
                  key={`${data[index].label}-${index}`}
                  d={arcPath(start, angle)}
                  fill={color}
                  stroke="var(--card)"
                  strokeWidth="2"
                >
                  <title>
                    {data[index].label}: {numberFormat.format(share * 100)}%
                  </title>
                </path>
              );
            })}
            {donut && <circle cx="100" cy="100" r="54" fill="var(--card)" />}
            {donut && (
              <text
                x="100"
                y="105"
                textAnchor="middle"
                fill="var(--foreground)"
                fontSize="12"
                fontWeight="600"
              >
                {props.centerLabel || "100%"}
              </text>
            )}
          </svg>
          <ul className="list-none m-0 grid w-full min-w-0 gap-3 p-0">
            {data.map((item, index) => (
              <li
                key={`${item.label}-${index}`}
                className="m-0 flex min-w-0 items-center gap-2.5 text-xs"
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="min-w-0 flex-1 break-words font-medium text-foreground">
                  {item.label}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {numberFormat.format(item.value)}
                </span>
                <span className="w-12 shrink-0 text-right font-semibold tabular-nums text-foreground">
                  {numberFormat.format(shares[index] * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}
