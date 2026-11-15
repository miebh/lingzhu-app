import { ChevronDown } from "@lingzhu/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@lingzhu/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@lingzhu/ui/tooltip";
import { useT } from "@lingzhu/ui/i18n";

/**
 * Compact reasoning-level selector beside the model chip. Models without
 * variants render nothing, so providers that only expose a base model keep the
 * composer unchanged.
 */
export function VariantPicker({
  variants,
  value,
  onChange,
}: {
  variants: string[];
  value?: string;
  onChange: (variant?: string) => void;
}) {
  const tr = useT();
  if (variants.length === 0) return null;
  const current = value && variants.includes(value) ? value : undefined;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={tr("modelPickerReasoningLevel")}
                className="interactive flex h-7 max-w-[160px] min-w-0 shrink-0 items-center justify-start gap-1.5 rounded-md px-[11px] text-body font-[440] text-text-muted capitalize hover:text-text-base data-[state=open]:bg-[linear-gradient(var(--overlay-pressed),var(--overlay-pressed))] data-[state=open]:text-text-base data-[default=true]:opacity-60 data-[default=true]:hover:opacity-100 data-[default=true]:focus-visible:opacity-100 data-[state=open]:opacity-100"
                data-default={current === undefined}
              >
                <span className="min-w-0 truncate">{current ?? "Default"}</span>
                <ChevronDown className="-ms-0.5 -me-1 size-4 shrink-0" />
              </button>
            </DropdownMenuTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">Reasoning level</TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="top" align="start" className="min-w-0">
        <DropdownMenuRadioGroup
          value={current ?? "default"}
          onValueChange={(next) => onChange(next === "default" ? undefined : next)}
        >
          <DropdownMenuRadioItem value="default" className="gap-6">
            Default
          </DropdownMenuRadioItem>
          {variants.map((variant) => (
            <DropdownMenuRadioItem key={variant} value={variant} className="gap-6 capitalize">
              {variant}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
