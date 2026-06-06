import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ApiKeyModal from "../ApiKeyModal";

const TEST_MODEL = "google/gemini-3.1-flash-lite";

const renderModal = (overrides = {}) => {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    onSave: vi.fn(),
    titleGenerationModel: TEST_MODEL,
    onTitleGenerationModelChange: vi.fn(),
    ...overrides,
  };
  const utils = render(<ApiKeyModal {...props} />);
  return { ...utils, props };
};

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("ApiKeyModal", () => {
  it("renders when isOpen is true", async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByText(/settings/i)).toBeInTheDocument();
    });
  });

  it("preloads the stored API key when opened", async () => {
    localStorage.setItem("hack_club_ai_key", "stored-key");
    renderModal();
    const input = await screen.findByLabelText(/hack club api key/i);
    expect(input.value).toBe("stored-key");
  });

  it("shows an error when saving with an empty key", async () => {
    const user = userEvent.setup();
    const { props } = renderModal();
    const saveBtn = await screen.findByRole("button", {
      name: /save and connect/i,
    });
    await user.click(saveBtn);
    expect(
      await screen.findByText(/valid api key is required/i),
    ).toBeInTheDocument();
    expect(props.onSave).not.toHaveBeenCalled();
    expect(localStorage.getItem("hack_club_ai_key")).toBe(null);
  });

  it("saves the trimmed key on success", async () => {
    const user = userEvent.setup();
    const { props } = renderModal();
    const input = await screen.findByLabelText(/hack club api key/i);
    await user.clear(input);
    await user.type(input, "  my-key  ");
    await user.click(screen.getByRole("button", { name: /save and connect/i }));
    expect(props.onSave).toHaveBeenCalledWith("my-key");
    expect(localStorage.getItem("hack_club_ai_key")).toBe("my-key");
    expect(props.onClose).toHaveBeenCalled();
  });

  it("toggles key visibility via the eye button", async () => {
    renderModal();
    const input = await screen.findByLabelText(/hack club api key/i);
    expect(input.type).toBe("password");
    // Toggle via state change of the only icon button inside the input's wrapper
    const wrapper = input.parentElement;
    const eyeBtn = wrapper.querySelector("button");
    fireEvent.click(eyeBtn);
    await waitFor(() => {
      expect(input.type).toBe("text");
    });
  });

  it("clears the error when the user starts typing", async () => {
    const user = userEvent.setup();
    renderModal();
    const saveBtn = await screen.findByRole("button", {
      name: /save and connect/i,
    });
    await user.click(saveBtn);
    expect(
      await screen.findByText(/valid api key is required/i),
    ).toBeInTheDocument();
    const input = screen.getByLabelText(/hack club api key/i);
    await user.type(input, "k");
    expect(
      screen.queryByText(/valid api key is required/i),
    ).not.toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const { props } = renderModal();
    await screen.findByText(/settings/i);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it("fetches models on open", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            { id: "google/gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite" },
            { id: "openai/gpt-4o", name: "GPT-4o" },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderModal();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/models");
    });
  });

  it("renders the max tokens slider with the current value", async () => {
    renderModal({ maxTokens: 8192 });
    const slider = await screen.findByRole("slider");
    expect(slider.value).toBe("8192");
    expect(screen.getByText("8,192")).toBeInTheDocument();
  });

  it("calls onMaxTokensChange when the slider is moved", async () => {
    const onMaxTokensChange = vi.fn();
    renderModal({ maxTokens: 1024, onMaxTokensChange });
    const slider = await screen.findByRole("slider");
    fireEvent.change(slider, { target: { value: "2048" } });
    expect(onMaxTokensChange).toHaveBeenCalledWith(2048);
  });

  it("toggles the showMetrics switch", async () => {
    const onShowMetricsChange = vi.fn();
    renderModal({ showMetrics: false, onShowMetricsChange });
    await screen.findByText(/show response metrics/i);
    // The label is in a div that also contains the button
    const metricsRow = screen
      .getByText(/show response metrics/i)
      .closest("div");
    const toggleBtn = metricsRow.querySelector("button");
    fireEvent.click(toggleBtn);
    expect(onShowMetricsChange).toHaveBeenCalledWith(true);
  });
});
