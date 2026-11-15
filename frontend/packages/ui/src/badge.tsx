import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@lingzhu/ui/utils"
import { Slot } from "radix-ui"

const badgeVariants = cva(
  "group/badge inline-flex h-4 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-[2px] border-[0.5px] border-border-base bg-bg-layer-02 px-1 text-caption leading-none font-[530] tracking-[0.05px] tabular-nums text-text-muted whitespace-nowrap transition-colors aria-invalid:border-state-border-danger data-[invalid=true]:border-state-border-danger [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "border-border-base bg-bg-layer-02 text-text-muted",
        secondary: "border-transparent bg-bg-layer-03 text-text-muted",
        destructive:
          "border-state-border-danger bg-state-bg-danger text-state-fg-danger",
        outline: "border-border-strong bg-transparent text-text-base",
        ghost: "border-transparent bg-transparent text-text-muted",
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
