import { useEffect, useState } from "react";
import { RotateCcw, Search } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Input } from "@lingzhu/ui/input";
import { KEYBIND_ACTIONS, effectiveKeybinds, keybindFromEvent } from "../../lib/keybinds";
import { formatKeybind } from "../../lib/slash";
import { t } from "@lingzhu/ui/i18n";
import type { PreferencesScope } from "./types";

const GROUP_KEYS: Record<string, string> = {
  General: "shortcutGroupGeneral",
  Session: "shortcutGroupSession",
  Navigation: "shortcutGroupNavigation",
  "Model and agent": "shortcutGroupModel",
  Terminal: "shortcutGroupTerminal",
  Prompt: "shortcutGroupPrompt",
};

const ACTION_KEYS: Record<string, string> = {
  "tab.new": "shortcutNewSession",
  "tab.reopen": "shortcutReopenTab",
  "tab.close": "shortcutCloseTab",
  "tab.next": "shortcutNextTab",
  "tab.previous": "shortcutPreviousTab",
  "panel.review": "shortcutToggleReview",
  "sidebar.toggle": "shortcutToggleSidebar",
  "home.toggle": "home",
  "terminal.toggle": "shortcutToggleTerminal",
  palette: "commandPalette",
  "settings.open": "settings",
  "input.focus": "shortcutFocusInput",
  "permissions.auto": "shortcutAutoAccept",
  "message.previous": "shortcutPreviousMessage",
  "message.next": "shortcutNextMessage",
  "model.choose": "shortcutChooseModel",
  "agent.next": "shortcutNextAgent",
  "prompt.attach": "addImagesFiles",
};

interface Props {
  preferences: PreferencesScope;
}

/** Global keybinds grouped like the reference, with search, capture and reset. */
export function ShortcutsSection({ preferences }: Props) {
  const prefs = preferences.preferences;
  const [recording, setRecording] = useState<string>();
  const [query, setQuery] = useState("");

  const effective = effectiveKeybinds(prefs.keybinds);
  const titleFor = (action: (typeof KEYBIND_ACTIONS)[number]) => {
    const key = ACTION_KEYS[action.id];
    return key ? t(key as never) : action.label;
  };

  const saveBinding = (action: string, binding: string | undefined) => {
    const keybinds = { ...prefs.keybinds };
    if (binding === undefined) {
      delete keybinds[action];
    } else {
      for (const [other, value] of Object.entries(keybinds)) {
        if (other !== action && value === binding) delete keybinds[other];
      }
      keybinds[action] = binding;
    }
    preferences.save({ ...prefs, keybinds });
  };

  useEffect(() => {
    if (!recording) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecording(undefined);
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        saveBinding(recording, undefined);
        setRecording(undefined);
        return;
      }
      const binding = keybindFromEvent(event);
      if (!binding) return;
      saveBinding(recording, binding);
      setRecording(undefined);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", cancel, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", cancel, true);
    };

    function cancel() {
      setRecording(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, prefs.keybinds]);

  const groups: { title: string; actions: typeof KEYBIND_ACTIONS }[] = [];
  {
    const needle = query.trim().toLowerCase();
    for (const action of KEYBIND_ACTIONS) {
      const binding = formatKeybind(effective[action.id]) ?? "";
      if (needle && !`${titleFor(action)} ${binding}`.toLowerCase().includes(needle)) continue;
      let group = groups.find((item) => item.title === action.group);
      if (!group) {
        group = { title: action.group, actions: [] };
        groups.push(group);
      }
      group.actions.push(action);
    }
  }

  const overrides = Object.keys(prefs.keybinds).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-text-faint" />
          <Input
            value={query}
            aria-label={t("searchShortcuts")}
            placeholder={t("searchShortcuts")}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            className="h-9 rounded-[6px] bg-bg-layer-02/60 ps-10 pe-3 hover:bg-bg-layer-02 focus-visible:bg-bg-layer-02"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={overrides === 0}
          onClick={() => preferences.save({ ...prefs, keybinds: {} })}
          className="shrink-0 gap-1.5 text-text-muted hover:text-text-base"
        >
          <RotateCcw className="size-4" />
          {t("resetAction")}
        </Button>
      </div>

      {groups.map((group) => (
        <section key={group.title} className="flex flex-col gap-4">
          <h2 className="text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">{t(GROUP_KEYS[group.title] as never) || group.title}</h2>
          <div className="overflow-hidden rounded-lg bg-bg-layer-01 px-5 shadow-[inset_0_0_0_0.5px_var(--color-border-muted)]">
            {group.actions.map((action) => {
              const overridden = prefs.keybinds[action.id] !== undefined;
              const active = recording === action.id;
              const binding = formatKeybind(effective[action.id]);
              return (
                <div
                  key={action.id}
                  className="flex min-h-12 items-center justify-between gap-4 border-b-[0.5px] border-border-base py-3 last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">
                    {titleFor(action)}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    {active && binding && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          saveBinding(action.id, undefined);
                          setRecording(undefined);
                        }}
                        className="text-state-fg-danger hover:text-state-fg-danger"
                      >
                        {t("unbind")}
                      </Button>
                    )}
                    {!active && overridden && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t("resetBinding", { name: titleFor(action) })}
                        onClick={() => saveBinding(action.id, undefined)}
                        className="text-text-faint hover:text-text-base"
                      >
                        <RotateCcw className="size-3.5" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant={binding ? "ghost" : "ghost"}
                      size="sm"
                      aria-pressed={active}
                      aria-label={t("changeBinding", { name: titleFor(action) })}
                      onClick={() => setRecording(active ? undefined : action.id)}
                      className={`min-w-20 justify-center font-mono text-[12px] ${
                        active ? "bg-bg-layer-03 text-text-base outline-2 outline-border-focus" : "text-text-muted"
                      }`}
                    >
                      {active ? t("pressKeys") : binding ?? t("unassigned")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {groups.length === 0 && (
        <p className="py-12 text-center text-body font-[440] leading-4 text-text-muted">
          {t("noShortcutsMatch", { query: query.trim() })}
        </p>
      )}
    </div>
  );
}
