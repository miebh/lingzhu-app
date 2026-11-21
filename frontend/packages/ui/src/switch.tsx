import { splitProps } from "solid-js";
import { cn } from "@lingzhu/ui/utils";

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  class?: string;
  "aria-label"?: string;
  "aria-required"?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

/**
 * Semantic switch: the accent marks the on state, the muted thumb the off
 * state. Focus comes from the global 2px outline. A plain button keeps the
 * accessible `role="switch"` without Kobalte's hidden checkbox wrapper.
 */
function Switch(props: SwitchProps) {
  const [local, rest] = splitProps(props, ["class", "checked", "onCheckedChange", "disabled"]);
  const checked = () => Boolean(local.checked);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked()}
      data-slot="switch"
      data-state={checked() ? "checked" : "unchecked"}
      disabled={local.disabled}
      onClick={() => local.onCheckedChange?.(!checked())}
      class={cn(
        "group/switch peer inline-flex h-4 w-6 shrink-0 cursor-pointer items-center rounded-xs border-0 bg-[image:var(--switch-track-off)] p-0.5 shadow-[var(--elevation-switch-off)] transition-colors data-[state=checked]:bg-[image:var(--switch-track-on)] data-[state=checked]:shadow-[var(--elevation-switch-on)] disabled:cursor-not-allowed disabled:opacity-50",
        local.class,
      )}
      {...rest}
    >
      <span
        data-slot="switch-thumb"
        class="pointer-events-none block size-3 rounded-[2px] bg-[image:var(--switch-thumb-off)] shadow-[var(--elevation-elements)] transition-[transform,width] group-hover/switch:w-[13px] group-hover/switch:rounded-[3px] group-data-[state=checked]/switch:translate-x-2 group-data-[state=checked]/switch:bg-[image:var(--switch-thumb-on)] group-data-[state=checked]/switch:group-hover/switch:translate-x-[7px]"
      />
    </button>
  );
}

export { Switch };
