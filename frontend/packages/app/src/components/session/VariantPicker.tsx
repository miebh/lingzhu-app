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
import { useT } from "@lingzhu/ui/i18n";

/**
 * Compact reasoning-level selector beside the model chip. Models without
 * variants render nothing, so providers that only expose a base model keep the
 * composer unchanged.
 */
export function VariantPicker(props: {
  variants: string[];
  value?: string;
  onChange: (variant?: string) => void;
}) {
  const tr = useT();
  const current = createMemo(() =>
    props.value && props.variants.includes(props.value) ? props.value : undefined,
  );

  return (
    <Show when={props.variants.length > 0}>
      <DropdownMenu>
        <Tooltip>
          <TooltipPrimitive.Trigger as="span" class="inline-flex">
            <DropdownMenuTrigger
              type="button"
              aria-label={tr("modelPickerReasoningLevel")}
              data-default={current() === undefined}
              class="interactive flex h-7 max-w-[160px] min-w-0 shrink-0 items-center justify-start gap-1.5 rounded-md px-[11px] text-body font-[440] text-text-muted capitalize hover:text-text-base data-[state=open]:bg-[linear-gradient(var(--overlay-pressed),var(--overlay-pressed))] data-[state=open]:text-text-base data-[default=true]:opacity-60 data-[default=true]:hover:opacity-100 data-[default=true]:focus-visible:opacity-100 data-[state=open]:opacity-100"
            >
              <span class="min-w-0 truncate">{current() ?? "Default"}</span>
              <ChevronDown class="-ms-0.5 -me-1 size-4 shrink-0" />
            </DropdownMenuTrigger>
          </TooltipPrimitive.Trigger>
          <TooltipContent side="top">Reasoning level</TooltipContent>
        </Tooltip>
        <DropdownMenuContent side="top" align="start" class="min-w-0">
          <DropdownMenuRadioGroup
            value={current() ?? "default"}
            onValueChange={(next) => props.onChange(next === "default" ? undefined : next)}
          >
            <DropdownMenuRadioItem value="default" class="gap-6">
              Default
            </DropdownMenuRadioItem>
            <For each={props.variants}>
              {(variant) => (
                <DropdownMenuRadioItem value={variant} class="gap-6 capitalize">
                  {variant}
                </DropdownMenuRadioItem>
              )}
            </For>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </Show>
  );
}
