import { SideTabs } from "../../components/SideTabs";
import { Sidebar } from "../../components/Sidebar";
import { useProjectTreeProps } from "../useProjectTreeProps";
import { useTabStripProps } from "../useTabStripProps";
import { useShell } from "../ShellProvider";

/** The vertical rail: session tabs plus the optional Projects tree. */
export function ShellSidebar() {
  const shell = useShell();
  const tabStrip = useTabStripProps();
  const tree = useProjectTreeProps();

  if (shell.mobile || shell.resolvedLayout === "horizontal" || !shell.sidebarOpen) return null;

  return (
    <SideTabs {...tabStrip}>
      {shell.resolvedLayout === "vertical" &&
        shell.preferences.appearance.sidebarOrganize === "projects" && <Sidebar {...tree} />}
    </SideTabs>
  );
}
