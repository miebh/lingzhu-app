import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { update } from "@lingzhu/ui/solid";
import { Eye, EyeOff, FilePlus, FolderClosed, FolderOpen, FolderPlus, Pencil, RefreshCw, Save, Search, Trash2, Wand2 } from "@lingzhu/ui/icons";
import { FileTypeIcon } from "@lingzhu/ui/file-icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { ConfirmDialog } from "./Dialogs";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import type { FileContent, FileGrepHit, FileSearchHit, FsEntry } from "@lingzhu/ui/types";
import { formatBytes } from "@lingzhu/ui/format";
import { ErrorBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  name?: string;
  initialPath?: string;
  onOpenChange: (open: boolean) => void;
}

function parentOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function nameOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? path : path.slice(index + 1);
}

/**
 * Workspace file tree with a read-only text preview. Directories load lazily;
 * hidden entries are opt-in; paths are confined to the workspace by the core.
 */
export function FileTreeDialog(props: Props) {
  const tr = useT();
  const [children, setChildren] = createSignal<Record<string, FsEntry[]>>({});
  const [expanded, setExpanded] = createSignal<Record<string, boolean>>({});
  const [truncated, setTruncated] = createSignal<Record<string, boolean>>({});
  const [hidden, setHidden] = createSignal(false);
  const [selected, setSelected] = createSignal<string>();
  const [preview, setPreview] = createSignal<FileContent>();
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [formatting, setFormatting] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  const [renaming, setRenaming] = createSignal<{ path: string; value: string }>();
  const [creating, setCreating] = createSignal<{ kind: "file" | "dir"; value: string; dir: string }>();
  const [deleteTarget, setDeleteTarget] = createSignal<FsEntry>();
  let renameCancelled = false;
  let createCancelled = false;
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [query, setQuery] = createSignal("");
  const [searchMode, setSearchMode] = createSignal<"name" | "content">("name");
  const [hits, setHits] = createSignal<FileSearchHit[]>([]);
  const [hitsTruncated, setHitsTruncated] = createSignal(false);
  const [grepHits, setGrepHits] = createSignal<FileGrepHit[]>([]);
  const [grepTruncated, setGrepTruncated] = createSignal(false);
  const [searching, setSearching] = createSignal(false);

  const loadDir = async (path: string, showHidden: boolean) => {
    const list = await api.files(props.workspace ?? "", path, showHidden);
    update(setChildren, children, (current) => ({ ...current, [path]: list.entries }));
    update(setTruncated, truncated, (current) => ({ ...current, [path]: list.truncated }));
  };

  createEffect(() => {
    const workspace = props.workspace;
    const isHidden = hidden();
    const initialPath = props.initialPath;
    if (!props.open || !workspace) {
      setChildren({});
      setExpanded({});
      setTruncated({});
      setSelected(undefined);
      setPreview(undefined);
      setEditing(false);
      setDraft("");
      setRenaming(undefined);
      setCreating(undefined);
      setDeleteTarget(undefined);
      setError("");
      setNotice("");
      setQuery("");
      setSearchMode("name");
      setHits([]);
      setHitsTruncated(false);
      setGrepHits([]);
      setGrepTruncated(false);
      setSearching(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError("");
    setChildren({});
    setExpanded({});
    setTruncated({});
    setSelected(undefined);
    setPreview(undefined);
    setEditing(false);
    setDraft("");
    setRenaming(undefined);
    setCreating(undefined);
    api
      .files(workspace, "", isHidden)
      .then((list) => {
        if (!alive) return;
        setChildren({ "": list.entries });
        setTruncated({ "": list.truncated });
        if (initialPath) void openFile(initialPath);
      })
      .catch((err) => {
        if (alive) setError(messageOf(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    onCleanup(() => {
      alive = false;
    });
  });

  createEffect(() => {
    const workspace = props.workspace;
    const term = query().trim();
    const mode = searchMode();
    if (!props.open || !workspace) return;
    if (!term) {
      setHits([]);
      setHitsTruncated(false);
      setGrepHits([]);
      setGrepTruncated(false);
      setSearching(false);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      setSearching(true);
      const request =
        mode === "name"
          ? api.searchFiles(workspace, term, 50).then((result) => {
              if (!alive) return;
              setHits(result.files);
              setHitsTruncated(result.truncated);
              setGrepHits([]);
              setGrepTruncated(false);
            })
          : api.grepFiles(workspace, term, 50).then((result) => {
              if (!alive) return;
              setGrepHits(result.hits);
              setGrepTruncated(result.truncated);
              setHits([]);
              setHitsTruncated(false);
            });
      request
        .catch((err) => {
          if (alive) setError(messageOf(err));
        })
        .finally(() => {
          if (alive) setSearching(false);
        });
    }, 250);
    onCleanup(() => {
      alive = false;
      window.clearTimeout(timer);
    });
  });

  const toggleDir = async (path: string) => {
    if (expanded()[path]) {
      update(setExpanded, expanded, (current) => ({ ...current, [path]: false }));
      return;
    }
    update(setExpanded, expanded, (current) => ({ ...current, [path]: true }));
    if (children()[path]) return;
    try {
      await loadDir(path, hidden());
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const openFile = async (path: string) => {
    const workspace = props.workspace;
    if (!workspace) return;
    setSelected(path);
    setPreview(undefined);
    setEditing(false);
    setDraft("");
    setNotice("");
    try {
      setPreview(await api.fileContent(workspace, path));
      setError("");
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const startEdit = () => {
    const file = preview();
    if (!file) return;
    setDraft(file.content);
    setEditing(true);
    setNotice("");
  };

  const formatFile = async () => {
    const workspace = props.workspace;
    const file = preview();
    if (!workspace || !file) return;
    setFormatting(true);
    setNotice("");
    try {
      const result = await api.formatFile(workspace, file.path);
      if (!result.name) {
        setNotice("No formatter matched this file.");
      } else if (result.changed) {
        setNotice(`${result.name} formatted the file.`);
        setPreview(await api.fileContent(workspace, file.path));
        setEditing(false);
        await loadDir(parentOf(file.path), hidden());
      } else {
        setNotice(`${result.name}: already formatted.`);
      }
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setFormatting(false);
    }
  };

  const save = async () => {
    const workspace = props.workspace;
    const file = preview();
    if (!workspace || !file) return;
    setSaving(true);
    try {
      await api.writeFile(workspace, file.path, draft());
      const next = await api.fileContent(workspace, file.path);
      setPreview(next);
      setEditing(false);
      setError("");
      const parent = file.path.includes("/")
        ? file.path.slice(0, file.path.lastIndexOf("/"))
        : "";
      await loadDir(parent, hidden());
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  const refresh = async () => {
    const workspace = props.workspace;
    if (!workspace) return;
    setLoading(true);
    setError("");
    setEditing(false);
    try {
      const current = expanded();
      const paths = ["", ...Object.keys(current).filter((path) => current[path])];
      for (const path of paths) {
        await loadDir(path, hidden());
      }
      const target = selected();
      if (target) setPreview(await api.fileContent(workspace, target));
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  const startCreate = (kind: "file" | "dir") => {
    createCancelled = false;
    const target = selected();
    setCreating({ kind, value: "", dir: target ? parentOf(target) : "" });
    setError("");
  };

  const commitCreate = async () => {
    const workspace = props.workspace;
    const current = creating();
    if (!workspace || !current) return;
    if (createCancelled) {
      createCancelled = false;
      setCreating(undefined);
      return;
    }
    const target = current;
    setCreating(undefined);
    const name = target.value.trim();
    if (!name) return;
    if (name.includes("/") || name.includes("\\") || name === "." || name === "..") {
      setError("Name cannot contain path separators");
      return;
    }
    const path = target.dir ? `${target.dir}/${name}` : name;
    try {
      await api.createEntry(workspace, path, target.kind, "");
      if (target.dir) {
        update(setExpanded, expanded, (current) => ({ ...current, [target.dir]: true }));
      }
      await loadDir(target.dir, hidden());
      if (target.kind === "file") {
        setSelected(path);
        setEditing(false);
        setPreview(await api.fileContent(workspace, path));
      }
      setError("");
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const commitRename = async () => {
    const workspace = props.workspace;
    const current = renaming();
    if (!workspace || !current) return;
    if (renameCancelled) {
      renameCancelled = false;
      setRenaming(undefined);
      return;
    }
    const target = current;
    setRenaming(undefined);
    const name = target.value.trim();
    if (!name || name === nameOf(target.path)) return;
    if (name.includes("/") || name.includes("\\") || name === "." || name === "..") {
      setError("Name cannot contain path separators");
      return;
    }
    const parent = parentOf(target.path);
    const next = parent ? `${parent}/${name}` : name;
    try {
      await api.moveFile(workspace, target.path, next);
      if (selected() === target.path) {
        setSelected(next);
        setPreview(await api.fileContent(workspace, next));
        setEditing(false);
      }
      await loadDir(parent, hidden());
      setError("");
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const removeEntry = async () => {
    const target = deleteTarget();
    const workspace = props.workspace;
    if (!target || !workspace) return;
    setDeleteTarget(undefined);
    try {
      await api.deleteFile(workspace, target.path);
      if (selected() === target.path) {
        setSelected(undefined);
        setPreview(undefined);
        setEditing(false);
      }
      await loadDir(parentOf(target.path), hidden());
      setError("");
    } catch (err) {
      setError(messageOf(err));
    }
  };

  function Level(level: { path: string; depth: number }) {
    const entries = () => children()[level.path] ?? [];
    return (
      <Show
        when={entries().length > 0}
        fallback={
          <p
            class="px-2 py-1 text-body leading-4 font-[440] text-text-faint"
            style={{ "padding-left": `${10 + level.depth * 14}px` }}
          >
            {children()[level.path] ? tr("empty") : tr("loading")}
          </p>
        }
      >
        <For each={entries()}>
          {(entry) => {
            const directory = entry.type === "dir";
            const isOpen = () => Boolean(expanded()[entry.path]);
            const active = () => selected() === entry.path;
            return (
              <div>
                <div
                  class={`interactive group/file flex h-7 items-center gap-1.5 rounded-md pe-2 text-body ${
                    active() ? "bg-bg-layer-02 text-text-base" : "text-text-muted hover:text-text-base"
                  }`}
                  style={{ "padding-left": `${8 + level.depth * 14}px` }}
                >
                  <Show
                    when={renaming()?.path === entry.path}
                    fallback={
                      <>
                        <button
                          type="button"
                          onClick={() => (directory ? void toggleDir(entry.path) : void openFile(entry.path))}
                          class="flex h-full min-w-0 flex-1 items-center gap-1.5 text-left"
                          title={entry.path}
                        >
                          {directory ? (
                            isOpen() ? (
                              <FolderOpen class="size-4 shrink-0 text-text-faint" />
                            ) : (
                              <FolderClosed class="size-4 shrink-0 text-text-faint" />
                            )
                          ) : (
                            <FileTypeIcon path={entry.path} class="size-4" />
                          )}
                          <span class="min-w-0 flex-1 truncate font-[530]">{entry.name}</span>
                          <Show when={!directory}>
                            <span class="shrink-0 text-caption tabular-nums text-text-faint">
                              {formatBytes(entry.size)}
                            </span>
                          </Show>
                        </button>
                        <span class="flex shrink-0 items-center opacity-0 transition-opacity group-focus-within/file:opacity-100 group-hover/file:opacity-100">
                          <button
                            type="button"
                            aria-label={`Rename ${entry.name}`}
                            onClick={() => {
                              renameCancelled = false;
                              setRenaming({ path: entry.path, value: entry.name });
                            }}
                            class="interactive grid size-5 place-items-center rounded-xs text-text-faint hover:text-text-base"
                          >
                            <Pencil class="size-3" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${entry.name}`}
                            onClick={() => setDeleteTarget(entry)}
                            class="interactive grid size-5 place-items-center rounded-xs text-text-faint hover:text-state-fg-danger"
                          >
                            <Trash2 class="size-3" />
                          </button>
                        </span>
                      </>
                    }
                  >
                    <input
                      autofocus
                      value={renaming()!.value}
                      aria-label={`Rename ${entry.name}`}
                      onInput={(event) =>
                        setRenaming({ path: entry.path, value: event.currentTarget.value })
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          renameCancelled = true;
                          event.currentTarget.blur();
                        }
                      }}
                      onBlur={() => void commitRename()}
                      class="my-0.5 min-w-0 flex-1 rounded-xs border border-border-base bg-bg-base px-1 py-0.5 font-mono text-meta text-text-base outline-none select-text"
                    />
                  </Show>
                </div>
                <Show when={directory && isOpen()}>
                  <Level path={entry.path} depth={level.depth + 1} />
                </Show>
                <Show when={directory && isOpen() && truncated()[entry.path]}>
                  <p
                    class="px-2 py-1 text-caption text-text-faint"
                    style={{ "padding-left": `${10 + (level.depth + 1) * 14}px` }}
                  >
                    {tr("dialogFirst1000Entries")}
                  </p>
                </Show>
              </div>
            );
          }}
        </For>
      </Show>
    );
  }

  return (
    <>
      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
        <DialogContent size="wide" height="body" class="flex flex-col">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <DialogTitle>{tr("files")}</DialogTitle>
              <DialogDescription class="truncate">{props.name || props.workspace}</DialogDescription>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <label class="flex h-control-sm items-center gap-1 rounded-md border border-border-base bg-bg-base px-2">
                <Search class="size-3.5 shrink-0 text-text-faint" />
                <input
                  value={query()}
                  aria-label={tr("fileTreeSearchWorkspaceFiles")}
                  placeholder={searchMode() === "name" ? tr("searchFiles") : tr("searchContents")}
                  onInput={(event) => setQuery(event.currentTarget.value)}
                  class="w-36 bg-transparent text-meta text-text-base outline-none placeholder:text-text-faint select-text"
                />
              </label>
              <select
                value={searchMode()}
                aria-label={tr("fileTreeSearchMode")}
                onChange={(event) =>
                  setSearchMode(event.currentTarget.value === "content" ? "content" : "name")
                }
                class="h-control-sm rounded-md border border-border-base bg-bg-base px-1 text-caption text-text-muted outline-none"
              >
                <option value="name">{tr("fileTreeName")}</option>
                <option value="content">{tr("fileTreeContent")}</option>
              </select>
              <Button type="button" variant="outline" size="sm" onClick={() => startCreate("file")}>
                <FilePlus />
                {tr("dialogNewFile")}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => startCreate("dir")}>
                <FolderPlus />
                {tr("dialogNewFolder")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={hidden()}
                onClick={() => setHidden(!hidden())}
              >
                {hidden() ? <EyeOff /> : <Eye />}
                {hidden() ? tr("hideHidden") : tr("showHidden")}
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={loading()} onClick={() => void refresh()}>
                <RefreshCw class={loading() ? "motion-safe:animate-spin" : undefined} />
                Refresh
              </Button>
            </div>
          </div>

          <ErrorBanner error={error()} class="mt-4 shrink-0" />

          <div class="mt-4 flex min-h-0 flex-1 gap-3">
            <div class="w-72 shrink-0 overflow-auto rounded-md border border-border-base bg-bg-layer-01 py-1">
              <Show
                when={query().trim()}
                fallback={
                  <>
                    <Show when={creating()}>
                      {(target) => (
                        <div class="px-2 py-1">
                          <input
                            autofocus
                            value={target().value}
                            aria-label={tr("newFileIn", {
                              kind:
                                target().kind === "dir" ? tr("fileKindFolder") : tr("fileKindFile"),
                              dir: target().dir || "/",
                            })}
                            placeholder={tr("newFileIn", {
                              kind:
                                target().kind === "dir" ? tr("fileKindFolder") : tr("fileKindFile"),
                              dir: target().dir || "/",
                            })}
                            onInput={(event) =>
                              setCreating({ ...target(), value: event.currentTarget.value })
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                event.currentTarget.blur();
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                createCancelled = true;
                                event.currentTarget.blur();
                              }
                            }}
                            onBlur={() => void commitCreate()}
                            class="w-full rounded-xs border border-border-base bg-bg-base px-1 py-0.5 font-mono text-meta text-text-base outline-none select-text"
                          />
                        </div>
                      )}
                    </Show>
                    <Level path="" depth={0} />
                  </>
                }
              >
                <div class="flex flex-col">
                  <Show
                    when={searchMode() === "name"}
                    fallback={
                      <>
                        <Show
                          when={grepHits().length > 0}
                          fallback={
                            <p class="px-2 py-1 text-meta text-text-faint">
                              {searching() ? tr("searching") : tr("noMatchingLines")}
                            </p>
                          }
                        >
                          <For each={grepHits()}>
                            {(hit) => (
                              <button
                                type="button"
                                onClick={() => void openFile(hit.path)}
                                class={`interactive flex w-full flex-col gap-0.5 px-2 py-1.5 text-left ${
                                  selected() === hit.path
                                    ? "bg-bg-layer-02"
                                    : "hover:bg-bg-layer-02"
                                }`}
                              >
                                <span class="w-full truncate font-mono text-caption text-text-faint">
                                  {hit.path}:{hit.line}
                                </span>
                                <span class="w-full truncate font-mono text-meta text-text-muted">
                                  {hit.text}
                                </span>
                              </button>
                            )}
                          </For>
                        </Show>
                        <Show when={grepTruncated()}>
                          <p class="px-2 py-1 text-caption text-text-faint">{tr("fileTreeShowingFirst50")}</p>
                        </Show>
                      </>
                    }
                  >
                    <>
                      <Show
                        when={hits().length > 0}
                        fallback={
                          <p class="px-2 py-1 text-meta text-text-faint">
                            {searching() ? tr("searching") : tr("noMatchingFiles")}
                          </p>
                        }
                      >
                        <For each={hits()}>
                          {(hit) => (
                            <button
                              type="button"
                              onClick={() => void openFile(hit.path)}
                              class={`interactive flex w-full items-center gap-2 px-2 py-1.5 text-left text-meta ${
                                selected() === hit.path
                                  ? "bg-bg-layer-02 text-text-base"
                                  : "text-text-muted hover:text-text-base"
                              }`}
                            >
                              <FileTypeIcon path={hit.path} class="size-3.5" />
                              <span class="min-w-0 flex-1 truncate font-mono" title={hit.path}>
                                {hit.path}
                              </span>
                              <span class="shrink-0 text-caption tabular-nums text-text-faint">
                                {formatBytes(hit.size)}
                              </span>
                            </button>
                          )}
                        </For>
                      </Show>
                      <Show when={hitsTruncated()}>
                        <p class="px-2 py-1 text-caption text-text-faint">{tr("fileTreeShowingFirst50")}</p>
                      </Show>
                    </>
                  </Show>
                </div>
              </Show>
            </div>

            <div class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border-base bg-bg-base">
              <Show
                when={preview()}
                fallback={<p class="p-3 text-meta text-text-faint">{tr("fileTreeSelectPreview")}</p>}
              >
                {(file) => (
                  <>
                    <div class="flex shrink-0 items-center gap-2 border-b border-border-base px-3 py-1.5 text-caption text-text-faint">
                      <span class="min-w-0 flex-1 truncate font-mono">{file().path}</span>
                      <span class="shrink-0 tabular-nums">{formatBytes(file().size)}</span>
                      <Show
                        when={!editing()}
                        fallback={
                          <span class="flex shrink-0 items-center gap-1">
                            <Button type="button" size="xs" disabled={saving()} onClick={() => void save()}>
                              <Save />
                              {saving() ? tr("saving") : tr("save")}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              disabled={saving()}
                              onClick={() => setEditing(false)}
                            >
                              Cancel
                            </Button>
                          </span>
                        }
                      >
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            disabled={formatting() || file().binary}
                            onClick={() => void formatFile()}
                          >
                            <Wand2 />
                            {formatting() ? tr("formatting") : tr("formatAction")}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            disabled={file().binary || file().truncated}
                            onClick={startEdit}
                          >
                            <Pencil />
                            Edit
                          </Button>
                        </>
                      </Show>
                    </div>
                    <Show when={notice()}>
                      <p class="shrink-0 border-b border-border-base px-3 py-1.5 text-caption text-text-faint">
                        {notice()}
                      </p>
                    </Show>
                    <Show
                      when={editing()}
                      fallback={
                        <Show
                          when={!file().binary}
                          fallback={
                            <p class="p-3 text-meta text-text-faint">{tr("fileTreeBinaryPreview")}</p>
                          }
                        >
                          <pre class="min-h-0 flex-1 overflow-auto p-3 font-mono text-meta leading-5 whitespace-pre text-text-muted select-text">
                            {file().content || "(empty file)"}
                          </pre>
                        </Show>
                      }
                    >
                      <textarea
                        value={draft()}
                        aria-label={`Edit ${file().path}`}
                        spellcheck={false}
                        onInput={(event) => setDraft(event.currentTarget.value)}
                        class="min-h-0 flex-1 resize-none bg-bg-base p-3 font-mono text-meta leading-5 text-text-base outline-none select-text"
                      />
                    </Show>
                    <Show when={file().truncated && !editing()}>
                      <div class="shrink-0 border-t border-border-base px-3 py-1.5 text-caption text-text-faint">
                        Preview truncated at 256 KB; editing is disabled.
                      </div>
                    </Show>
                  </>
                )}
              </Show>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget() !== undefined}
        title={tr("fileTreeDeleteEntry")}
        description={`Delete "${deleteTarget()?.path ?? ""}"? ${
          deleteTarget()?.type === "dir" ? tr("onlyEmptyDirs") : tr("cannotUndo")
        }`}
        confirmLabel="Delete"
        destructive
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(undefined);
        }}
        onConfirm={() => void removeEntry()}
      />
    </>
  );
}
