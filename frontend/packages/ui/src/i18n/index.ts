import { useSyncExternalStore } from "react";
import { en } from "./en.ts";
import { zh } from "./zh.ts";

export type Language = "en" | "zh";

export type MessageKey = keyof typeof en;

let language: Language = "en";
const listeners = new Set<() => void>();

export function setLanguage(next: Language) {
  if (language === next) return;
  language = next;
  // Screen readers and hyphenation follow the document language, so it tracks
  // the UI language instead of staying at the static value in index.html.
  if (typeof document !== "undefined") document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
  for (const listener of listeners) listener();
}

export function currentLanguage(): Language {
  return language;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Subscribes a component so it re-renders when the language changes. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, currentLanguage, currentLanguage);
}

/** Translator that re-renders its component whenever the language changes. */
export function useT() {
  useLanguage();
  return t;
}

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let message = (language === "en" ? en[key] : zh[key]) ?? en[key];
  if (!vars) return message;
  for (const [name, value] of Object.entries(vars)) {
    message = message.split(`{{${name}}}`).join(String(value));
  }
  return message;
}
