import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@lingzhu/ui/utils"

const textareaVariants = cva(
  "flex w-full resize-y rounded-md bg-bg-base text-body leading-4 font-[440] tracking-[-0.04px] text-text-base transition-colors shadow-[var(--elevation-input)] outline-none placeholder:text-text-faint hover:shadow-[inset_0_0_0_100vmax_var(--overlay-hover),var(--elevation-input)] focus-visible:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus disabled:cursor-not-allowed disabled:opacity-50 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50 aria-invalid:shadow-[inset_0_0_0_0.5px_var(--color-state-border-danger)] data-[invalid=true]:shadow-[inset_0_0_0_0.5px_var(--color-state-border-danger)]",
  {
    variants: {
      variant: {
        default: "field-sizing-content min-h-20 px-2 py-2",
        bare: "field-sizing-fixed border-0 bg-transparent p-0 shadow-none",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Textarea({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"textarea"> & VariantProps<typeof textareaVariants>) {
  return (
    <textarea
      data-slot="textarea"
      data-variant={variant}
      className={cn(textareaVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Textarea }
