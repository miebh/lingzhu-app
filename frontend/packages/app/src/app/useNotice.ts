import { type Accessor } from "solid-js";
import { useNotice, useNotifyStore, type Notice } from "../store/notify";
import { openNoticeTarget } from "../lib/notice";
import type { NoticeTarget } from "@lingzhu/ui/types";

/** The single transient notice plus the actions its card offers. */
export function useNoticeToast(): {
  notice: Accessor<Notice | undefined>;
  open: (target: NoticeTarget) => void;
  dismiss: () => void;
} {
  // `useDismissNotice` only exposes the action through a selector accessor, so
  // the stable action is read straight from the store instead.
  const dismiss = () => useNotifyStore.getState().dismiss();
  return { notice: useNotice(), open: openNoticeTarget, dismiss };
}
