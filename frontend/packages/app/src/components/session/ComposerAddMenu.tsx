import { useState } from "react";
import { Plus } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@lingzhu/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@lingzhu/ui/tooltip";
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

const itemClass = "composer-add-item h-7 gap-2 rounded-sm px-3 pe-1.5 font-[440] leading-4 tracking-[-0.04px]";

/**
 * The composer's add menu, laid out like the desktop composer: a 180px panel
 * with 28px rows, a right-aligned shortcut column and no item icons.
 */
export function ComposerAddMenu({
  disabled,
  onAttach,
  onCommands,
  onContext,
  onShell,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <Tooltip open={tooltipOpen && !menuOpen} onOpenChange={setTooltipOpen}>
        <TooltipTrigger asChild>
          {/* A wrapper keeps the tooltip's state off the menu trigger. */}
          <span className="inline-flex">
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("addImagesFiles")}
                disabled={disabled}
                className="composer-add-trigger text-text-faint"
              >
                <Plus />
              </Button>
            </DropdownMenuTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          {t("addImagesFiles")} <Keybind keys={formatKeybind("mod+u")?.split("+") ?? []} variant="neutral" />
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={6}
        className="no-scrollbar min-w-[180px] rounded-md border-0 bg-bg-layer-01 p-0.5 shadow-elevation-floating"
      >
        <DropdownMenuItem className={itemClass} onSelect={onAttach}>
          {t("imagesFiles")}
          <span className="composer-add-shortcut">{formatKeybind("mod+u")}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-0.5 h-px bg-border-muted" />
        <DropdownMenuItem className={itemClass} onSelect={onCommands}>
          {t("commands")}
          <span className="composer-add-shortcut">/</span>
        </DropdownMenuItem>
        <DropdownMenuItem className={itemClass} onSelect={onContext}>
          {t("context")}
          <span className="composer-add-shortcut">@</span>
        </DropdownMenuItem>
        {onShell && (
          <DropdownMenuItem className={itemClass} onSelect={onShell}>
            {t("shellCommand")}
            <span className="composer-add-shortcut">!</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
