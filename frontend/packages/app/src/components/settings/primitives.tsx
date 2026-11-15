import type { ReactNode } from "react";
import { Check, ChevronDown } from "@lingzhu/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@lingzhu/ui/dropdown-menu";

/** One titled block inside a settings section. */
export function SettingsSection({
  title,
  description,
  catalog,
  children,
}: {
  title: string;
  description?: string;
  /** Catalog lists inset their rows 16px instead of 20px, like the reference. */
  catalog?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4" data-setting-row={title} data-setting-keywords={description ?? ""}>
      <h2 className="text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">{title}</h2>
      <div
        className={`overflow-hidden rounded-lg bg-bg-layer-01 shadow-[inset_0_0_0_0.5px_var(--color-border-muted)] ${
          catalog ? "px-4" : "px-5"
        }`}
      >
        {children}
      </div>
    </section>
  );
}

/** Inline row: title and help on the left, the control on the right. */
export function SettingsRow({
  title,
  description,
  align,
  catalog,
  children,
}: {
  title: string;
  description?: string;
  align?: "start";
  /** Catalog rows are 56px tall with 16px padding and a 12px gap. */
  catalog?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex flex-wrap border-b-[0.5px] border-border-base last:border-0 sm:flex-nowrap ${
        catalog ? "min-h-14 gap-3 py-4" : "gap-4 py-5"
      } ${align === "start" ? "items-start" : "items-center"}`}
      data-setting-row={title}
      data-setting-keywords={description ?? ""}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">{title}</span>
        {description && <span className="-my-[3.5px] text-body font-[440] leading-5 text-text-muted">{description}</span>}
      </div>
      <div data-slot="settings-row-control" className={`flex w-full justify-end gap-2 sm:w-auto sm:shrink-0 ${catalog ? "min-w-[60px]" : ""}`}>
        {children}
      </div>
    </div>
  );
}

/** Stacked row for inputs that need the full width, such as prompts. */
export function SettingsField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label
      className="flex flex-col gap-2 border-b-[0.5px] border-border-base py-5 last:border-0"
      data-setting-row={label}
      data-setting-keywords={hint ?? ""}
    >
      <span className="text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">{label}</span>
      {children}
      {hint && <span className="text-body leading-5 text-text-muted">{hint}</span>}
    </label>
  );
}

/** Settings select: the same menu surface as every other dropdown. */
export function SettingsSelect({
  value,
  label,
  options,
  onChange,
}: {
  value: string;
  label: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void;
}) {
  const current = options.find((option) => option.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-haspopup="listbox"
          className="flex h-7 w-fit max-w-full items-center gap-2 rounded-md bg-bg-base ps-2 pe-1.5 text-body leading-4 font-[440] tracking-[-0.04px] text-text-base shadow-[var(--elevation-input)] transition-shadow hover:shadow-[inset_0_0_0_100vmax_var(--overlay-hover),var(--elevation-input)] data-[state=open]:shadow-[inset_0_0_0_100vmax_var(--overlay-hover),var(--elevation-input)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
        >
          <span className="min-w-0 flex-1 truncate text-left">{current?.label ?? value}</span>
          <ChevronDown className="size-4 shrink-0 text-text-faint" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="end"
        className="min-w-[var(--radix-dropdown-menu-trigger-width)] max-w-[23rem] p-0"
      >
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            disabled={option.disabled}
            onSelect={() => onChange(option.value)}
          >
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            <span className="grid size-4 shrink-0 place-items-center text-icon-base">
              {option.value === value && <Check className="size-4" />}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
