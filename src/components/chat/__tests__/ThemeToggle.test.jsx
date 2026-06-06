import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSetTheme = vi.fn();
let mockThemeState = { theme: "light", setTheme: mockSetTheme };

vi.mock("next-themes", () => ({
  useTheme: () => mockThemeState,
  ThemeProvider: ({ children }) => children,
}));

import ThemeToggle from "../ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    mockSetTheme.mockClear();
    mockThemeState = { theme: "light", setTheme: mockSetTheme };
  });

  it("renders a placeholder before mounting (no hydration mismatch)", () => {
    mockThemeState = { theme: "light", setTheme: mockSetTheme };
    const { container } = render(<ThemeToggle />);
    const button = container.querySelector("button");
    expect(button).toBeInTheDocument();
  });

  it("cycles light -> dark", async () => {
    const user = userEvent.setup();
    mockThemeState = { theme: "light", setTheme: mockSetTheme };
    render(<ThemeToggle />);
    await waitFor(() => screen.getByRole("button"));
    await user.click(screen.getByRole("button"));
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  it("cycles dark -> system", async () => {
    const user = userEvent.setup();
    mockThemeState = { theme: "dark", setTheme: mockSetTheme };
    render(<ThemeToggle />);
    await waitFor(() => screen.getByRole("button"));
    await user.click(screen.getByRole("button"));
    expect(mockSetTheme).toHaveBeenCalledWith("system");
  });

  it("cycles system -> light", async () => {
    const user = userEvent.setup();
    mockThemeState = { theme: "system", setTheme: mockSetTheme };
    render(<ThemeToggle />);
    await waitFor(() => screen.getByRole("button"));
    await user.click(screen.getByRole("button"));
    expect(mockSetTheme).toHaveBeenCalledWith("light");
  });
});
