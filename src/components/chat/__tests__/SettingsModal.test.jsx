import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSetTheme = vi.fn();
let mockThemeState = { theme: "system", setTheme: mockSetTheme, resolvedTheme: "light" };

vi.mock("next-themes", () => ({
  useTheme: () => mockThemeState,
  ThemeProvider: ({ children }) => children,
}));

import SettingsModal from "../SettingsModal";

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
  const utils = render(<SettingsModal {...props} />);
  return { ...utils, props };
};

const goToSection = async (user, label) => {
  const nav = screen.getByRole("navigation", { name: /settings sections/i });
  await user.click(
    within(nav).getByRole("button", { name: new RegExp(`^${label}`, "i") }),
  );
  await screen.findByRole("heading", { name: new RegExp(`^${label}$`, "i") });
};

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  mockSetTheme.mockClear();
  mockThemeState = {
    theme: "system",
    setTheme: mockSetTheme,
    resolvedTheme: "light",
  };
});

describe("SettingsModal", () => {
  it("renders when isOpen is true", async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByText(/^Settings$/)).toBeInTheDocument();
    });
  });

  it("starts on the Connection section", async () => {
    renderModal();
    expect(
      await screen.findByRole("heading", { name: /^Connection$/ }),
    ).toBeInTheDocument();
  });

  it("switches active section via the sidebar nav", async () => {
    const user = userEvent.setup();
    renderModal();
    await goToSection(user, "Models");
    expect(
      screen.getByRole("heading", { name: /^Models$/ }),
    ).toBeInTheDocument();
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
    await screen.findByText(/^Settings$/);
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
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
    const user = userEvent.setup();
    renderModal({ maxTokens: 8192 });
    await goToSection(user, "Models");
    const slider = await screen.findByRole("slider");
    expect(slider.value).toBe("8192");
    expect(screen.getByText("8,192")).toBeInTheDocument();
  });

  it("calls onMaxTokensChange when the slider is moved", async () => {
    const user = userEvent.setup();
    const onMaxTokensChange = vi.fn();
    renderModal({ maxTokens: 1024, onMaxTokensChange });
    await goToSection(user, "Models");
    const slider = await screen.findByRole("slider");
    fireEvent.change(slider, { target: { value: "2048" } });
    expect(onMaxTokensChange).toHaveBeenCalledWith(2048);
  });

  it("toggles the showMetrics switch", async () => {
    const user = userEvent.setup();
    const onShowMetricsChange = vi.fn();
    renderModal({ showMetrics: false, onShowMetricsChange });
    await goToSection(user, "Behavior");
    await screen.findByText(/show response metrics/i);
    const metricsLabel = screen.getByText(/show response metrics/i);
    const outerRow = metricsLabel.parentElement.parentElement;
    const toggleBtn = outerRow.querySelector("button");
    fireEvent.click(toggleBtn);
    expect(onShowMetricsChange).toHaveBeenCalledWith(true);
  });

  it("renders a dark mode selector with three options", async () => {
    const user = userEvent.setup();
    renderModal();
    await goToSection(user, "Appearance");
    const group = screen.getByRole("radiogroup", { name: /color mode/i });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^light$/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^system$/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^dark$/i })).toBeInTheDocument();
  });

  it("marks the active dark mode option as checked", async () => {
    const user = userEvent.setup();
    mockThemeState = {
      theme: "dark",
      setTheme: mockSetTheme,
      resolvedTheme: "dark",
    };
    renderModal();
    await goToSection(user, "Appearance");
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: /^dark$/i })).toBeChecked();
    });
    expect(screen.getByRole("radio", { name: /^light$/i })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /^system$/i })).not.toBeChecked();
  });

  it("calls setTheme with the chosen dark mode value", async () => {
    const user = userEvent.setup();
    mockThemeState = {
      theme: "light",
      setTheme: mockSetTheme,
      resolvedTheme: "light",
    };
    renderModal();
    await goToSection(user, "Appearance");
    await user.click(screen.getByRole("radio", { name: /^dark$/i }));
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
    await user.click(screen.getByRole("radio", { name: /^system$/i }));
    expect(mockSetTheme).toHaveBeenCalledWith("system");
  });

  it("renders the color theme select with the current value", async () => {
    const user = userEvent.setup();
    const onThemeChange = vi.fn();
    renderModal({ theme: "sunrise", onThemeChange });
    await goToSection(user, "Appearance");
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent(/sunrise/i);
  });
});
