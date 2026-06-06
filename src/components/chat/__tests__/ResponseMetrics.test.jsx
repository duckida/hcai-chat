import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ResponseMetrics from "../ResponseMetrics";

describe("ResponseMetrics", () => {
  it("returns null when usage is not provided", () => {
    const { container } = render(<ResponseMetrics usage={null} duration={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("displays total token count", () => {
    render(
      <ResponseMetrics
        usage={{ inputTokens: 100, outputTokens: 50, model: "google/gemini-3.1-flash-lite" }}
        duration={1.5}
      />,
    );
    expect(screen.getByText("150 tokens")).toBeInTheDocument();
  });

  it("formats short durations in milliseconds", () => {
    render(
      <ResponseMetrics
        usage={{ inputTokens: 1, outputTokens: 1, model: "google/gemini-3.1-flash-lite" }}
        duration={0.5}
      />,
    );
    expect(screen.getByText("500ms")).toBeInTheDocument();
  });

  it("formats mid-range durations in seconds", () => {
    render(
      <ResponseMetrics
        usage={{ inputTokens: 1, outputTokens: 1, model: "google/gemini-3.1-flash-lite" }}
        duration={5.2}
      />,
    );
    expect(screen.getByText("5.2s")).toBeInTheDocument();
  });

  it("formats long durations in minutes and seconds", () => {
    render(
      <ResponseMetrics
        usage={{ inputTokens: 1, outputTokens: 1, model: "google/gemini-3.1-flash-lite" }}
        duration={125}
      />,
    );
    expect(screen.getByText("2m 5s")).toBeInTheDocument();
  });

  it("displays tokens per second", () => {
    render(
      <ResponseMetrics
        usage={{ inputTokens: 1, outputTokens: 100, model: "google/gemini-3.1-flash-lite" }}
        duration={2}
      />,
    );
    expect(screen.getByText("50.00 t/s")).toBeInTheDocument();
  });

  it("shows zero t/s when duration is 0", () => {
    render(
      <ResponseMetrics
        usage={{ inputTokens: 1, outputTokens: 100, model: "google/gemini-3.1-flash-lite" }}
        duration={0}
      />,
    );
    expect(screen.getByText("0.00 t/s")).toBeInTheDocument();
  });

  it("does not display cost when cost is null", () => {
    render(
      <ResponseMetrics
        usage={{
          inputTokens: 1,
          outputTokens: 1,
          model: "google/gemini-3.1-flash-lite",
          cost: null,
        }}
        duration={1}
      />,
    );
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("displays formatted cost when cost is set", () => {
    render(
      <ResponseMetrics
        usage={{
          inputTokens: 1,
          outputTokens: 1,
          model: "google/gemini-3.1-flash-lite",
          cost: 0.0123,
        }}
        duration={1}
      />,
    );
    expect(screen.getByText("$0.0123")).toBeInTheDocument();
  });
});
