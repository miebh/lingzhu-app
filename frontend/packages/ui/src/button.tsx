import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@lingzhu/ui/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center border bg-clip-padding text-body font-[530] tracking-[-0.04px] tabular-nums whitespace-nowrap select-none focus-visible:outline-offset-[2.5px] disabled:cursor-not-allowed disabled:opacity-50 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50 aria-invalid:border-state-border-danger data-[invalid=true]:border-state-border-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "contrast border-transparent",
        outline: "interactive border-transparent text-text-base shadow-[inset_0_0_0_1px_var(--border-muted)]",
        secondary: "interactive border-transparent bg-bg-layer-02 text-text-base",
        neutral:
          "interactive border-transparent bg-bg-button-neutral text-text-base shadow-[var(--elevation-button-neutral)]",
        ghost: "interactive border-transparent text-text-base",
        destructive:
          "interactive border-transparent bg-bg-button-neutral text-state-fg-danger",
        link: "border-transparent text-text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-control-sm gap-inline-sm rounded-md px-[11px]",
        xs: "h-control-xs gap-1.5 rounded-xs px-[9px] text-caption [&_svg:not([class*='size-'])]:size-3",
        sm: "h-control-xs gap-inline-sm rounded-xs px-[9px] text-body [&_svg:not([class*='size-'])]:size-3",
        lg: "h-control-md gap-1.5 rounded-md px-[15px] text-body",
        icon: "size-control-md rounded-md",
        "icon-xs":
          "size-control-xs rounded-xs [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-control-sm rounded-md",
        "icon-lg": "size-control-md rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
