import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ArtifactGallery from "../ArtifactGallery";

// Detail view, not the grid: the grid renders thumbnails, which need a
// ResizeObserver that jsdom does not provide.
function renderDetail(props = {}) {
  return render(
    <ArtifactGallery
      artifacts={[]}
      open
      selectedArtifact={{ title: "Seeded artifact", html: "<p>x</p>" }}
      onSelectedArtifactChange={vi.fn()}
      onOpenArtifact={vi.fn()}
      onRenameArtifact={vi.fn()}
      onDeleteArtifact={vi.fn()}
      sidebarOpen
      onToggleSidebar={vi.fn()}
      {...props}
    />,
  );
}

describe("ArtifactGallery header", () => {
  it("hosts the sidebar toggle while the gallery is open", async () => {
    const onToggleSidebar = vi.fn();
    renderDetail({ onToggleSidebar });

    await userEvent.click(
      screen.getByRole("button", { name: "Collapse sidebar" }),
    );
    expect(onToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it("returns to the grid from the detail view", async () => {
    const onSelectedArtifactChange = vi.fn();
    renderDetail({ onSelectedArtifactChange });

    await userEvent.click(
      screen.getByRole("button", { name: "Back to artifact gallery" }),
    );
    expect(onSelectedArtifactChange).toHaveBeenCalledWith(null);
  });
});
