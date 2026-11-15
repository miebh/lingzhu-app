export type TabLayout = "horizontal" | "vertical" | "inbox";

/** Narrow screens use the horizontal tab strip; the vertical rail is desktop-only. */
export function effectiveTabLayout(layout: TabLayout, mobile: boolean): TabLayout {
  return mobile ? "horizontal" : layout;
}
