import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DisplayedFiles from "../DisplayedFiles";

const downloadSandboxFile = vi.fn();
vi.mock("../sandbox-files-client", () => ({
  downloadSandboxFile: (...args) => downloadSandboxFile(...args),
}));

const file = {
  name: "report.csv",
  path: "out/report.csv",
  size: 2048,
  sandboxId: "sbx-1",
  conversationId: "c1",
};

beforeEach(() => {
  downloadSandboxFile.mockReset();
  downloadSandboxFile.mockResolvedValue(undefined);
});

describe("DisplayedFiles", () => {
  it("renders nothing without files", () => {
    const { container } = render(<DisplayedFiles files={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows one card per displayed file and nothing else", () => {
    render(<DisplayedFiles files={[file]} />);
    expect(
      screen.getByRole("button", { name: "Download report.csv" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByText("2 KB")).toBeInTheDocument();
  });

  it("downloads from the file's own conversation and sandbox", async () => {
    render(<DisplayedFiles files={[file]} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Download report.csv" }),
    );
    expect(downloadSandboxFile).toHaveBeenCalledWith("c1", file, "sbx-1");
  });

  it("shows the reason when a download cannot start", async () => {
    downloadSandboxFile.mockRejectedValue(new Error("sandbox expired"));
    render(<DisplayedFiles files={[file]} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Download report.csv" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "sandbox expired",
    );
  });
});
