import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { chatKey } from "@lingzhu/ui/types";
import { notify } from "../store/notify";
import { usePreferencesStore } from "../store/preferences";
import { useChatStore } from "../store/chat";
import { t } from "@lingzhu/ui/i18n";

type NoticeKind = "agent" | "permissions" | "questions" | "errors";
type Snapshot = { running: boolean; pending: number; questions: number };

/**
 * Desktop and in-app notifications for sessions the user is not watching.
 * Sounds are best-effort: an unavailable audio device must never interrupt the
 * event stream.
 *
 * The hook subscribes to a status signature rather than the chat map, so a
 * streamed token does not re-run the notification scan for every session.
 */
export function useAppNotifications(activePath?: string, activeId?: string) {
  const notifyState = useRef<Record<string, Snapshot>>({});
  const audio = useRef<AudioContext | undefined>(undefined);
  const signature = useChatStore(
    useShallow((state) =>
      Object.entries(state.chats).map(
        ([key, chat]) => `${key}:${chat.running ? 1 : 0}:${chat.pending.length}:${chat.questions.length}`,
      ),
    ),
  );

  const playSound = (kind: NoticeKind) => {
    if (!usePreferencesStore.getState().preferences.sounds[kind]) return;
    if (typeof AudioContext === "undefined") return;
    try {
      const context = (audio.current ??= new AudioContext());
      const tone = usePreferencesStore.getState().preferences.sounds.tones[kind] ?? "soft";
      const frequency = { soft: 520, bright: 880, low: 300, chime: 660 }[tone] ?? 520;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.06, context.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.2);
    } catch {
      // Sound is best-effort; an unavailable audio device must not interrupt events.
    }
  };

  const notifyEvent = (title: string, body: string, kind?: NoticeKind) => {
    notify(`${title} — ${body}`, "info");
    if (kind) playSound(kind);
    try {
      if (typeof Notification === "undefined") return;
      if (Notification.permission === "granted") new Notification(title, { body });
      else if (Notification.permission === "default") void Notification.requestPermission();
    } catch {
      // Notifications are best-effort; a denied or unsupported API must not
      // interrupt the event stream.
    }
  };

  useEffect(() => {
    const preferences = usePreferencesStore.getState().preferences.notifications;
    const next: Record<string, Snapshot> = {};
    const foreground = document.hasFocus() && activePath && activeId ? chatKey(activePath, activeId) : undefined;
    // The store snapshot is read at effect time; the signature dependency is
    // what makes this re-run, so the hook never subscribes to chat objects.
    for (const [key, chat] of Object.entries(useChatStore.getState().chats)) {
      const previous = notifyState.current[key];
      next[key] = { running: chat.running, pending: chat.pending.length, questions: chat.questions.length };
      if (!previous || key === foreground) continue;
      const title = chat.title || t("notifySessionFallback");
      if (preferences.permissions && chat.pending.length > previous.pending) {
        notifyEvent(t("notifyNeedsPermission", { title }), t("notifyNeedsPermissionBody"), "permissions");
      }
      if (preferences.questions && chat.questions.length > previous.questions) {
        notifyEvent(t("notifyHasQuestion", { title }), t("notifyHasQuestionBody"), "questions");
      }
      if (preferences.agent && previous.running && !chat.running && !chat.error) {
        notifyEvent(t("notifyFinished", { title }), t("notifyFinishedBody"), "agent");
      }
      if (preferences.errors && previous.running && !chat.running && chat.error) {
        notifyEvent(t("notifyFailed", { title }), chat.error, "errors");
      }
    }
    notifyState.current = next;
  }, [signature, activePath, activeId]);
}
