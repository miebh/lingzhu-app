import { createSignal } from "solid-js";
import { en } from "./en.ts";
import { zh } from "./zh.ts";

export type Language = "en" | "zh";

export type MessageKey = keyof typeof en;

let language: Language = "en";
const [languageSignal, setLanguageSignal] = createSignal<Language>(language);

export function setLanguage(next: Language) {
  if (language === next) return;
  language = next;
  // Screen readers and hyphenation follow the document language, so it tracks
  // the UI language instead of staying at the static value in index.html.
  if (typeof document !== "undefined") document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
  setLanguageSignal(next);
}

export function currentLanguage(): Language {
  return languageSignal();
}

/** Accessor for the language; read it inside a memo or JSX to follow changes. */
export function useLanguage(): () => Language {
  return languageSignal;
}

/** Translator. Calling it inside a reactive scope subscribes to the language. */
export function useT() {
  return (key: MessageKey, vars?: Record<string, string | number>) => {
    languageSignal();
    return translate(language, key, vars);
  };
}

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  languageSignal();
  return translate(language, key, vars);
}

function translate(lang: Language, key: MessageKey, vars?: Record<string, string | number>): string {
  let message = (lang === "en" ? en[key] : zh[key]) ?? en[key];
  if (!vars) return message;
  for (const [name, value] of Object.entries(vars)) {
    message = message.split(`{{${name}}}`).join(String(value));
  }
  return message;
}
