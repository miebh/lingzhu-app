import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const badgeVariants = cva(
  "group/badge inline-flex h-control-xs w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border text-caption font-medium whitespace-nowrap transition-colors aria-invalid:border-state-border-danger data-[invalid=true]:border-state-border-danger [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "border-transparent bg-bg-inverse text-text-inverse",
        secondary: "border-transparent bg-bg-layer-02 text-text-muted",
        destructive:
          "border-state-border-danger bg-state-bg-danger text-state-fg-danger",
        outline: "border-border-base text-text-base",
        ghost: "border-transparent text-text-muted",
        link: "border-transparent text-text-accent underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
