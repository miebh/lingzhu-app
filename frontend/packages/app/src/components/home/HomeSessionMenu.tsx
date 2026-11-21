import { onCleanup, onMount, Show } from "solid-js";
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
export function HomeSessionMenu(props: Props) {
  let root: HTMLDivElement | undefined;
  // A pointer press anywhere else, or the window losing focus, dismisses it.
  onMount(() => {
    const close = (event: Event) => {
      if (root && event.target instanceof Node && root.contains(event.target)) return;
      props.onClose();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    onCleanup(() => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
    });
  });

  return (
    <div
      ref={(element) => (root = element)}
      role="menu"
      aria-label={t("sessionActions")}
      style={{ left: `${props.x}px`, top: `${props.y}px` }}
      onPointerDown={(event) => event.stopPropagation()}
      class="fixed z-50 flex w-40 flex-col gap-0.5 rounded-md bg-bg-layer-01 p-0.5 elevation-floating"
    >
      <Show when={props.onRename}>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            props.onRename?.(props.row);
            props.onClose();
          }}
          class="interactive flex h-7 items-center rounded-xs px-3 text-left text-body font-[440] text-text-base hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))]"
        >
          {t("renamePlain")}
        </button>
      </Show>
      <Show when={props.onExport}>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            props.onExport?.(props.row);
            props.onClose();
          }}
          class="interactive flex h-7 items-center rounded-xs px-3 text-left text-body font-[440] text-text-base hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))]"
        >
          {t("export")}
        </button>
      </Show>
      <Show when={props.onDelete}>
        <span class="my-0.5 h-px bg-border-weak" role="separator" />
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            props.onDelete?.(props.row);
            props.onClose();
          }}
          class="interactive flex h-7 items-center rounded-xs px-3 text-left text-body font-[440] text-state-fg-danger hover:bg-[linear-gradient(var(--overlay-hover),var(--overlay-hover))]"
        >
          {t("delete")}
        </button>
      </Show>
    </div>
  );
}
