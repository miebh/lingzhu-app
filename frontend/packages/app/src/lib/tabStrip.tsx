import { Show, createEffect, createSignal, onCleanup, type Accessor } from "solid-js";
import { ActivityRing } from "@lingzhu/ui/ActivityRing";
import type { SideTab } from "./sessionTabs";

/** One row being renamed inline in a tab strip. */
export interface TabEditing {
  key: string;
  value: string;
}

/**
 * Inline rename state shared by the side rail and the top strip. `committing`
 * guards against the Enter key and the blur that follows it both firing.
 */
export function useTabRename(onRename?: (tab: SideTab, title: string) => void) {
  const [editing, setEditing] = createSignal<TabEditing>();
  let committing = false;

  const begin = (tab: SideTab) => setEditing({ key: tab.key, value: tab.label });
  const cancel = () => setEditing(undefined);
  const change = (tab: SideTab, value: string) => setEditing({ key: tab.key, value });

  const commit = (tab: SideTab) => {
    if (committing) return;
    committing = true;
    const value = editing()?.value.trim();
    setEditing(undefined);
    if (value && value !== tab.label) onRename?.(tab, value);
    window.setTimeout(() => {
      committing = false;
    }, 0);
  };

  return { editing, begin, cancel, change, commit };
}

/**
 * Closes a popup when the pointer lands elsewhere or the window loses focus or
 * resizes. Both strips dismiss their context and recently-closed menus this way.
 */
export function useDismissOnOutside(open: Accessor<boolean>, close: () => void) {
  createEffect(() => {
    if (!open()) return;
    const dismiss = () => close();
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("blur", dismiss);
    window.addEventListener("resize", dismiss);
    onCleanup(() => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("resize", dismiss);
    });
  });
}

/**
 * The status mark a tab shows while a session runs or failed: an activity ring
 * while it works, then a warning or danger dot.
 */
export function TabStatusMark(props: { status: NonNullable<SideTab["status"]> }) {
  return (
    <Show when={props.status === "ongoing"} fallback={
      <span
        aria-hidden="true"
        class={`size-[7px] shrink-0 rounded-full ${
          props.status === "warning" ? "bg-state-fg-warning" : "bg-state-fg-danger"
        }`}
      />
    }>
      <ActivityRing class="text-icon-base" />
    </Show>
  );
}

/**
 * The inline rename field both strips render in place of a tab title. Enter
 * commits, Escape cancels, and blur commits so clicking away saves the edit.
 */
export function TabRenameInput(props: {
  tab: SideTab;
  value: string;
  class: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <input
      autofocus
      value={props.value}
      aria-label={`Rename ${props.tab.label}`}
      onChange={(event) => props.onChange(event.currentTarget.value)}
      onClick={(event) => event.stopPropagation()}
      onDblClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          props.onCommit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          props.onCancel();
        }
      }}
      onBlur={props.onCommit}
      class={props.class}
    />
  );
}
