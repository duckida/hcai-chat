import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  Button,
  Dialog,
  Input,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuTrigger,
  Select,
  SelectItem,
  SelectPopover,
  SelectTrigger,
  SelectValue,
  SubMenu,
  Tooltip,
  TooltipTrigger,
} from "@/components/primitives";

const mainMenu = () => screen.getAllByRole("menu")[0];

function DialogHarness({ title = "Settings", description, label, onOpenChange }) {
  const [open, setOpen] = useState(false);
  const handleOpenChange = (next) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  return (
    <>
      <Button onPress={() => handleOpenChange(true)}>Open settings</Button>
      <Dialog
        open={open}
        onOpenChange={handleOpenChange}
        title={title}
        description={description}
        label={label}
      >
        <p>Body text</p>
      </Dialog>
    </>
  );
}

function MenuHarness({ onItemAction }) {
  return (
    <MenuTrigger>
      <Button>Options</Button>
      <MenuContent>
        <MenuItem id="new" onAction={() => onItemAction("new")}>
          New chat
        </MenuItem>
        <MenuGroup label="Providers">
          <MenuItem id="openai" onAction={() => onItemAction("openai")}>
            OpenAI
          </MenuItem>
        </MenuGroup>
        <SubMenu label="More">
          <MenuItem id="deep" onAction={() => onItemAction("deep")}>
            Deep
          </MenuItem>
        </SubMenu>
      </MenuContent>
    </MenuTrigger>
  );
}

function SelectHarness({ onSelectionChange }) {
  return (
    <Select
      aria-label="Theme"
      defaultSelectedKey="dark"
      onSelectionChange={onSelectionChange}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectPopover>
        <SelectItem id="light">Light</SelectItem>
        <SelectItem id="dark">Dark</SelectItem>
        <SelectItem id="system">System</SelectItem>
      </SelectPopover>
    </Select>
  );
}

describe("Button", () => {
  it("renders and fires onPress", async () => {
    const onPress = vi.fn();
    render(<Button onPress={onPress}>Send</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not fire when disabled", async () => {
    const onPress = vi.fn();
    render(
      <Button isDisabled onPress={onPress}>
        Send
      </Button>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("defaults to type=button so it never submits a form", () => {
    render(<Button>Send</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("keeps variant and size styling hooks", () => {
    render(
      <Button variant="outline" size="sm">
        Options
      </Button>,
    );
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("data-variant", "outline");
    expect(button).toHaveAttribute("data-size", "sm");
  });
});

describe("Dialog", () => {
  it("stays out of the DOM while closed", () => {
    render(<DialogHarness />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens with an accessible name from the title", async () => {
    render(<DialogHarness />);
    await userEvent.click(screen.getByRole("button", { name: "Open settings" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Settings");
    expect(within(dialog).getByText("Body text")).toBeInTheDocument();
  });

  it("closes on Escape and reports the change", async () => {
    const onOpenChange = vi.fn();
    render(<DialogHarness onOpenChange={onOpenChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Open settings" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes from the built-in close button", async () => {
    render(<DialogHarness />);
    await userEvent.click(screen.getByRole("button", { name: "Open settings" }));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("uses aria-label when no title is given", async () => {
    render(<DialogHarness title={null} label="Confirm link" />);
    await userEvent.click(screen.getByRole("button", { name: "Open settings" }));
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Confirm link");
  });

  it("renders description as accessible description", async () => {
    render(<DialogHarness description="Change how the app looks" />);
    await userEvent.click(screen.getByRole("button", { name: "Open settings" }));
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(
      "Change how the app looks",
    );
  });
});

describe("Menu", () => {
  it("opens with a menu of items", async () => {
    render(<MenuHarness onItemAction={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Options" }));
    const menu = mainMenu();
    expect(
      within(menu).getByRole("menuitem", { name: "New chat" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Options", hidden: true }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("restores the trigger to the accessibility tree after closing", async () => {
    render(<MenuHarness onItemAction={() => {}} />);
    const trigger = screen.getByRole("button", { name: "Options" });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(
      screen.getByRole("button", { name: "Options" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("reports the selected item's action", async () => {
    const onItemAction = vi.fn();
    render(<MenuHarness onItemAction={onItemAction} />);
    await userEvent.click(screen.getByRole("button", { name: "Options" }));
    await userEvent.click(
      within(mainMenu()).getByRole("menuitem", { name: "OpenAI" }),
    );
    expect(onItemAction).toHaveBeenCalledWith("openai");
  });

  it("renders group labels as a group", async () => {
    render(<MenuHarness onItemAction={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Options" }));
    expect(screen.getByText("Providers")).toBeInTheDocument();
    expect(within(mainMenu()).getAllByRole("group").length).toBeGreaterThan(0);
  });

  it("opens a submenu", async () => {
    const onItemAction = vi.fn();
    render(<MenuHarness onItemAction={onItemAction} />);
    await userEvent.click(screen.getByRole("button", { name: "Options" }));
    await userEvent.click(
      within(mainMenu()).getByRole("menuitem", { name: /More/ }),
    );
    const deep = await screen.findByRole("menuitem", { name: "Deep" });
    await userEvent.click(deep);
    expect(onItemAction).toHaveBeenCalledWith("deep");
  });

  it("highlights items with the accent colour on hover", async () => {
    render(<MenuHarness onItemAction={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Options" }));
    const item = within(mainMenu()).getByRole("menuitem", {
      name: "New chat",
    });
    await userEvent.hover(item);
    expect(item).toHaveAttribute("data-hovered", "true");
  });
});

describe("Select", () => {
  it("shows the default selection before opening", () => {
    render(<SelectHarness onSelectionChange={() => {}} />);
    expect(screen.getByRole("button")).toHaveTextContent("Dark");
  });

  it("lists options when opened", async () => {
    render(<SelectHarness onSelectionChange={() => {}} />);
    await userEvent.click(screen.getByRole("button"));
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getAllByRole("option")).toHaveLength(3);
  });

  it("emits onSelectionChange and updates the trigger", async () => {
    const onSelectionChange = vi.fn();
    render(<SelectHarness onSelectionChange={onSelectionChange} />);
    await userEvent.click(screen.getByRole("button"));
    await userEvent.click(screen.getByRole("option", { name: "Light" }));
    expect(onSelectionChange).toHaveBeenCalled();
    expect(screen.getByRole("button")).toHaveTextContent("Light");
  });

  it("marks the selected option", async () => {
    render(<SelectHarness onSelectionChange={() => {}} />);
    await userEvent.click(screen.getByRole("button"));
    const selected = screen.getByRole("option", { name: "Dark" });
    expect(selected).toHaveAttribute("aria-selected", "true");
  });
});

describe("Tooltip", () => {
  it("opens on hover and labels the trigger", async () => {
    render(
      <TooltipTrigger>
        <Button>i</Button>
        <Tooltip>
          <span>Token count</span>
        </Tooltip>
      </TooltipTrigger>,
    );
    const trigger = screen.getByRole("button");
    await userEvent.hover(trigger);
    await waitFor(() => expect(screen.getByRole("tooltip")).toBeInTheDocument(), {
      timeout: 4000,
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Token count");
    await userEvent.unhover(trigger);
  });
});

describe("Input", () => {
  it("renders with a name and accepts typing", async () => {
    render(<Input aria-label="API key" />);
    const input = screen.getByLabelText("API key");
    await userEvent.type(input, "sk-123");
    expect(input).toHaveValue("sk-123");
  });

  it("applies the same focus ring vocabulary as the rest of the app", () => {
    render(<Input aria-label="API key" />);
    expect(screen.getByLabelText("API key").className).toContain(
      "focus-visible:ring-3",
    );
  });
});
