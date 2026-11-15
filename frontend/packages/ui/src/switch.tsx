import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"
import { cn } from "@lingzhu/ui/utils"

/**
 * Semantic switch: the accent marks the on state, the muted thumb the off
 * state. Focus comes from the global 2px outline.
 */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "group/switch peer inline-flex h-4 w-6 shrink-0 cursor-pointer items-center rounded-xs border-0 bg-[image:var(--switch-track-off)] p-0.5 shadow-[var(--elevation-switch-off)] transition-colors data-[state=checked]:bg-[image:var(--switch-track-on)] data-[state=checked]:shadow-[var(--elevation-switch-on)] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-3 rounded-[2px] bg-[image:var(--switch-thumb-off)] shadow-[var(--elevation-elements)] transition-[transform,width] group-hover/switch:w-[13px] group-hover/switch:rounded-[3px] group-data-[state=checked]/switch:translate-x-2 group-data-[state=checked]/switch:bg-[image:var(--switch-thumb-on)] group-data-[state=checked]/switch:group-hover/switch:translate-x-[7px]"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
