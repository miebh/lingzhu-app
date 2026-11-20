import { CommandPalette } from "../../components/shell/CommandPalette";
import { RevertDialog } from "../../components/dialogs/RevertDialog";
import { SummaryDialog } from "../../components/dialogs/SummaryDialog";
import { useChatStore } from "../../store/chat";
import { dismissDialog as dismiss, openDialog, useDialogEntry } from "../../store/dialogs";
import { useShell } from "../ShellProvider";
import { usePaletteCommands } from "../usePaletteCommands";

/** Revert, summary and the command palette. */
export function SpecialDialogs() {
  const shell = useShell();
  const commands = usePaletteCommands();
  const revert = useDialogEntry("revert");
  const summary = useDialogEntry("summary");
  const palette = useDialogEntry("palette");

  return (
    <>
      <SummaryDialog
        open={summary !== undefined}
        title={summary?.props.title}
        text={summary?.props.text ?? ""}
        loading={summary?.props.loading ?? false}
        error={summary?.props.error ?? ""}
        onOpenChange={dismiss("summary")}
      />

      <RevertDialog
        open={revert !== undefined}
        workspace={revert?.props.workspace}
        sessionID={revert?.props.sessionID}
        title={revert?.props.title}
        initialText={revert?.props.text}
        onOpenChange={dismiss("revert")}
        onChanged={() => {
          if (revert) void useChatStore.getState().refresh(revert.props.workspace, revert.props.sessionID);
        }}
      />

      <CommandPalette
        open={palette !== undefined}
        workspace={shell.activePath}
        commands={commands}
        onOpenFile={(path) => {
          if (shell.activePath) openDialog({ id: "files", props: { workspace: shell.activePath, path } });
        }}
        onOpenChange={dismiss("palette")}
      />
    </>
  );
}
