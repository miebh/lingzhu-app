import { Toast } from "./Toast";
import { useNoticeToast } from "../app/useNotice";

/** Renders the single transient notice kept by the notify store. */
export function Toaster() {
  const { notice, open, dismiss } = useNoticeToast();
  if (!notice) return null;
  return (
    <Toast
      key={notice.id}
      title={notice.title}
      body={notice.body}
      tone={notice.tone}
      target={notice.target}
      onOpen={open}
      onDone={dismiss}
    />
  );
}
