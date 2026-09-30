"use client";

import { ChevronRightIcon } from "lucide-react";
import {
  Header,
  MenuItem as MenuItemPrimitive,
  Menu as MenuPrimitive,
  MenuSection as MenuSectionPrimitive,
  MenuTrigger as MenuTriggerPrimitive,
  Popover,
  Separator,
  SubmenuTrigger as SubmenuTriggerPrimitive,
} from "react-aria-components";

import { cn } from "@/lib/utils";

const menuContentClasses =
  "z-50 w-(--trigger-width) min-w-48 overflow-x-hidden overflow-y-auto rounded-3xl bg-popover p-1.5 text-popover-foreground shadow-lg ring-1 ring-foreground/5 animate-hcai-fade-in-fast outline-none dark:ring-foreground/10";

const menuItemClasses =
  "group/menu-item relative flex cursor-default items-center gap-2.5 rounded-2xl px-3 py-2 text-sm font-medium outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-hovered:bg-accent data-hovered:text-accent-foreground data-focused:bg-accent data-focused:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-9.5 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive";

function MenuTrigger({ ...props }) {
  return <MenuTriggerPrimitive data-slot="menu-trigger" {...props} />;
}

function MenuContent({
  className,
  children,
  align = "start",
  offset = 4,
  onAction,
  disabledKeys,
  ariaLabel,
  ...props
}) {
  return (
    <Popover
      data-slot="menu-content"
      className={cn(menuContentClasses, className)}
      align={align}
      offset={offset}
      {...props}
    >
      <MenuPrimitive
        data-slot="menu"
        className="outline-none"
        onAction={onAction}
        disabledKeys={disabledKeys}
        aria-label={ariaLabel}
      >
        {children}
      </MenuPrimitive>
    </Popover>
  );
}

function MenuItem({ className, inset, variant = "default", ...props }) {
  return (
    <MenuItemPrimitive
      data-slot="menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(menuItemClasses, className)}
      {...props}
    />
  );
}

function MenuGroup({ label, className, children, ...props }) {
  return (
    <MenuSectionPrimitive
      data-slot="menu-group"
      className={cn("outline-none", className)}
      {...props}
    >
      {label ? (
        <Header
          data-slot="menu-group-label"
          className="px-3 py-2.5 text-xs text-muted-foreground"
        >
          {label}
        </Header>
      ) : null}
      {children}
    </MenuSectionPrimitive>
  );
}

function MenuSeparator({ className, ...props }) {
  return (
    <Separator
      data-slot="menu-separator"
      className={cn("-mx-1.5 my-1.5 h-px bg-border/50", className)}
      {...props}
    />
  );
}

function SubMenu({ label, children, className, ...props }) {
  return (
    <SubmenuTriggerPrimitive data-slot="submenu-trigger" {...props}>
      <MenuItem className={className}>
        {label}
        <ChevronRightIcon className="ml-auto" />
      </MenuItem>
      <MenuPrimitive data-slot="submenu" className="outline-none">
        {children}
      </MenuPrimitive>
    </SubmenuTriggerPrimitive>
  );
}

export {
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  SubMenu,
};
