import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import CustomLink from "../CustomLink";

describe("CustomLink", () => {
  it("renders an internal link normally", () => {
    render(<CustomLink href="/about">About</CustomLink>);
    const link = screen.getByRole("link", { name: /about/i });
    expect(link.getAttribute("href")).toBe("/about");
    expect(link.getAttribute("target")).toBeNull();
  });

  it("renders an external link with target='_blank'", () => {
    render(<CustomLink href="https://example.com">Example</CustomLink>);
    const link = screen.getByRole("link", { name: /example/i });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("does not open the warning dialog for internal links on click", async () => {
    const user = userEvent.setup();
    render(<CustomLink href="/about">About</CustomLink>);
    await user.click(screen.getByRole("link"));
    expect(
      screen.queryByText(/external link warning/i),
    ).not.toBeInTheDocument();
  });

  it("opens a warning dialog for external links on click", async () => {
    const user = userEvent.setup();
    render(<CustomLink href="https://external.example.com">Go</CustomLink>);
    await user.click(screen.getByRole("link"));
    expect(screen.getByText(/external link warning/i)).toBeInTheDocument();
    expect(
      screen.getByText("https://external.example.com"),
    ).toBeInTheDocument();
  });

  it("Cancel button closes the dialog", async () => {
    const user = userEvent.setup();
    render(<CustomLink href="https://external.example.com">Go</CustomLink>);
    await user.click(screen.getByRole("link"));
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(
      screen.queryByText(/external link warning/i),
    ).not.toBeInTheDocument();
  });

  it("Continue button calls window.open", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const user = userEvent.setup();
    render(<CustomLink href="https://external.example.com">Go</CustomLink>);
    await user.click(screen.getByRole("link"));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(openSpy).toHaveBeenCalledWith(
      "https://external.example.com",
      "_blank",
      "noopener,noreferrer",
    );
    openSpy.mockRestore();
  });
});
