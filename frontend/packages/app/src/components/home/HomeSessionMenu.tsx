import { useEffect } from "react";
import { t } from "@lingzhu/ui/i18n";
import type { HomeSessionRow as HomeSessionRowData } from "@lingzhu/ui/types";

interface Props {
  row: HomeSessionRowData;
  x: number;
  y: number;
  onRename?: (row: HomeSessionRowData) => void;
  onExport?: (row: HomeSessionRowData) => void;
  onDelete?: (row: HomeSessionRowData) => void;
  onClose: () => void;
}

/** The session context menu, opened from a home row at the pointer position. */
export function HomeSessionMenu({ row, x, y, onRename, onExport, onDelete, onClose }: Props) {
  // A pointer press anywhere else, or the window losing focus, dismisses it.
  useEffect(() => {
    window.addEventListener("pointerdown", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("pointerdown", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  return (
    <div
      role="menu"
      aria-label={t("sessionActions")}
      style={{ left: x, top: y }}
      onPointerDown={(event) => event.stopPropagation()}
      className="fixed z-50 flex w-40 flex-col gap-0.5 rounded-md bg-bg-layer-01 p-0.5 elevation-floating"
    >
      {onRename && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onRename(row);
          }}
          className="interactive flex h-7 items-center rounded-xs px-3 text-left text-body font-[440] text-text-base hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))]"
        >
          {t("renamePlain")}
        </button>
      )}
      {onExport && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onExport(row);
          }}
          className="interactive flex h-7 items-center rounded-xs px-3 text-left text-body font-[440] text-text-base hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))]"
        >
          {t("export")}
        </button>
      )}
      {onDelete && (
        <>
          <span className="my-0.5 h-px bg-border-weak" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              onDelete(row);
            }}
            className="interactive flex h-7 items-center rounded-xs px-3 text-left text-body font-[440] text-state-fg-danger hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))]"
          >
            {t("delete")}
          </button>
        </>
      )}
    </div>
  );
}