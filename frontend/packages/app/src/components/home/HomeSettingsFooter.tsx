import { Settings2 } from "@lingzhu/ui/icons";
import { t } from "@lingzhu/ui/i18n";

interface Props {
  onOpenSettings: () => void;
}

/** The stacked-layout footer that carries the projects column's settings entry. */
export function HomeSettingsFooter({ onOpenSettings }: Props) {
  return (
    <div className="hidden shrink-0 items-center justify-between gap-1 border-t border-border-weak px-3 py-2 md:flex lg:hidden">
      <button
        type="button"
        onClick={onOpenSettings}
        className="interactive flex h-7 min-w-0 items-center gap-2 rounded-[6px] px-1.5 text-body font-[440] text-text-faint hover:text-text-base"
      >
        <Settings2 className="size-4 shrink-0" />
        <span className="truncate">{t("settings")}</span>
      </button>
    </div>
  );
}