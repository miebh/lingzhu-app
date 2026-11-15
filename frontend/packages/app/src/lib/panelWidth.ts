/**
 * Panel row geometry. The transcript owns a minimum width and the side panel
 * takes whatever the row leaves above it, so shrinking the window narrows the
 * side panel first instead of squeezing the transcript.
 */

/** The transcript keeps this width before the side panel gives way. */
export const CHAT_PANEL_WIDTH_MIN = 400;

/** Floor of the side panel while the row still holds both minimums. */
export const SIDE_PANEL_WIDTH_MIN = 320;

/** Widest the side panel grows, whether dragged or restored. */
export const SIDE_PANEL_WIDTH_MAX = 800;

/** Width a first run starts at. */
export const SIDE_PANEL_WIDTH_DEFAULT = 480;

/** Mirrors `--spacing-panel-gap`: the row's gap between the two panels. */
export const PANEL_ROW_GAP = 8;

/** Narrowest row that holds the transcript and the side panel side by side. */
export const PANEL_ROW_WIDTH_MIN = CHAT_PANEL_WIDTH_MIN + PANEL_ROW_GAP + SIDE_PANEL_WIDTH_MIN;

/**
 * The widest the panel can be without pushing the transcript under its
 * minimum. A row of unknown width falls back to the hard maximum.
 */
export function sidePanelWidthMax(rowWidth = 0): number {
  if (!(rowWidth > 0)) return SIDE_PANEL_WIDTH_MAX;
  return Math.min(SIDE_PANEL_WIDTH_MAX, Math.max(SIDE_PANEL_WIDTH_MIN, rowWidth - PANEL_ROW_GAP - CHAT_PANEL_WIDTH_MIN));
}

/** A dragged or restored width, clamped to the hard range and to the row. */
export function clampSidePanelWidth(width: number, rowWidth = 0): number {
  return Math.min(sidePanelWidthMax(rowWidth), Math.max(SIDE_PANEL_WIDTH_MIN, width));
}

/** The stored width, or the default when nothing usable was saved. */
export function readSidePanelWidth(saved: string | null): number {
  const value = Number(saved);
  return Number.isFinite(value) && value > 0 ? clampSidePanelWidth(value) : SIDE_PANEL_WIDTH_DEFAULT;
}

/** Whether the row is wide enough for both panels; below it the panel floats. */
export function panelRowHoldsBoth(rowWidth: number): boolean {
  return !(rowWidth > 0) || rowWidth >= PANEL_ROW_WIDTH_MIN;
}

/**
 * The floating panel's width. It covers the transcript instead of taking space
 * from it, so it only has to stay inside the row: the row less one gutter.
 */
export function overlaySidePanelWidth(width: number, rowWidth = 0): number {
  const clamped = clampSidePanelWidth(width);
  if (!(rowWidth > 0)) return clamped;
  return Math.max(0, Math.min(clamped, rowWidth - PANEL_ROW_GAP * 2));
}
