import { Show, createSignal } from "solid-js";
import { Tooltip as TooltipPrimitive } from "@kobalte/core/tooltip";
import { Plus } from "@lingzhu/ui/icons";
import { buttonVariants } from "@lingzhu/ui/button";
import { cn } from "@lingzhu/ui/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@lingzhu/ui/dropdown-menu";
import { Tooltip, TooltipContent } from "@lingzhu/ui/tooltip";
import { Keybind } from "@lingzhu/ui/keybind";
import { formatKeybind } from "../../lib/slash";
import { t } from "@lingzhu/ui/i18n";

interface Props {
  disabled?: boolean;
  onAttach: () => void;
  onCommands: () => void;
  onContext: () => void;
  onShell?: () => void;
}

const itemClass =
  "composer-add-item h-7 gap-2 rounded-sm px-3 pe-1.5 font-[440] leading-4 tracking-[-0.04px]";

/**
 * The composer's add menu, laid out like the desktop composer: a 180px panel
 * with 28px rows, a right-aligned shortcut column and no item icons.
 */
export function ComposerAddMenu(props: Props) {
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [tooltipOpen, setTooltipOpen] = createSignal(false);

  return (
    <DropdownMenu open={menuOpen()} onOpenChange={setMenuOpen}>
      <Tooltip open={tooltipOpen() && !menuOpen()} onOpenChange={setTooltipOpen}>
        {/* A wrapper keeps the tooltip's state off the menu trigger. */}
        <TooltipPrimitive.Trigger as="span" class="inline-flex">
          <DropdownMenuTrigger
            type="button"
            aria-label={t("addImagesFiles")}
            disabled={props.disabled}
            class={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "composer-add-trigger text-text-faint",
            )}
          >
            <Plus />
          </DropdownMenuTrigger>
        </TooltipPrimitive.Trigger>
        <TooltipContent side="top">
          {t("addImagesFiles")}{" "}
          <Keybind keys={formatKeybind("mod+u")?.split("+") ?? []} variant="neutral" />
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={6}
        class="no-scrollbar min-w-[180px] rounded-md border-0 bg-bg-layer-01 p-0.5 shadow-elevation-floating"
      >
        <DropdownMenuItem class={itemClass} onSelect={props.onAttach}>
          {t("imagesFiles")}
          <span class="composer-add-shortcut">{formatKeybind("mod+u")}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator class="my-0.5 h-px bg-border-muted" />
        <DropdownMenuItem class={itemClass} onSelect={props.onCommands}>
          {t("commands")}
          <span class="composer-add-shortcut">/</span>
        </DropdownMenuItem>
        <DropdownMenuItem class={itemClass} onSelect={props.onContext}>
          {t("context")}
          <span class="composer-add-shortcut">@</span>
        </DropdownMenuItem>
        <Show when={props.onShell}>
          <DropdownMenuItem class={itemClass} onSelect={() => props.onShell?.()}>
            {t("shellCommand")}
            <span class="composer-add-shortcut">!</span>
          </DropdownMenuItem>
        </Show>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
