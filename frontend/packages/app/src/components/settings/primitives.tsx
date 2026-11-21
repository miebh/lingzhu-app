import { For, Show, type JSX } from "solid-js";
import { Check, ChevronDown } from "@lingzhu/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@lingzhu/ui/dropdown-menu";

/** One titled block inside a settings section. */
export function SettingsSection(props: {
  title: string;
  description?: string;
  /** Catalog lists inset their rows 16px instead of 20px, like the reference. */
  catalog?: boolean;
  children: JSX.Element;
}) {
  return (
    <section class="flex flex-col gap-4" data-setting-row={props.title} data-setting-keywords={props.description ?? ""}>
      <h2 class="text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">{props.title}</h2>
      <div
        class={`overflow-hidden rounded-lg bg-bg-layer-01 shadow-[inset_0_0_0_0.5px_var(--color-border-muted)] ${
          props.catalog ? "px-4" : "px-5"
        }`}
      >
        {props.children}
      </div>
    </section>
  );
}

/** Inline row: title and help on the left, the control on the right. */
export function SettingsRow(props: {
  title: string;
  description?: string;
  align?: "start";
  /** Catalog rows are 56px tall with 16px padding and a 12px gap. */
  catalog?: boolean;
  children: JSX.Element;
}) {
  return (
    <div
      class={`flex flex-wrap border-b-[0.5px] border-border-base last:border-0 sm:flex-nowrap ${
        props.catalog ? "min-h-14 gap-3 py-4" : "gap-4 py-5"
      } ${props.align === "start" ? "items-start" : "items-center"}`}
      data-setting-row={props.title}
      data-setting-keywords={props.description ?? ""}
    >
      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <span class="text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">{props.title}</span>
        <Show when={props.description}>
          <span class="-my-[3.5px] text-body font-[440] leading-5 text-text-muted">{props.description}</span>
        </Show>
      </div>
      <div
        data-slot="settings-row-control"
        class={`flex w-full justify-end gap-2 sm:w-auto sm:shrink-0 ${props.catalog ? "min-w-[60px]" : ""}`}
      >
        {props.children}
      </div>
    </div>
  );
}

/** Stacked row for inputs that need the full width, such as prompts. */
export function SettingsField(props: { label: string; hint?: string; children: JSX.Element }) {
  return (
    <label
      class="flex flex-col gap-2 border-b-[0.5px] border-border-base py-5 last:border-0"
      data-setting-row={props.label}
      data-setting-keywords={props.hint ?? ""}
    >
      <span class="text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">{props.label}</span>
      {props.children}
      <Show when={props.hint}>
        <span class="text-body leading-5 text-text-muted">{props.hint}</span>
      </Show>
    </label>
  );
}

/** Settings select: the same menu surface as every other dropdown. */
export function SettingsSelect(props: {
  value: string;
  label: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void;
}) {
  const current = () => props.options.find((option) => option.value === props.value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        aria-label={props.label}
        aria-haspopup="listbox"
        class="flex h-7 w-fit max-w-full items-center gap-2 rounded-md bg-bg-base ps-2 pe-1.5 text-body leading-4 font-[440] tracking-[-0.04px] text-text-base shadow-[var(--elevation-input)] transition-shadow hover:shadow-[inset_0_0_0_100vmax_var(--overlay-hover),var(--elevation-input)] data-[state=open]:shadow-[inset_0_0_0_100vmax_var(--overlay-hover),var(--elevation-input)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
      >
        <span class="min-w-0 flex-1 truncate text-left">{current()?.label ?? props.value}</span>
        <ChevronDown class="size-4 shrink-0 text-text-faint" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="end"
        class="min-w-[var(--kb-popper-anchor-width)] max-w-[23rem] p-0"
      >
        <For each={props.options}>
          {(option) => (
            <DropdownMenuItem disabled={option.disabled} onSelect={() => props.onChange(option.value)}>
              <span class="min-w-0 flex-1 truncate">{option.label}</span>
              <span class="grid size-4 shrink-0 place-items-center text-icon-base">
                <Show when={option.value === props.value}>
                  <Check class="size-4" />
                </Show>
              </span>
            </DropdownMenuItem>
          )}
        </For>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
