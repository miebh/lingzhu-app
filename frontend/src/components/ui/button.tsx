import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center border bg-clip-padding text-body font-medium whitespace-nowrap select-none disabled:cursor-not-allowed disabled:opacity-50 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50 aria-invalid:border-state-border-danger data-[invalid=true]:border-state-border-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "interactive-inverse border-transparent bg-bg-inverse text-text-inverse",
        outline: "interactive border-border-base text-text-base",
        secondary: "interactive border-transparent bg-bg-layer-02 text-text-base",
        ghost: "interactive border-transparent text-text-base",
        destructive:
          "interactive border-state-border-danger bg-state-bg-danger text-state-fg-danger",
        link: "border-transparent text-text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-control-md gap-2 rounded-md px-3",
        xs: "h-control-xs gap-1 rounded-xs px-2 text-caption [&_svg:not([class*='size-'])]:size-3",
        sm: "h-control-sm gap-inline-sm rounded-md px-3 text-body [&_svg:not([class*='size-'])]:size-3",
        lg: "h-12 gap-2 rounded-lg px-4 text-reading",
        icon: "size-control-md rounded-md",
        "icon-xs":
          "size-control-xs rounded-xs [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-control-sm rounded-md",
        "icon-lg": "size-12 rounded-lg",
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
