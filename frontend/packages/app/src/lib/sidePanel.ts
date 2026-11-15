export type SidePanelTabID = "review" | "files" | "details" | "plugins" | `file:${string}`;

/**
 * The fixed views the add-tab menu offers; file tabs are opened from the file
 * panes. Context and Terminal are gone: the header context ring and the bottom
 * terminal own those two, so the menu does not duplicate them.
 */
export const SIDE_PANEL_TAB_IDS = ["review", "files", "details", "plugins"] as const satisfies readonly SidePanelTabID[];

/**
 * The view shown when nothing else is selected. It carries the context usage
 * the header ring opens, so the panel always has a real pane to render.
 */
export const DEFAULT_SIDE_PANEL_TAB: SidePanelTabID = "details";

/** One entry in the session side panel's tab strip. */
export interface SidePanelTab {
  id: SidePanelTabID;
  label: string;
}

export function isFilePanelTab(id: SidePanelTabID): id is `file:${string}` {
  return id.startsWith("file:");
}

/** Narrows a persisted value to a view the panel can still render. */
export function isSidePanelTabID(value: unknown): value is SidePanelTabID {
  return (
    typeof value === "string" &&
    (value === "review" ||
      value === "files" ||
      value === "details" ||
      value === "plugins" ||
      (value.startsWith("file:") && value.length > 5))
  );
}
