import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@lingzhu/ui/utils"

const inputVariants = cva(
  "w-full min-w-0 rounded-md bg-bg-base text-body leading-4 font-[440] tracking-[-0.04px] text-text-base transition-colors shadow-[var(--elevation-input)] outline-none placeholder:text-text-faint hover:shadow-[inset_0_0_0_100vmax_var(--overlay-hover),var(--elevation-input)] focus-visible:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus disabled:cursor-not-allowed disabled:opacity-50 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50 aria-invalid:shadow-[inset_0_0_0_0.5px_var(--color-state-border-danger)] data-[invalid=true]:shadow-[inset_0_0_0_0.5px_var(--color-state-border-danger)]",
  {
    variants: {
      size: {
        default: "h-control-sm px-2",
        sm: "h-control-xs px-2",
        lg: "h-control-md px-2",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

function Input({
  className,
  type,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"input">, "size"> & VariantProps<typeof inputVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      data-size={size}
      className={cn(inputVariants({ size }), className)}
      {...props}
    />
  )
}

export { Input }
