/** Panel tab list operations shared by the shell and its tests. */
export function addPanelTab<T extends string>(tabs: T[], tab: T): T[] {
  return tabs.includes(tab) ? tabs : [...tabs, tab];
}

export function reorderPanelTabs<T extends string>(tabs: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= tabs.length || to >= tabs.length || from === to) return tabs;
  const next = tabs.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Closing the active tab picks its left neighbour, or the new first tab. */
export function closePanelTabState<T extends string>(input: {
  tabs: T[];
  active: T | undefined;
  closing: T;
}): { tabs: T[]; active: T | undefined; open: boolean } {
  const index = input.tabs.indexOf(input.closing);
  if (index < 0) return { tabs: input.tabs, active: input.active, open: true };
  const tabs = input.tabs.filter((tab) => tab !== input.closing);
  if (tabs.length === 0) return { tabs: input.tabs, active: input.active, open: false };
  const active = input.active === input.closing ? tabs[Math.max(0, index - 1)] : input.active;
  return { tabs, active, open: true };
}
