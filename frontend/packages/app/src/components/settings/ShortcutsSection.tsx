import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
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
export function ShortcutsSection(props: Props) {
  const prefs = () => props.preferences.preferences;
  const [recording, setRecording] = createSignal<string>();
  const [query, setQuery] = createSignal("");

  const effective = createMemo(() => effectiveKeybinds(prefs().keybinds));
  const titleFor = (action: (typeof KEYBIND_ACTIONS)[number]) => {
    const key = ACTION_KEYS[action.id];
    return key ? t(key as never) : action.label;
  };

  const saveBinding = (action: string, binding: string | undefined) => {
    const keybinds = { ...prefs().keybinds };
    if (binding === undefined) {
      delete keybinds[action];
    } else {
      for (const [other, value] of Object.entries(keybinds)) {
        if (other !== action && value === binding) delete keybinds[other];
      }
      keybinds[action] = binding;
    }
    props.preferences.save({ ...prefs(), keybinds });
  };

  createEffect(() => {
    const active = recording();
    if (!active) return;
    const cancel = () => {
      setRecording(undefined);
    };
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecording(undefined);
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        saveBinding(active, undefined);
        setRecording(undefined);
        return;
      }
      const binding = keybindFromEvent(event);
      if (!binding) return;
      saveBinding(active, binding);
      setRecording(undefined);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", cancel, true);
    onCleanup(() => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", cancel, true);
    });
  });

  const groups = createMemo(() => {
    const result: { title: string; actions: typeof KEYBIND_ACTIONS }[] = [];
    const needle = query().trim().toLowerCase();
    for (const action of KEYBIND_ACTIONS) {
      const binding = formatKeybind(effective()[action.id]) ?? "";
      if (needle && !`${titleFor(action)} ${binding}`.toLowerCase().includes(needle)) continue;
      let group = result.find((item) => item.title === action.group);
      if (!group) {
        group = { title: action.group, actions: [] };
        result.push(group);
      }
      group.actions.push(action);
    }
    return result;
  });

  const overrides = () => Object.keys(prefs().keybinds).length;

  return (
    <div class="flex flex-col gap-6">
      <div class="flex items-center gap-2">
        <div class="relative min-w-0 flex-1">
          <Search class="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-text-faint" />
          <Input
            value={query()}
            aria-label={t("searchShortcuts")}
            placeholder={t("searchShortcuts")}
            spellcheck={false}
            autocomplete="off"
            onInput={(event) => setQuery(event.currentTarget.value)}
            class="h-9 rounded-[6px] bg-bg-layer-02/60 ps-10 pe-3 hover:bg-bg-layer-02 focus-visible:bg-bg-layer-02"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={overrides() === 0}
          onClick={() => props.preferences.save({ ...prefs(), keybinds: {} })}
          class="shrink-0 gap-1.5 text-text-muted hover:text-text-base"
        >
          <RotateCcw class="size-4" />
          {t("resetAction")}
        </Button>
      </div>

      <For each={groups()}>
        {(group) => (
          <section class="flex flex-col gap-4">
            <h2 class="text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">
              {t(GROUP_KEYS[group.title] as never) || group.title}
            </h2>
            <div class="overflow-hidden rounded-lg bg-bg-layer-01 px-5 shadow-[inset_0_0_0_0.5px_var(--color-border-muted)]">
              <For each={group.actions}>
                {(action) => {
                  const overridden = () => prefs().keybinds[action.id] !== undefined;
                  const active = () => recording() === action.id;
                  const binding = () => formatKeybind(effective()[action.id]);
                  return (
                    <div class="flex min-h-12 items-center justify-between gap-4 border-b-[0.5px] border-border-base py-3 last:border-0">
                      <span class="min-w-0 flex-1 truncate text-body font-[530] leading-4 tracking-[-0.04px] text-text-base">
                        {titleFor(action)}
                      </span>
                      <div class="flex shrink-0 items-center gap-1">
                        <Show when={active() && binding()}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              saveBinding(action.id, undefined);
                              setRecording(undefined);
                            }}
                            class="text-state-fg-danger hover:text-state-fg-danger"
                          >
                            {t("unbind")}
                          </Button>
                        </Show>
                        <Show when={!active() && overridden()}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={t("resetBinding", { name: titleFor(action) })}
                            onClick={() => saveBinding(action.id, undefined)}
                            class="text-text-faint hover:text-text-base"
                          >
                            <RotateCcw class="size-3.5" />
                          </Button>
                        </Show>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-pressed={active()}
                          aria-label={t("changeBinding", { name: titleFor(action) })}
                          onClick={() => setRecording(active() ? undefined : action.id)}
                          class={`min-w-20 justify-center font-mono text-[12px] ${
                            active()
                              ? "bg-bg-layer-03 text-text-base outline-2 outline-border-focus"
                              : "text-text-muted"
                          }`}
                        >
                          {active() ? t("pressKeys") : binding() ?? t("unassigned")}
                        </Button>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </section>
        )}
      </For>

      <Show when={groups().length === 0}>
        <p class="py-12 text-center text-body font-[440] leading-4 text-text-muted">
          {t("noShortcutsMatch", { query: query().trim() })}
        </p>
      </Show>
    </div>
  );
}
