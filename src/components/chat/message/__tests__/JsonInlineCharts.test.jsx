import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BarChart, LineChart, PieChart } from "../JsonInlineCharts";

describe("inline charts", () => {
  it("places positive and negative bars on opposite sides of zero", () => {
    const view = render(<BarChart props={{ title: "Changes", data: [{ label: "Gain", value: 10 }, { label: "Loss", value: -10 }] }} />);
    const bars = view.container.querySelectorAll("span.absolute.rounded-md");
    expect(bars).toHaveLength(2);
    expect(bars[0].style.left).toBe("50%");
    expect(bars[0].style.width).toBe("50%");
    expect(bars[1].style.left).toBe("0%");
    expect(bars[1].style.width).toBe("50%");
    expect(bars[0]).toHaveClass("bg-primary/80");
    expect(bars[1]).toHaveClass("bg-destructive/75");
    expect(screen.getByText("Gain")).toBeInTheDocument();
    expect(screen.getByText("Loss")).toBeInTheDocument();
  });

  it("renders single points, axes and an accessible data disclosure", () => {
    const view = render(<LineChart props={{ title: "Temperature", data: [{ label: "Monday", value: 12 }] }} />);
    expect(screen.getByRole("img", { name: "Temperature" })).toBeInTheDocument();
    expect(view.container.querySelectorAll("circle")).toHaveLength(1);
    expect(view.container.querySelector("circle")).toHaveAttribute("cx", "308");
    expect(view.container.querySelector("polyline")).toBeNull();
    expect(view.container.querySelectorAll("line")).toHaveLength(5);
    expect(screen.getByText("View chart data")).toBeInTheDocument();
    expect(screen.getByRole("definition")).toHaveTextContent("12");
  });

  it("uses unique theme-colored area gradients in adjacent charts", () => {
    const props = { title: "Trend", data: [{ label: "Start", value: 10 }, { label: "End", value: 20 }] };
    const view = render(<><LineChart props={props} /><LineChart props={props} /></>);
    const gradients = [...view.container.querySelectorAll("linearGradient")];
    expect(gradients).toHaveLength(2);
    expect(gradients[0].id).not.toBe(gradients[1].id);
    const fills = [...view.container.querySelectorAll("polygon")];
    fills.forEach((fill, index) => expect(fill).toHaveAttribute("fill", `url(#${gradients[index].id})`));
    expect(view.container.querySelector("polyline")).toHaveAttribute("stroke", "var(--primary)");
  });

  it("draws labeled pie proportions with the app chart palette", () => {
    const view = render(<PieChart props={{ title: "Storage", data: [{ label: "Used", value: 75 }, { label: "Free", value: 25 }], centerLabel: "Storage" }} />);
    expect(screen.getByRole("img", { name: "Storage" })).toBeInTheDocument();
    const slices = view.container.querySelectorAll("path");
    expect(slices).toHaveLength(2);
    expect(slices[0]).toHaveAttribute("fill", "var(--chart-1)");
    expect(slices[1]).toHaveAttribute("fill", "var(--chart-2)");
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByRole("list")).toHaveClass("list-none");
    expect(view.container.querySelector('circle[r="54"]')).not.toBeNull();
  });

  it("handles a single full pie without a degenerate arc", () => {
    const view = render(<PieChart props={{ data: [{ label: "All", value: 1 }], variant: "pie" }} />);
    expect(view.container.querySelectorAll("path")).toHaveLength(0);
    expect(view.container.querySelector('circle[r="78"]')).not.toBeNull();
    expect(view.container.querySelector('circle[r="54"]')).toBeNull();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it.each([
    [BarChart, []],
    [LineChart, []],
    [PieChart, [{ label: "Empty", value: 0 }]],
  ])("has a clear empty state instead of invalid geometry", (Component, data) => {
    const view = render(<Component props={{ data }} />);
    expect(screen.getByText("No data to display.")).toBeInTheDocument();
    expect(view.container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it.each([BarChart, LineChart, PieChart])("keeps geometry finite for extreme finite values", (Component) => {
    const view = render(<Component props={{ data: [{ label: "Large", value: Number.MAX_VALUE }, { label: "Other", value: Number.MAX_VALUE }] }} />);
    for (const element of view.container.querySelectorAll("[style], [points], [d], circle")) {
      for (const attr of ["style", "points", "d", "cx", "cy"]) {
        expect(element.getAttribute(attr) || "").not.toMatch(/NaN|Infinity/);
      }
    }
  });
});
