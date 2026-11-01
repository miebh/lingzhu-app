import { create } from "zustand";
import type { ToastTone } from "../components/Toast";

interface Notice {
  id: number;
  text: string;
  tone: ToastTone;
}

interface NotifyStore {
  notice?: Notice;
  push: (text: string, tone?: ToastTone) => void;
  dismiss: () => void;
}

let nextID = 0;

/** Single transient notice slot shared by every store and surface. */
export const useNotifyStore = create<NotifyStore>((set) => ({
  notice: undefined,
  push: (text, tone = "error") => {
    nextID += 1;
    set({ notice: { id: nextID, text, tone } });
  },
  dismiss: () => set({ notice: undefined }),
}));

/** Fire-and-forget notice for callers that are not components or are stores. */
export function notify(text: string, tone: ToastTone = "error") {
  useNotifyStore.getState().push(text, tone);
}

export function useNotice(): Notice | undefined {
  return useNotifyStore((state) => state.notice);
}

export function useDismissNotice(): () => void {
  return useNotifyStore((state) => state.dismiss);
}
