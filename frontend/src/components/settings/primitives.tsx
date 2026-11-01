import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** One titled block inside a settings section. */
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-body font-medium text-text-base">{title}</h2>
        {description && <p className="max-w-measure-standard text-meta leading-5 text-text-faint">{description}</p>}
      </div>
      <div className="overflow-hidden rounded-lg bg-bg-layer-01 px-4 shadow-[inset_0_0_0_0.5px_var(--color-border-base)]">
        {children}
      </div>
    </section>
  );
}

/** Inline row: title and help on the left, the control on the right. */
export function SettingsRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b-[0.5px] border-border-base py-4 last:border-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body text-text-base">{title}</span>
        {description && <span className="text-meta leading-5 text-text-faint">{description}</span>}
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
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
    <label className="flex flex-col gap-1.5 border-b-[0.5px] border-border-base py-4 last:border-0">
      <span className="text-body text-text-base">{label}</span>
      {children}
      {hint && <span className="text-caption leading-4 text-text-faint">{hint}</span>}
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
          className="interactive flex h-control-sm max-w-full min-w-40 items-center gap-2 rounded-md border border-border-base bg-bg-base px-2 text-body text-text-base"
        >
          <span className="min-w-0 flex-1 truncate text-left">{current?.label ?? value}</span>
          <ChevronDown className="size-3 shrink-0 text-text-faint" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" className="min-w-[var(--radix-dropdown-menu-trigger-width)]">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            disabled={option.disabled}
            onSelect={() => onChange(option.value)}
          >
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {option.value === value && <Check className="size-3.5 shrink-0 text-text-accent" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
