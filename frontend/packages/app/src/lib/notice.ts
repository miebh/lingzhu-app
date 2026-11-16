import type { NoticeTarget } from "@lingzhu/ui/types";
import { useChatStore } from "../store/chat";
import { useViewStore } from "../store/view";
import { useWorkspaceStore } from "../store/workspaces";

/**
 * Opens the session a notice names. A notification is only useful if acting on
 * it lands on the conversation it reported about, so this is the single path
 * both the card and the desktop toast take.
 */
export function openNoticeTarget(target: NoticeTarget) {
  const view = useViewStore.getState();
  // Settings is an overlay, so it has to close before the session is visible.
  if (view.settingsOpen) view.closeSettings();
  view.showChat();
  useWorkspaceStore.getState().select(target.workspace);
  void useChatStore.getState().open(target.workspace, target.sessionID);
}
