import * as React from "react"
import { Check, ChevronRight } from "@lingzhu/ui/icons"
import { cn } from "@lingzhu/ui/utils"
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"

function DropdownMenu({
  modal = false,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  // Row menus are non-modal: the page keeps receiving pointer input, so the
  // hover-revealed strip that anchors them never collapses mid-open.
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" modal={modal} {...props} />
}

function DropdownMenuTrigger(props: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  collisionPadding = 12,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "elevation-floating z-[60] max-h-[min(320px,var(--radix-dropdown-menu-content-available-height))] min-w-40 max-w-[calc(100vw-24px)] overflow-y-auto rounded-md bg-bg-layer-01 p-0.5 text-body text-text-base outline-none",
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuItem({
  className,
  destructive = false,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & { destructive?: boolean }) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        "interactive flex h-7 cursor-default select-none items-center gap-2 rounded-xs px-3 pe-1.5 tabular-nums text-body leading-4 font-[440] tracking-[-0.04px] outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        destructive ? "text-state-fg-danger" : "text-text-base",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      className={cn("flex h-7 items-center px-3 text-caption font-[530] tracking-[0.05px] text-text-faint tabular-nums", className)}
      {...props}
    />
  )
}

function DropdownMenuRadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      className={cn("flex flex-col", className)}
      {...props}
    />
  )
}

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(
        "interactive relative flex h-7 cursor-default select-none items-center gap-2 rounded-xs px-3 pe-1.5 tabular-nums text-body leading-4 font-[440] tracking-[-0.04px] outline-none data-[state=checked]:pe-7 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <span className="absolute end-2 grid size-4 place-items-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="size-4 text-icon-base" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-0.5 my-0.5 h-px bg-border-muted", className)}
      {...props}
    />
  )
}

function DropdownMenuSub(props: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />
}

function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger>) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      className={cn(
        "interactive flex h-7 cursor-default select-none items-center gap-2 rounded-xs px-3 pe-1.5 tabular-nums text-body leading-4 font-[440] tracking-[-0.04px] outline-none data-[state=open]:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))]",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRight className="ms-auto size-4 shrink-0 text-text-faint" />
    </DropdownMenuPrimitive.SubTrigger>
  )
}

function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent
        data-slot="dropdown-menu-sub-content"
        sideOffset={4}
        className={cn(
          "elevation-floating z-[60] min-w-40 max-h-[min(320px,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto rounded-md bg-bg-layer-01 p-0.5 text-body text-text-base outline-none",
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
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
}
