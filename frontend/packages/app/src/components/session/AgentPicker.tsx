import { For, Show, createMemo } from "solid-js";
import { Tooltip as TooltipPrimitive } from "@kobalte/core/tooltip";
import { ChevronDown } from "@lingzhu/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@lingzhu/ui/dropdown-menu";
import { Tooltip, TooltipContent } from "@lingzhu/ui/tooltip";
import { Keybind } from "@lingzhu/ui/keybind";
import { formatKeybind } from "../../lib/slash";
import type { AgentProfile } from "@lingzhu/ui/types";
import { useT } from "@lingzhu/ui/i18n";

/** Compact agent selector beside the model chip, mirroring the reference composer. */
export function AgentPicker(props: {
  agents: AgentProfile[];
  value?: string;
  onChange: (agentID: string) => void;
}) {
  const tr = useT();
  const current = createMemo(
    () => props.agents.find((agent) => agent.id === props.value) ?? props.agents[0],
  );

  return (
    <Show when={props.agents.length > 0}>
      <DropdownMenu>
        <Tooltip>
          <TooltipPrimitive.Trigger as="span" class="inline-flex">
            <DropdownMenuTrigger
              type="button"
              aria-label={tr("agentPickerSelectAgent")}
              class="interactive flex h-7 max-w-[220px] min-w-0 shrink-0 items-center justify-start gap-1.5 rounded-md px-[11px] text-body font-[440] text-text-muted hover:text-text-base data-[state=open]:bg-[linear-gradient(var(--overlay-pressed),var(--overlay-pressed))] data-[state=open]:text-text-base"
            >
              <span class="min-w-0 truncate capitalize">{current()?.name || props.value || "Agent"}</span>
              <ChevronDown class="-ms-0.5 -me-1 size-4 shrink-0" />
            </DropdownMenuTrigger>
          </TooltipPrimitive.Trigger>
          <TooltipContent side="top">
            <span class="flex items-center gap-1.5">
              {tr("dialogChooseAgent")}
              <Keybind keys={(formatKeybind("mod+.") ?? "").split("+")} />
            </span>
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent side="top" align="start" class="min-w-0">
          <DropdownMenuRadioGroup value={current()?.id ?? ""} onValueChange={props.onChange}>
            <For each={props.agents}>
              {(agent) => (
                <DropdownMenuRadioItem value={agent.id} class="items-start gap-6">
                  <span class="flex min-w-0 flex-col gap-0.5">
                    <span class="min-w-0 truncate capitalize">{agent.name}</span>
                    <Show when={agent.description}>
                      <span class="line-clamp-2 text-meta leading-4 text-text-faint">{agent.description}</span>
                    </Show>
                  </span>
                </DropdownMenuRadioItem>
              )}
            </For>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </Show>
  );
}
