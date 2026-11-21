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
        open={summary() !== undefined}
        title={summary()?.props.title}
        text={summary()?.props.text ?? ""}
        loading={summary()?.props.loading ?? false}
        error={summary()?.props.error ?? ""}
        onOpenChange={dismiss("summary")}
      />

      <RevertDialog
        open={revert() !== undefined}
        workspace={revert()?.props.workspace}
        sessionID={revert()?.props.sessionID}
        title={revert()?.props.title}
        initialText={revert()?.props.text}
        onOpenChange={dismiss("revert")}
        onChanged={() => {
          const entry = revert();
          if (entry) void useChatStore.getState().refresh(entry.props.workspace, entry.props.sessionID);
        }}
      />

      <CommandPalette
        open={palette() !== undefined}
        workspace={shell.activePath}
        commands={commands()}
        onOpenFile={(path) => {
          const workspace = shell.activePath;
          if (workspace) openDialog({ id: "files", props: { workspace, path } });
        }}
        onOpenChange={dismiss("palette")}
      />
    </>
  );
}
