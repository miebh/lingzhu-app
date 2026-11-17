import type { ComponentType } from "react";
import { ArtifactsDialog } from "../../components/ArtifactsDialog";
import { CoreDialog } from "../../components/CoreDialog";
import { CoreModelsDialog } from "../../components/CoreModelsDialog";
import { FileTreeDialog } from "../../components/FileTreeDialog";
import { FormattersDialog } from "../../components/FormattersDialog";
import { ImageGenDialog } from "../../components/ImageGenDialog";
import { JobsOverviewDialog } from "../../components/JobsOverviewDialog";
import { LiveEventsDialog } from "../../components/LiveEventsDialog";
import { MCPDialog } from "../../components/MCPDialog";
import { OAuthDialog } from "../../components/OAuthDialog";
import { PluginsDialog } from "../../components/PluginsDialog";
import { ProjectDialog } from "../../components/ProjectDialog";
import { SchedulesOverviewDialog } from "../../components/SchedulesOverviewDialog";
import { SearchDialog } from "../../components/SearchDialog";
import { ServicesDialog } from "../../components/ServicesDialog";
import { SourceControlDialog } from "../../components/SourceControlDialog";
import { UsageOverviewDialog } from "../../components/UsageOverviewDialog";
import { WebSearchDialog } from "../../components/WebSearchDialog";
import { WorktreesDialog } from "../../components/WorktreesDialog";
import { workspaceName } from "../../lib/history";
import { useChatStore } from "../../store/chat";
import { dismissDialog, useDialogEntry, type DialogID } from "../../store/dialogs";
import { useWorkspaceStore } from "../../store/workspaces";
import { useShell } from "../ShellProvider";

type PathDialogID =
  | "source-control"
  | "artifacts"
  | "services"
  | "core"
  | "core-models"
  | "mcp"
  | "plugins"
  | "oauth"
  | "web-search"
  | "image-gen"
  | "formatters";

interface PathDialogProps {
  open: boolean;
  workspace?: string;
  name?: string;
  onOpenChange: (open: boolean) => void;
}

const PathSlot = ({
  id,
  component: Dialog,
}: {
  id: PathDialogID;
  component: ComponentType<PathDialogProps>;
}) => {
  const shell = useShell();
  const entry = useDialogEntry(id);
  const path = entry?.props.path;
  const resolved = shell.workspaceList.find((workspace) => workspace.path === path)?.name;

  return (
    <Dialog
      open={entry !== undefined}
      workspace={path}
      name={resolved ?? (path ? workspaceName(path) : undefined)}
      onOpenChange={dismissDialog(id)}
    />
  );
};

/** Dialogs addressed by a workspace path only. */
export function PathDialogs() {
  const shell = useShell();
  const project = useDialogEntry("project");
  const files = useDialogEntry("files");
  const worktrees = useDialogEntry("worktrees");
  const search = useDialogEntry("search");
  const liveEvents = useDialogEntry("live-events");
  const jobsOverview = useDialogEntry("jobs-overview");
  const schedulesOverview = useDialogEntry("schedules-overview");
  const usageOverview = useDialogEntry("usage-overview");

  const nameOf = (path?: string) =>
    shell.workspaceList.find((workspace) => workspace.path === path)?.name ??
    (path ? workspaceName(path) : undefined);

  const openSession = (path?: string, sessionID?: string) => {
    if (!path || !sessionID) return;
    useWorkspaceStore.getState().select(path);
    void useChatStore.getState().open(path, sessionID);
  };

  const dialogs: Array<[PathDialogID, ComponentType<PathDialogProps>]> = [
    ["source-control", SourceControlDialog],
    ["artifacts", ArtifactsDialog],
    ["services", ServicesDialog],
    ["core", CoreDialog],
    ["core-models", CoreModelsDialog],
    ["mcp", MCPDialog],
    ["plugins", PluginsDialog],
    ["oauth", OAuthDialog],
    ["web-search", WebSearchDialog],
    ["image-gen", ImageGenDialog],
    ["formatters", FormattersDialog],
  ];

  return (
    <>
      {dialogs.map(([id, component]) => (
        <PathSlot key={id} id={id} component={component} />
      ))}

      <ProjectDialog
        open={project !== undefined}
        workspace={project?.props.path}
        sessionID={project?.props.path === shell.activePath ? shell.activeId : undefined}
        name={nameOf(project?.props.path)}
        onOpenChange={dismissDialog("project")}
      />
      <FileTreeDialog
        open={files !== undefined}
        workspace={files?.props.workspace}
        name={files ? workspaceName(files.props.workspace) : undefined}
        initialPath={files?.props.path}
        onOpenChange={dismissDialog("files")}
      />
      <WorktreesDialog
        open={worktrees !== undefined}
        workspace={worktrees?.props.path}
        name={nameOf(worktrees?.props.path)}
        startup={
          worktrees ? shell.preferences.projectWorktreeStartup[worktrees.props.path] : undefined
        }
        onOpenChange={dismissDialog("worktrees")}
        onAddWorkspace={shell.sessionActions.addWorktreeWorkspace}
      />
      <SearchDialog
        open={search !== undefined}
        workspace={search?.props.path}
        name={nameOf(search?.props.path)}
        onOpenChange={dismissDialog("search")}
        onOpenSession={(sessionID) => openSession(search?.props.path, sessionID)}
      />
      <LiveEventsDialog
        open={liveEvents !== undefined}
        workspace={liveEvents?.props.path}
        name={nameOf(liveEvents?.props.path)}
        onOpenChange={dismissDialog("live-events")}
        onOpenSession={(sessionID) => openSession(liveEvents?.props.path, sessionID)}
      />
      <JobsOverviewDialog
        open={jobsOverview !== undefined}
        workspace={jobsOverview?.props.path}
        name={nameOf(jobsOverview?.props.path)}
        onOpenChange={dismissDialog("jobs-overview")}
        onOpenSession={(sessionID) => openSession(jobsOverview?.props.path, sessionID)}
      />
      <SchedulesOverviewDialog
        open={schedulesOverview !== undefined}
        workspace={schedulesOverview?.props.path}
        name={nameOf(schedulesOverview?.props.path)}
        onOpenChange={dismissDialog("schedules-overview")}
        onOpenSession={(sessionID) => openSession(schedulesOverview?.props.path, sessionID)}
      />
      <UsageOverviewDialog
        open={usageOverview !== undefined}
        workspace={usageOverview?.props.path}
        name={nameOf(usageOverview?.props.path)}
        onOpenChange={dismissDialog("usage-overview")}
        onOpenSession={(sessionID) => openSession(usageOverview?.props.path, sessionID)}
      />
    </>
  );
}

export type { DialogID };
