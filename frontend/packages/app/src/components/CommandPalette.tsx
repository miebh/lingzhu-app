import { useEffect, useRef, useState } from "react";
import { Search } from "@lingzhu/ui/icons";
import { FileTypeIcon } from "@lingzhu/ui/file-icons";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../lib/api";
import { clampPaletteIndex, filterPalette, groupPalette, movePaletteSelection, paletteInitial, splitPalettePath, type PaletteCommand } from "../lib/palette";
import { formatKeybind } from "../lib/slash";
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
export function CommandPalette({ open, workspace, commands, onOpenFile, onOpenChange }: Props) {
  const tr = useT();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [fileCommands, setFileCommands] = useState<PaletteCommand[]>([]);
  const openFileRef = useRef(onOpenFile);
  const scrollRef = useRef<HTMLDivElement>(null);
  openFileRef.current = onOpenFile;
  const filtered = filterPalette(
    query.trim()
      ? [...commands, ...fileCommands]
      : commands.filter((command) => command.featured || command.kind === "session"),
    query,
  );
  const groups = groupPalette(filtered);
  const ordered = groups.flatMap((section) => section.items);
  const activeIndex = clampPaletteIndex(selected, ordered.length);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
    setFileCommands([]);
  }, [open]);

  useEffect(() => {
    setSelected(0);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [query]);

  const onScroll = () => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const strength = (hidden: number) => String(Math.min(1, Math.max(0, hidden / 15)));
    viewport.style.setProperty("--command-palette-fade-top", strength(viewport.scrollTop));
    viewport.style.setProperty(
      "--command-palette-fade-bottom",
      strength(viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop),
    );
  };

  useEffect(() => {
    if (!open || !workspace) {
      setFileCommands([]);
      return;
    }
    const term = query.trim();
    if (!term) {
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
              run: () => openFileRef.current?.(hit.path),
            })),
          );
        })
        .catch(() => {
          if (!cancelled) setFileCommands([]);
        });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, workspace]);

  const run = (command?: PaletteCommand) => {
    if (!command) return;
    onOpenChange(false);
    command.run();
  };

  const move = (delta: number) => {
    if (ordered.length === 0) return;
    setSelected(movePaletteSelection(activeIndex, delta, ordered.length));
  };

  let rowIndex = -1;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="model"
        style={{
          marginTop: "max(48px, calc((100vh - 480px) / 2))",
          maxHeight: "min(calc(100vh - 96px), 480px)",
          maxWidth: "calc(100vw - 24px)",
        }}
        className="command-palette-dialog flex flex-col overflow-hidden border-0 bg-bg-base p-0"
        hideClose
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById("command-palette-input")?.focus();
        }}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          {tr("dialogPaletteHint")}
        </DialogDescription>

        <div className="command-palette-search">
          <div className="command-palette-field">
            <Search className="command-palette-icon size-4" />
            <input
              id="command-palette-input"
              autoFocus
              value={query}
              aria-label={tr("commandPaletteCommandSearch")}
              aria-controls="command-palette-list"
              aria-activedescendant={activeIndex >= 0 ? `command-palette-option-${activeIndex}` : undefined}
              placeholder={tr("commandPaletteSearchFilesCommandsAndSessions")}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  move(1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  move(-1);
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  run(ordered[activeIndex]);
                }
              }}
              className="command-palette-input"
            />
          </div>
        </div>

        <div ref={scrollRef} onScroll={onScroll} className="command-palette-scroll">
          <div className="command-palette-fade" aria-hidden="true" />
          <div id="command-palette-list" role="listbox" aria-label={tr("commandPaletteCommands")} className="command-palette-results">
          {ordered.length === 0 ? (
            <p className="command-palette-state">No results found</p>
          ) : (
            groups.map((section) => (
              <div key={section.group} role="group" aria-label={section.group} className="command-palette-group">
                <div className="command-palette-group-title">{section.group}</div>
                {section.items.map((command) => {
                  rowIndex += 1;
                  const index = rowIndex;
                  const active = index === activeIndex;
                  return (
                    <button
                      key={command.id}
                      id={`command-palette-option-${index}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      data-active={active ? "" : undefined}
                      onMouseMove={() => setSelected(index)}
                      onClick={() => run(command)}
                      className="command-palette-row"
                    >
                      {command.kind === "session" ? (
                        <>
                          <span className="command-palette-row-main">
                            <span
                              className="command-palette-avatar"
                              data-variant={command.variant}
                              data-unread={command.status === "unread" ? "" : undefined}
                            >
                              <span className="command-palette-avatar-surface">
                                {paletteInitial(command.project || "?")}
                              </span>
                              {command.status === "unread" && <span className="command-palette-unread-dot" />}
                            </span>
                            <span className="command-palette-row-text">
                              <span className="command-palette-title">
                                <Highlight text={command.title} query={query} />
                              </span>
                              {command.description && (
                                <span className="command-palette-description">
                                  <Highlight text={command.description} query={query} />
                                </span>
                              )}
                            </span>
                          </span>
                          {command.status === "running" ? (
                            <span className="command-palette-meta">
                              <ActivityRing />
                            </span>
                          ) : (
                            command.meta && <span className="command-palette-meta">{command.meta}</span>
                          )}
                        </>
                      ) : command.kind === "file" ? (
                        <span className="command-palette-row-main">
                          <FileTypeIcon path={command.path ?? ""} className="command-palette-icon size-4" />
                          <span className="command-palette-file-path" dir="ltr">
                            <span className="command-palette-file-dir">
                              <Highlight text={splitPalettePath(command.path ?? command.title).directory} query={query} />
                            </span>
                            <span className="command-palette-file-name">
                              <Highlight text={splitPalettePath(command.path ?? command.title).filename} query={query} />
                            </span>
                          </span>
                        </span>
                      ) : (
                        <span className="command-palette-row-main">
                          <span className="command-palette-row-text">
                            <span className="command-palette-title">
                              <Highlight text={command.title} query={query} />
                            </span>
                            {command.hint && (
                              <span className="command-palette-description">
                                <Highlight text={command.hint} query={query} />
                              </span>
                            )}
                          </span>
                          {formatKeybind(command.keybind) && (
                            <Keybind keys={(formatKeybind(command.keybind) ?? "").split("+")} variant="neutral" />
                          )}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Marks the first query match in a row, as the desktop list does. */
function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLowerCase();
  const haystack = text.toLowerCase();
  const at = needle && haystack.length === text.length ? haystack.indexOf(needle) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="command-palette-match">{text.slice(at, at + needle.length)}</mark>
      {text.slice(at + needle.length)}
    </>
  );
}
