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
  // The projection closes first so no settings/Home frame survives while the
  // session route loads; opening the session then updates the URL.
  useViewStore.setState({ tab: "chat", homeOpen: false, settingsOpen: false });
  useWorkspaceStore.getState().select(target.workspace);
  void useChatStore.getState().open(target.workspace, target.sessionID);
}
