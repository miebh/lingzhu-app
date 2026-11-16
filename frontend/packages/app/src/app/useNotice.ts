import { useNotice, useDismissNotice, type Notice } from "../store/notify";
import { openNoticeTarget } from "../lib/notice";
import type { NoticeTarget } from "@lingzhu/ui/types";

/** The single transient notice plus the actions its card offers. */
export function useNoticeToast(): { notice?: Notice; open: (target: NoticeTarget) => void; dismiss: () => void } {
  const notice = useNotice();
  const dismiss = useDismissNotice();
  return { notice, open: openNoticeTarget, dismiss };
}
