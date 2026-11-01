import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"
import { cn } from "cn"

/**
 * Semantic switch: the accent marks the on state, the muted thumb the off
 * state. Focus comes from the global 2px outline.
 */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "group/switch peer inline-flex h-control-xs w-9 shrink-0 cursor-pointer items-center rounded-full border border-border-base bg-bg-layer-03 p-0.5 transition-colors data-[state=checked]:border-transparent data-[state=checked]:bg-text-accent disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4 rounded-full bg-text-muted transition-transform group-data-[state=checked]/switch:translate-x-4 group-data-[state=checked]/switch:bg-bg-base"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
