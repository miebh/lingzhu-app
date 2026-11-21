import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import { DropdownMenu as DropdownMenuPrimitive } from "@kobalte/core/dropdown-menu";
import { Check, ChevronRight } from "@lingzhu/ui/icons";
import { cn } from "@lingzhu/ui/utils";

interface RootProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  children?: JSX.Element;
}

function DropdownMenu(props: RootProps) {
  return <DropdownMenuPrimitive data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger(props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  as?: any;
  variant?: string;
  size?: string;
}) {
  const [local, rest] = splitProps(props, ["class", "children", "type", "as"]);
  return (
    <DropdownMenuPrimitive.Trigger
      as={local.as ?? "button"}
      type={local.type === "submit" || local.type === "reset" ? local.type : "button"}
      data-slot="dropdown-menu-trigger"
      class={local.class}
      {...rest}
    >
      {local.children}
    </DropdownMenuPrimitive.Trigger>
  );
}

interface ContentProps extends JSX.HTMLAttributes<HTMLDivElement> {
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  collisionPadding?: number;
}

function DropdownMenuContent(props: ContentProps) {
  const [local, rest] = splitProps(props, [
    "class",
    "children",
    "side",
    "align",
    "sideOffset",
    "collisionPadding",
  ]);
  const placement = () => {
    const side = local.side ?? "bottom";
    const align = local.align ?? "center";
    return (align === "center" ? side : `${side}-${align}`) as never;
  };
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        placement={placement()}
        gutter={local.sideOffset ?? 4}
        class={cn(
          "elevation-floating z-[60] max-h-[min(320px,var(--kb-dropdown-menu-content-available-height))] min-w-40 max-w-[calc(100vw-24px)] overflow-y-auto rounded-md bg-bg-layer-01 p-0.5 text-body text-text-base outline-none",
          local.class,
        )}
        {...rest}
      >
        {local.children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
}

interface ItemProps {
  class?: string;
  disabled?: boolean;
  destructive?: boolean;
  onSelect?: () => void;
  children?: JSX.Element;
}

function DropdownMenuItem(props: ItemProps) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      disabled={props.disabled}
      onSelect={props.onSelect}
      class={cn(
        "interactive flex h-7 cursor-default select-none items-center gap-2 rounded-xs px-3 pe-1.5 tabular-nums text-body leading-4 font-[440] tracking-[-0.04px] outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        props.destructive ? "text-state-fg-danger" : "text-text-base",
        props.class,
      )}
    >
      {props.children}
    </DropdownMenuPrimitive.Item>
  );
}

function DropdownMenuLabel(props: { class?: string; children?: JSX.Element }) {
  return (
    <div
      data-slot="dropdown-menu-label"
      class={cn(
        "flex h-7 items-center px-3 text-caption font-[530] tracking-[0.05px] text-text-faint tabular-nums",
        props.class,
      )}
    >
      {props.children}
    </div>
  );
}

interface RadioGroupProps {
  value?: string;
  onValueChange?: (value: string) => void;
  class?: string;
  children?: JSX.Element;
}

function DropdownMenuRadioGroup(props: RadioGroupProps) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      value={props.value}
      onChange={props.onValueChange}
      class={cn("flex flex-col", props.class)}
    >
      {props.children}
    </DropdownMenuPrimitive.RadioGroup>
  );
}

interface RadioItemProps {
  value: string;
  disabled?: boolean;
  class?: string;
  children?: JSX.Element;
}

function DropdownMenuRadioItem(props: RadioItemProps) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      value={props.value}
      disabled={props.disabled}
      class={cn(
        "interactive relative flex h-7 cursor-default select-none items-center gap-2 rounded-xs px-3 pe-1.5 tabular-nums text-body leading-4 font-[440] tracking-[-0.04px] outline-none data-[checked]:pe-7 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        props.class,
      )}
    >
      <span class="absolute end-2 grid size-4 place-items-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check class="size-4 text-icon-base" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {props.children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

function DropdownMenuSeparator(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      class={cn("-mx-0.5 my-0.5 h-px bg-border-muted", local.class)}
      {...rest}
    />
  );
}

function DropdownMenuSub(props: RootProps) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuSubTrigger(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      class={cn(
        "interactive flex h-7 cursor-default select-none items-center gap-2 rounded-xs px-3 pe-1.5 tabular-nums text-body leading-4 font-[440] tracking-[-0.04px] outline-none data-[expanded]:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))]",
        local.class,
      )}
      {...rest}
    >
      {local.children}
      <ChevronRight class="ms-auto size-4 shrink-0 text-text-faint" />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

function DropdownMenuSubContent(props: ContentProps) {
  const [local, rest] = splitProps(props, ["class", "children", "side", "align", "sideOffset", "collisionPadding"]);
  const placement = () => {
    const side = local.side ?? "right";
    const align = local.align ?? "center";
    return (align === "center" ? side : `${side}-${align}`) as never;
  };
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent
        data-slot="dropdown-menu-sub-content"
        placement={placement()}
        gutter={local.sideOffset ?? 4}
        class={cn(
          "elevation-floating z-[60] min-w-40 max-h-[min(320px,var(--kb-dropdown-menu-content-available-height))] overflow-y-auto rounded-md bg-bg-layer-01 p-0.5 text-body text-text-base outline-none",
          local.class,
        )}
        {...rest}
      >
        {local.children}
      </DropdownMenuPrimitive.SubContent>
    </DropdownMenuPrimitive.Portal>
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
