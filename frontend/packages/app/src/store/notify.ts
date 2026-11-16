import { create } from "zustand";
import type { NoticeTarget, ToastTone } from "@lingzhu/ui/types";
import { isCancellation } from "../lib/errors";

export interface Notice {
  id: number;
  /** Headline; a plain notice uses the text itself as the headline. */
  title: string;
  /** Secondary line under the headline. */
  body?: string;
  tone: ToastTone;
  /** The session the notice is about, so the toast can reopen it. */
  target?: NoticeTarget;
}

interface NotifyStore {
  notice?: Notice;
  push: (notice: Omit<Notice, "id">) => void;
  dismiss: () => void;
}

let nextID = 0;

/** Single transient notice slot shared by every store and surface. */
export const useNotifyStore = create<NotifyStore>((set) => ({
  notice: undefined,
  push: (notice) => {
    nextID += 1;
    set({ notice: { ...notice, id: nextID } });
  },
  dismiss: () => set({ notice: undefined }),
}));

/** Fire-and-forget notice for callers that are not components or are stores. */
export function notify(text: string, tone: ToastTone = "error") {
  const value = text.trim();
  if (!value || isCancellation(value)) return;
  useNotifyStore.getState().push({ title: value, tone });
}

/**
 * A finished run, raised with the session it belongs to. The toast reopens
 * that conversation on click, so the notice is a way back into the work.
 */
export function notifySession(notice: { title: string; body?: string; tone?: ToastTone; target: NoticeTarget }) {
  useNotifyStore.getState().push({
    title: notice.title.trim(),
    body: notice.body?.trim() || undefined,
    tone: notice.tone ?? "success",
    target: notice.target,
  });
}

export function useNotice(): Notice | undefined {
  return useNotifyStore((state) => state.notice);
}

export function useDismissNotice(): () => void {
  return useNotifyStore((state) => state.dismiss);
}
