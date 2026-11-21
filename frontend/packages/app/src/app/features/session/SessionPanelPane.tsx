import { SessionSidePanel } from "../../../components/session/SessionSidePanel";
import { useShell } from "../../ShellProvider";
import { useActiveChat, useAtHome } from "../../hooks";
import { modelWindow } from "../../../lib/contextUsage";

/** The context/review/files panel beside the transcript. */
export function SessionPanelPane() {
  const shell = useShell();
  const view = shell.view;
  const panel = shell.panel;
  const active = useActiveChat();
  const atHome = useAtHome();
  const endInset = 10;

  return (
    <SessionSidePanel
      open={panel.panelOpen && view.tab === "chat" && !atHome() && Boolean(active()) && Boolean(shell.activeWorkspace)}
      workspace={shell.activeWorkspace?.path}
      sessionID={active()?.id}
      title={active()?.title}
      tabs={panel.panelTabsView}
      active={panel.panelTab}
      onSelect={panel.setPanelTab}
      onCloseTab={panel.closePanelTab}
      onReorderTabs={panel.setPanelTabs}
      onClose={() => panel.setPanelOpen(false)}
      onSendReview={(text, comments) =>
        void shell.chatActions.send(text, undefined, [], {
          comments: comments?.map((comment) => ({
            id: comment.id,
            file: comment.file,
            line: comment.end,
            body: comment.text,
          })),
        })
      }
      onOpenFile={panel.openFileInPanel}
      onAddTab={(id) => panel.addPanelTab(id)}
      chat={active()}
      contextWindow={modelWindow(shell.providers, active()?.provider, active()?.model)}
      endInset={endInset}
    />
  );
}
