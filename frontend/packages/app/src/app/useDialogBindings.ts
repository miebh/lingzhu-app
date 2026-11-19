import { useMemo } from "react";
import type { BatchExportItem } from "../lib/batchExport";
import type { SessionInfo, SessionSelection } from "@lingzhu/ui/types";
import {
  useDialogStore,
  type DialogEntry,
  type SessionDialogTarget,
} from "../store/dialogs";

type PathDialogID =
  | "remove-workspace"
  | "worktree"
  | "source-control"
  | "artifacts"
  | "project"
  | "services"
  | "core"
  | "core-models"
  | "mcp"
  | "plugins"
  | "search"
  | "live-events"
  | "jobs-overview"
  | "schedules-overview"
  | "usage-overview"
  | "web-search"
  | "image-gen"
  | "formatters"
  | "oauth"
  | "worktrees";

type SessionDialogID =
  | "rename"
  | "share"
  | "pairing"
  | "media"
  | "usage"
  | "references"
  | "log"
  | "inbox"
  | "forms"
  | "jobs"
  | "skills"
  | "synthetic"
  | "run-command"
  | "wait"
  | "prompt-once"
  | "revert"
  | "schedules"
  | "environment"
;

/**
 * Setters with the shell's original signatures, backed by the dialog store.
 * Call sites keep opening a dialog the same way; only the state that used to
 * re-render the whole shell moved out.
 */
export function useDialogBindings() {
  const open = useDialogStore((state) => state.open);
  const close = useDialogStore((state) => state.close);

  return useMemo(() => {
    const path = (id: PathDialogID) => (value?: string) => {
      if (value === undefined) close(id);
      else open({ id, props: { path: value } } as DialogEntry);
    };

    const session = (id: SessionDialogID) => (value?: SessionDialogTarget) => {
      if (value === undefined) close(id);
      else open({ id, props: value } as DialogEntry);
    };

    return {
      setRenameTarget: (value?: { workspace: string; session: SessionInfo }) => {
        if (value) open({ id: "rename", props: value });
        else close("rename");
      },
      setDeleteTarget: (value?: { workspace: string; session: SessionInfo }) => {
        if (value) open({ id: "delete", props: value });
        else close("delete");
      },
      setMoveTarget: (value?: { path: string; session: SessionInfo }) => {
        if (value) open({ id: "move", props: value });
        else close("move");
      },
      setBulkDeleteTarget: (items?: SessionSelection[]) => {
        if (items) open({ id: "bulk-delete", props: { items } });
        else close("bulk-delete");
      },
      setBulkMoveTarget: (items?: SessionSelection[]) => {
        if (items) open({ id: "bulk-move", props: { items } });
        else close("bulk-move");
      },
      setBulkExportTarget: (items?: BatchExportItem[]) => {
        if (items) open({ id: "bulk-export", props: { items } });
        else close("bulk-export");
      },
      setRemoveWorkspaceTarget: path("remove-workspace"),
      setFilesTarget: (value?: { workspace: string; path?: string }) => {
        if (value) open({ id: "files", props: value });
        else close("files");
      },
      setTransferTarget: (value?: { workspace: string; sessionID?: string; title?: string }) => {
        if (value) open({ id: "transfer", props: value });
        else close("transfer");
      },
      setPaletteOpen: (value: boolean) => {
        if (value) open({ id: "palette", props: {} });
        else close("palette");
      },
      togglePalette: () => {
        const entries = useDialogStore.getState().entries;
        if (entries.palette) close("palette");
        else open({ id: "palette", props: {} });
      },

      setWorktreeTarget: path("worktree"),
      setSourceControlTarget: path("source-control"),
      setArtifactsTarget: path("artifacts"),
      setProjectTarget: path("project"),
      setServicesTarget: path("services"),
      setCoreTarget: path("core"),
      setCoreModelsTarget: path("core-models"),
      setMCPTarget: (value?: string, server?: string) => {
        if (value === undefined) close("mcp");
        else open({ id: "mcp", props: { path: value, server } });
      },
      setPluginsTarget: path("plugins"),
      setSearchTarget: path("search"),
      setLiveEventsTarget: path("live-events"),
      setJobsOverviewTarget: path("jobs-overview"),
      setSchedulesOverviewTarget: path("schedules-overview"),
      setUsageOverviewTarget: path("usage-overview"),
      setWebSearchTarget: path("web-search"),
      setImageGenTarget: path("image-gen"),
      setFormattersTarget: path("formatters"),
      setOAuthTarget: path("oauth"),
      setWorktreesTarget: path("worktrees"),

      setShareTarget: session("share"),
      setPairingTarget: session("pairing"),
      setMediaTarget: session("media"),
      setUsageTarget: session("usage"),
      setReferencesTarget: session("references"),
      setLogTarget: session("log"),
      setInboxTarget: session("inbox"),
      setFormsTarget: session("forms"),
      setJobsTarget: session("jobs"),
      setSkillsTarget: session("skills"),
      setSyntheticTarget: session("synthetic"),
      setRunCommandTarget: session("run-command"),
      setWaitTarget: session("wait"),
      setPromptOnceTarget: session("prompt-once"),
      setRevertTarget: session("revert"),
      setSchedulesTarget: session("schedules"),
      setEnvironmentTarget: session("environment"),
    };
  }, [open, close]);
}
