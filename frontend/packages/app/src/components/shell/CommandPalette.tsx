import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { Search } from "@lingzhu/ui/icons";
import { FileTypeIcon } from "@lingzhu/ui/file-icons";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../../lib/api";
import {
  clampPaletteIndex,
  filterPalette,
  groupPalette,
  movePaletteSelection,
  paletteInitial,
  splitPalettePath,
  type PaletteCommand,
} from "../../lib/palette";
import { formatKeybind } from "../../lib/slash";
import { Keybind } from "@lingzhu/ui/keybind";
import { ActivityRing } from "@lingzhu/ui/ActivityRing";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  commands: PaletteCommand[];
  onOpenFile?: (path: string) => void;
  onOpenChange: (open: boolean) => void;
}

/**
 * The compact command palette: a 480px dialog anchored below the window top,
 * with a hairline search field, sticky section headers and 28px rows.
 */
export function CommandPalette(props: Props) {
  const tr = useT();
  const [query, setQuery] = createSignal("");
  const [selected, setSelected] = createSignal(0);
  const [fileCommands, setFileCommands] = createSignal<PaletteCommand[]>([]);
  let scrollElement: HTMLDivElement | undefined;
  const filtered = createMemo(() =>
    filterPalette(
      query().trim()
        ? [...props.commands, ...fileCommands()]
        : props.commands.filter((command) => command.featured || command.kind === "session"),
      query(),
    ),
  );
  const groups = createMemo(() => groupPalette(filtered()));
  const ordered = createMemo(() => groups().flatMap((section) => section.items));
  const activeIndex = createMemo(() => clampPaletteIndex(selected(), ordered().length));
  // Each rendered row knows its flat position, so hover and keyboard share it.
  const sections = createMemo(() => {
    let index = 0;
    return groups().map((section) => ({
      group: section.group,
      items: section.items.map((command) => ({ command, index: index++ })),
    }));
  });

  createEffect(() => {
    if (!props.open) return;
    setQuery("");
    setSelected(0);
    setFileCommands([]);
  });

  createEffect(() => {
    query();
    setSelected(0);
    scrollElement?.scrollTo({ top: 0 });
  });

  const onScroll = () => {
    const viewport = scrollElement;
    if (!viewport) return;
    const strength = (hidden: number) => String(Math.min(1, Math.max(0, hidden / 15)));
    viewport.style.setProperty("--command-palette-fade-top", strength(viewport.scrollTop));
    viewport.style.setProperty(
      "--command-palette-fade-bottom",
      strength(viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop),
    );
  };

  createEffect(() => {
    const open = props.open;
    const workspace = props.workspace;
    const term = query().trim();
    if (!open || !workspace || !term) {
      setFileCommands([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .searchFiles(workspace, term, 20)
        .then((result) => {
          if (cancelled) return;
          setFileCommands(
            result.files.map((hit) => ({
              id: `file:${hit.path}`,
              title: hit.path,
              group: "Files",
              kind: "file",
              path: hit.path,
              keywords: ["file", "path"],
              run: () => props.onOpenFile?.(hit.path),
            })),
          );
        })
        .catch(() => {
          if (!cancelled) setFileCommands([]);
        });
    }, 150);
    onCleanup(() => {
      cancelled = true;
      window.clearTimeout(timer);
    });
  });

  const run = (command?: PaletteCommand) => {
    if (!command) return;
    props.onOpenChange(false);
    command.run();
  };

  const move = (delta: number) => {
    if (ordered().length === 0) return;
    setSelected(movePaletteSelection(activeIndex(), delta, ordered().length));
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        size="model"
        style={{
          "margin-top": "max(48px, calc((100vh - 480px) / 2))",
          "max-height": "min(calc(100vh - 96px), 480px)",
          "max-width": "calc(100vw - 24px)",
        }}
        class="command-palette-dialog flex flex-col overflow-hidden border-0 bg-bg-base p-0"
        hideClose
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById("command-palette-input")?.focus();
        }}
      >
        <DialogTitle class="sr-only">{tr("commandPaletteTitle")}</DialogTitle>
        <DialogDescription class="sr-only">{tr("dialogPaletteHint")}</DialogDescription>

        <div class="command-palette-search">
          <div class="command-palette-field">
            <Search class="command-palette-icon size-4" />
            <input
              id="command-palette-input"
              autofocus
              value={query()}
              aria-label={tr("commandPaletteCommandSearch")}
              aria-controls="command-palette-list"
              aria-activedescendant={activeIndex() >= 0 ? `command-palette-option-${activeIndex()}` : undefined}
              placeholder={tr("commandPaletteSearchFilesCommandsAndSessions")}
              onInput={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  move(1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  move(-1);
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  run(ordered()[activeIndex()]);
                }
              }}
              class="command-palette-input"
            />
          </div>
        </div>

        <div
          ref={(element) => {
            scrollElement = element;
          }}
          onScroll={onScroll}
          class="command-palette-scroll"
        >
          <div class="command-palette-fade" aria-hidden="true" />
          <div
            id="command-palette-list"
            role="listbox"
            aria-label={tr("commandPaletteCommands")}
            class="command-palette-results"
          >
            <Show
              when={ordered().length > 0}
              fallback={<p class="command-palette-state">{tr("noResultsFound")}</p>}
            >
              <For each={sections()}>
                {(section) => (
                  <div role="group" aria-label={section.group} class="command-palette-group">
                    <div class="command-palette-group-title">{section.group}</div>
                    <For each={section.items}>
                      {(item) => {
                        const active = () => item.index === activeIndex();
                        return (
                          <button
                            id={`command-palette-option-${item.index}`}
                            type="button"
                            role="option"
                            aria-selected={active()}
                            data-active={active() ? "" : undefined}
                            onMouseMove={() => setSelected(item.index)}
                            onClick={() => run(item.command)}
                            class="command-palette-row"
                          >
                            <Show
                              when={item.command.kind === "session"}
                              fallback={
                                <Show
                                  when={item.command.kind === "file"}
                                  fallback={
                                    <span class="command-palette-row-main">
                                      <span class="command-palette-row-text">
                                        <span class="command-palette-title">
                                          <Highlight text={item.command.title} query={query()} />
                                        </span>
                                        <Show when={item.command.hint}>
                                          {(hint) => (
                                            <span class="command-palette-description">
                                              <Highlight text={hint()} query={query()} />
                                            </span>
                                          )}
                                        </Show>
                                      </span>
                                      <Show when={formatKeybind(item.command.keybind)}>
                                        {(keybind) => (
                                          <Keybind keys={(formatKeybind(item.command.keybind) ?? "").split("+")} variant="neutral" />
                                        )}
                                      </Show>
                                    </span>
                                  }
                                >
                                  <span class="command-palette-row-main">
                                    <FileTypeIcon path={item.command.path ?? ""} class="command-palette-icon size-4" />
                                    <span class="command-palette-file-path" dir="ltr">
                                      <span class="command-palette-file-dir">
                                        <Highlight
                                          text={splitPalettePath(item.command.path ?? item.command.title).directory}
                                          query={query()}
                                        />
                                      </span>
                                      <span class="command-palette-file-name">
                                        <Highlight
                                          text={splitPalettePath(item.command.path ?? item.command.title).filename}
                                          query={query()}
                                        />
                                      </span>
                                    </span>
                                  </span>
                                </Show>
                              }
                            >
                              <span class="command-palette-row-main">
                                <span
                                  class="command-palette-avatar"
                                  data-variant={item.command.variant}
                                  data-unread={item.command.status === "unread" ? "" : undefined}
                                >
                                  <span class="command-palette-avatar-surface">
                                    {paletteInitial(item.command.project || "?")}
                                  </span>
                                  <Show when={item.command.status === "unread"}>
                                    <span class="command-palette-unread-dot" />
                                  </Show>
                                </span>
                                <span class="command-palette-row-text">
                                  <span class="command-palette-title">
                                    <Highlight text={item.command.title} query={query()} />
                                  </span>
                                  <Show when={item.command.description}>
                                    {(description) => (
                                      <span class="command-palette-description">
                                        <Highlight text={description()} query={query()} />
                                      </span>
                                    )}
                                  </Show>
                                </span>
                              </span>
                              <Show
                                when={item.command.status === "running"}
                                fallback={
                                  <Show when={item.command.meta}>
                                    {(meta) => <span class="command-palette-meta">{meta()}</span>}
                                  </Show>
                                }
                              >
                                <span class="command-palette-meta">
                                  <ActivityRing />
                                </span>
                              </Show>
                            </Show>
                          </button>
                        );
                      }}
                    </For>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Marks the first query match in a row, as the desktop list does. */
function Highlight(props: { text: string; query: string }) {
  const at = createMemo(() => {
    const needle = props.query.trim().toLowerCase();
    const haystack = props.text.toLowerCase();
    return needle && haystack.length === props.text.length ? haystack.indexOf(needle) : -1;
  });
  return (
    <Show when={at() >= 0} fallback={props.text}>
      {props.text.slice(0, at())}
      <mark class="command-palette-match">
        {props.text.slice(at(), at() + props.query.trim().length)}
      </mark>
      {props.text.slice(at() + props.query.trim().length)}
    </Show>
  );
}
