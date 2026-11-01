import { Toast } from "./Toast";
import { useDismissNotice, useNotice } from "@/store/notify";

/** Renders the single transient notice kept by the notify store. */
export function Toaster() {
  const notice = useNotice();
  const dismiss = useDismissNotice();
  if (!notice) return null;
  return <Toast key={notice.id} text={notice.text} tone={notice.tone} onDone={dismiss} />;
}
