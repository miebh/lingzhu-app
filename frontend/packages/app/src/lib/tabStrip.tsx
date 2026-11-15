import { useEffect, useRef, useState } from "react";
import { ActivityRing } from "@lingzhu/ui/ActivityRing";
import type { SideTab } from "../lib/sessionTabs";

/** One row being renamed inline in a tab strip. */
export interface TabEditing {
  key: string;
  value: string;
}

/**
 * Inline rename state shared by the side rail and the top strip. `commit`
 * guards against the Enter key and the blur that follows it both firing.
 */
export function useTabRename(onRename?: (tab: SideTab, title: string) => void) {
  const [editing, setEditing] = useState<TabEditing>();
  const committing = useRef(false);

  const begin = (tab: SideTab) => setEditing({ key: tab.key, value: tab.label });
  const cancel = () => setEditing(undefined);
  const change = (tab: SideTab, value: string) => setEditing({ key: tab.key, value });

  const commit = (tab: SideTab) => {
    if (committing.current) return;
    committing.current = true;
    const value = editing?.value.trim();
    setEditing(undefined);
    if (value && value !== tab.label) onRename?.(tab, value);
    window.setTimeout(() => {
      committing.current = false;
    }, 0);
  };

  return { editing, begin, cancel, change, commit };
}

/**
 * Closes a popup when the pointer lands elsewhere or the window loses focus or
 * resizes. Both strips dismiss their context and recently-closed menus this way.
 */
export function useDismissOnOutside(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const dismiss = () => close();
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("blur", dismiss);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("resize", dismiss);
    };
  }, [open, close]);
}

/**
 * The status mark a tab shows while a session runs or failed: an activity ring
 * while it works, then a warning or danger dot.
 */
export function TabStatusMark({ status }: { status: NonNullable<SideTab["status"]> }) {
  if (status === "ongoing") return <ActivityRing className="text-icon-base" />;
  return (
    <span
      aria-hidden="true"
      className={`size-[7px] shrink-0 rounded-full ${
        status === "warning" ? "bg-state-fg-warning" : "bg-state-fg-danger"
      }`}
    />
  );
}

/**
 * The inline rename field both strips render in place of a tab title. Enter
 * commits, Escape cancels, and blur commits so clicking away saves the edit.
 */
export function TabRenameInput({
  tab,
  value,
  className,
  onChange,
  onCommit,
  onCancel,
}: {
  tab: SideTab;
  value: string;
  className: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <input
      autoFocus
      value={value}
      aria-label={`Rename ${tab.label}`}
      onChange={(event) => onChange(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          onCommit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
      onBlur={onCommit}
      className={className}
    />
  );
}
