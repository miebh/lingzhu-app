import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { chatKey } from "@lingzhu/ui/types";
import { api } from "../lib/api";
import { notifySession } from "../store/notify";
import { usePreferencesStore } from "../store/preferences";
import { useChatStore } from "../store/chat";
import { t } from "@lingzhu/ui/i18n";

type NoticeKind = "agent" | "permissions" | "questions" | "errors";
type Snapshot = { running: boolean; pending: number; questions: number };

/**
 * Completion and request notices for sessions the user is not watching.
 *
 * A finished run is reported by the Go side, from the event stream, because a
 * minimised window lets WebView2 suspend its timers: a notice that waited for
 * this hook to notice the end of a run would arrive when the user came back.
 * This hook therefore only publishes which conversation is on screen, raises
 * the in-app card for a foreground window, and keeps the approval and question
 * channels, which need no timer.
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

  // The Go watcher reports runs for sessions the user is not looking at, so it
  // has to know which one is on screen.
  useEffect(() => {
    if (!activePath || !activeId) {
      void api.setWatchedSession("", "").catch(() => undefined);
      return;
    }
    void api.setWatchedSession(activePath, activeId).catch(() => undefined);
  }, [activePath, activeId]);

  // The toast is raised by Go from the event stream, so it cannot read the
  // message catalog itself: hand it the current wording, which also re-sends
  // when the user switches language.
  const language = usePreferencesStore((state) => state.preferences.appearance.language);
  useEffect(() => {
    void api
      .setNoticeCopy({
        finished: t("notifyFinishedBody"),
        failed: t("notifyFailedBody"),
        clickToOpen: t("noticeClickToOpen"),
      })
      .catch(() => undefined);
  }, [language]);

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

  const notifyEvent = (
    target: { workspace: string; sessionID: string },
    title: string,
    body: string,
    kind: NoticeKind,
    tone: "success" | "info" | "error",
  ) => {
    playSound(kind);
    // The window is in front, so the card is enough. A run that ends while the
    // window is behind the user is reported by the Go watcher instead, which
    // still fires when this page is suspended.
    if (document.hasFocus()) {
      notifySession({ title, body, tone, target });
      return;
    }
    void api.notifyTask({ ...target, title, body: `${body} ${t("noticeClickToOpen")}` }).catch(() => {
      // A blocked system channel still has to reach the user.
      notifySession({ title, body, tone, target });
    });
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
      const separator = key.indexOf("\u0000");
      const target = { workspace: key.slice(0, separator), sessionID: key.slice(separator + 1) };
      if (preferences.permissions && chat.pending.length > previous.pending) {
        notifyEvent(target, t("notifyNeedsPermission", { title }), t("notifyNeedsPermissionBody"), "permissions", "info");
      }
      if (preferences.questions && chat.questions.length > previous.questions) {
        notifyEvent(target, t("notifyHasQuestion", { title }), t("notifyHasQuestionBody"), "questions", "info");
      }
      // A finished run is the Go watcher's job; this hook would only report it
      // once the window regained focus.
    }
    notifyState.current = next;
  }, [signature, activePath, activeId]);
}
