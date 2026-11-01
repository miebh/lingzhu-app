import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Toast, type ToastTone } from "../components/Toast";

interface Notice {
  id: number;
  text: string;
  tone: ToastTone;
}

interface NotifyValue {
  notify: (text: string, tone?: ToastTone) => void;
}

const NotifyContext = createContext<NotifyValue | undefined>(undefined);

/**
 * Owns the single transient notice slot. Providers and actions report through
 * it, so no surface has to render its own toast.
 */
export function NotifyProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice>();
  const nextID = useRef(0);

  const notify = useCallback((text: string, tone: ToastTone = "error") => {
    nextID.current += 1;
    setNotice({ id: nextID.current, text, tone });
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <NotifyContext.Provider value={value}>
      {children}
      {notice && (
        <Toast key={notice.id} text={notice.text} tone={notice.tone} onDone={() => setNotice(undefined)} />
      )}
    </NotifyContext.Provider>
  );
}

export function useNotify(): (text: string, tone?: ToastTone) => void {
  const value = useContext(NotifyContext);
  if (!value) throw new Error("useNotify must be used inside NotifyProvider");
  return value.notify;
}
