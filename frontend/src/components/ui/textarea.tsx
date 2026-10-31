import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const textareaVariants = cva(
  "flex w-full rounded-md text-body text-text-base transition-colors placeholder:text-text-faint disabled:cursor-not-allowed disabled:opacity-50 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50 aria-invalid:border-state-border-danger data-[invalid=true]:border-state-border-danger",
  {
    variants: {
      variant: {
        default:
          "field-sizing-content min-h-16 border border-border-base bg-bg-layer-01 px-3 py-2",
        bare: "field-sizing-fixed border-0 bg-transparent p-0",
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
