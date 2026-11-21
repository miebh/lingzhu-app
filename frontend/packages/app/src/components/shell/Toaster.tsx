import { Show, type Accessor } from "solid-js";
import type { Notice } from "../../store/notify";
import { Toast } from "./Toast";
import { useNoticeToast } from "../../app/useNotice";

/** Renders the single transient notice kept by the notify store. */
export function Toaster() {
  const toast = useNoticeToast();
  // The domain hook exposes the notify store's accessor.
  const notice = toast.notice as unknown as Accessor<Notice | undefined>;
  return (
    <Show when={notice()}>
      {(current) => (
        <Toast
          title={current().title}
          body={current().body}
          tone={current().tone}
          target={current().target}
          onOpen={toast.open}
          onDone={toast.dismiss}
        />
      )}
    </Show>
  );
}
