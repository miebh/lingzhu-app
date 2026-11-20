import { useEffect, useRef, useState, type ReactNode } from "react";
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
export function FileTreeDialog({ open, workspace, name, initialPath, onOpenChange }: Props) {
  const tr = useT();
  const [children, setChildren] = useState<Record<string, FsEntry[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [truncated, setTruncated] = useState<Record<string, boolean>>({});
  const [hidden, setHidden] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [preview, setPreview] = useState<FileContent>();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [notice, setNotice] = useState("");
  const [renaming, setRenaming] = useState<{ path: string; value: string }>();
  const [creating, setCreating] = useState<{ kind: "file" | "dir"; value: string; dir: string }>();
  const [deleteTarget, setDeleteTarget] = useState<FsEntry>();
  const renameCancelled = useRef(false);
  const createCancelled = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"name" | "content">("name");
  const [hits, setHits] = useState<FileSearchHit[]>([]);
  const [hitsTruncated, setHitsTruncated] = useState(false);
  const [grepHits, setGrepHits] = useState<FileGrepHit[]>([]);
  const [grepTruncated, setGrepTruncated] = useState(false);
  const [searching, setSearching] = useState(false);

  const loadDir = async (path: string, showHidden: boolean) => {
    const list = await api.files(workspace ?? "", path, showHidden);
    setChildren((current) => ({ ...current, [path]: list.entries }));
    setTruncated((current) => ({ ...current, [path]: list.truncated }));
  };

  useEffect(() => {
    if (!open || !workspace) {
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
      .files(workspace, "", hidden)
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
    return () => {
      alive = false;
    };
  }, [open, workspace, hidden, initialPath]);

  useEffect(() => {
    if (!open || !workspace) return;
    const term = query.trim();
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
        searchMode === "name"
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
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [open, workspace, query, searchMode]);

  const toggleDir = async (path: string) => {
    if (expanded[path]) {
      setExpanded((current) => ({ ...current, [path]: false }));
      return;
    }
    setExpanded((current) => ({ ...current, [path]: true }));
    if (children[path]) return;
    try {
      await loadDir(path, hidden);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const openFile = async (path: string) => {
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
    if (!preview) return;
    setDraft(preview.content);
    setEditing(true);
    setNotice("");
  };

  const formatFile = async () => {
    if (!workspace || !preview) return;
    setFormatting(true);
    setNotice("");
    try {
      const result = await api.formatFile(workspace, preview.path);
      if (!result.name) {
        setNotice("No formatter matched this file.");
      } else if (result.changed) {
        setNotice(`${result.name} formatted the file.`);
        setPreview(await api.fileContent(workspace, preview.path));
        setEditing(false);
        await loadDir(parentOf(preview.path), hidden);
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
    if (!workspace || !preview) return;
    setSaving(true);
    try {
      await api.writeFile(workspace, preview.path, draft);
      const next = await api.fileContent(workspace, preview.path);
      setPreview(next);
      setEditing(false);
      setError("");
      const parent = preview.path.includes("/")
        ? preview.path.slice(0, preview.path.lastIndexOf("/"))
        : "";
      await loadDir(parent, hidden);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  const refresh = async () => {
    if (!workspace) return;
    setLoading(true);
    setError("");
    setEditing(false);
    try {
      const paths = ["", ...Object.keys(expanded).filter((path) => expanded[path])];
      for (const path of paths) {
        await loadDir(path, hidden);
      }
      if (selected) setPreview(await api.fileContent(workspace, selected));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  const startCreate = (kind: "file" | "dir") => {
    createCancelled.current = false;
    setCreating({ kind, value: "", dir: selected ? parentOf(selected) : "" });
    setError("");
  };

  const commitCreate = async () => {
    if (!workspace || !creating) return;
    if (createCancelled.current) {
      createCancelled.current = false;
      setCreating(undefined);
      return;
    }
    const target = creating;
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
        setExpanded((current) => ({ ...current, [target.dir]: true }));
      }
      await loadDir(target.dir, hidden);
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
    if (!workspace || !renaming) return;
    if (renameCancelled.current) {
      renameCancelled.current = false;
      setRenaming(undefined);
      return;
    }
    const target = renaming;
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
      if (selected === target.path) {
        setSelected(next);
        setPreview(await api.fileContent(workspace, next));
        setEditing(false);
      }
      await loadDir(parent, hidden);
      setError("");
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const removeEntry = async () => {
    const target = deleteTarget;
    if (!target || !workspace) return;
    setDeleteTarget(undefined);
    try {
      await api.deleteFile(workspace, target.path);
      if (selected === target.path) {
        setSelected(undefined);
        setPreview(undefined);
        setEditing(false);
      }
      await loadDir(parentOf(target.path), hidden);
      setError("");
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const renderLevel = (path: string, depth: number): ReactNode => {
    const entries = children[path] ?? [];
    if (entries.length === 0) {
      return (
        <p className="px-2 py-1 text-body leading-4 font-[440] text-text-faint" style={{ paddingLeft: 10 + depth * 14 }}>
          {children[path] ? "Empty" : "Loading…"}
        </p>
      );
    }
    return entries.map((entry) => {
      const directory = entry.type === "dir";
      const isOpen = Boolean(expanded[entry.path]);
      const active = selected === entry.path;
      return (
        <div key={entry.path}>
          <div
            className={`interactive group/file flex h-7 items-center gap-1.5 rounded-md pe-2 text-body ${
              active ? "bg-bg-layer-02 text-text-base" : "text-text-muted hover:text-text-base"
            }`}
            style={{ paddingLeft: 8 + depth * 14 }}
          >
            {renaming?.path === entry.path ? (
              <input
                autoFocus
                value={renaming.value}
                aria-label={`Rename ${entry.name}`}
                onChange={(event) =>
                  setRenaming({ path: entry.path, value: event.target.value })
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    renameCancelled.current = true;
                    event.currentTarget.blur();
                  }
                }}
                onBlur={() => void commitRename()}
                className="my-0.5 min-w-0 flex-1 rounded-xs border border-border-base bg-bg-base px-1 py-0.5 font-mono text-meta text-text-base outline-none select-text"
              />
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => (directory ? void toggleDir(entry.path) : void openFile(entry.path))}
                  className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-left"
                  title={entry.path}
                >
                  {directory ? (
                    isOpen ? (
                      <FolderOpen className="size-4 shrink-0 text-text-faint" />
                    ) : (
                      <FolderClosed className="size-4 shrink-0 text-text-faint" />
                    )
                  ) : (
                    <FileTypeIcon path={entry.path} className="size-4" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-[530]">{entry.name}</span>
                  {!directory && (
                    <span className="shrink-0 text-caption tabular-nums text-text-faint">
                      {formatBytes(entry.size)}
                    </span>
                  )}
                </button>
                <span className="flex shrink-0 items-center opacity-0 transition-opacity group-focus-within/file:opacity-100 group-hover/file:opacity-100">
                  <button
                    type="button"
                    aria-label={`Rename ${entry.name}`}
                    onClick={() => {
                      renameCancelled.current = false;
                      setRenaming({ path: entry.path, value: entry.name });
                    }}
                    className="interactive grid size-5 place-items-center rounded-xs text-text-faint hover:text-text-base"
                  >
                    <Pencil className="size-3" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${entry.name}`}
                    onClick={() => setDeleteTarget(entry)}
                    className="interactive grid size-5 place-items-center rounded-xs text-text-faint hover:text-state-fg-danger"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </span>
              </>
            )}
          </div>
          {directory && isOpen && renderLevel(entry.path, depth + 1)}
          {directory && isOpen && truncated[entry.path] && (
            <p className="px-2 py-1 text-caption text-text-faint" style={{ paddingLeft: 10 + (depth + 1) * 14 }}>
              {tr("dialogFirst1000Entries")}
            </p>
          )}
        </div>
      );
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" height="body" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle>Files</DialogTitle>
            <DialogDescription className="truncate">{name || workspace}</DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <label className="flex h-control-sm items-center gap-1 rounded-md border border-border-base bg-bg-base px-2">
              <Search className="size-3.5 shrink-0 text-text-faint" />
              <input
                value={query}
                aria-label={tr("fileTreeSearchWorkspaceFiles")}
                placeholder={searchMode === "name" ? "Search files" : "Search contents"}
                onChange={(event) => setQuery(event.target.value)}
                className="w-36 bg-transparent text-meta text-text-base outline-none placeholder:text-text-faint select-text"
              />
            </label>
            <select
              value={searchMode}
              aria-label={tr("fileTreeSearchMode")}
              onChange={(event) => setSearchMode(event.target.value === "content" ? "content" : "name")}
              className="h-control-sm rounded-md border border-border-base bg-bg-base px-1 text-caption text-text-muted outline-none"
            >
              <option value="name">Name</option>
              <option value="content">Content</option>
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
              aria-pressed={hidden}
              onClick={() => setHidden((value) => !value)}
            >
              {hidden ? <EyeOff /> : <Eye />}
              {hidden ? "Hide hidden" : "Show hidden"}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void refresh()}>
              <RefreshCw className={loading ? "motion-safe:animate-spin" : undefined} />
              Refresh
            </Button>
          </div>
        </div>

        <ErrorBanner error={error} className="mt-4 shrink-0" />

        <div className="mt-4 flex min-h-0 flex-1 gap-3">
          <div className="w-72 shrink-0 overflow-auto rounded-md border border-border-base bg-bg-layer-01 py-1">
            {query.trim() ? (
              <div className="flex flex-col">
                {searchMode === "name" ? (
                  <>
                    {hits.length === 0 ? (
                      <p className="px-2 py-1 text-meta text-text-faint">
                        {searching ? "Searching…" : "No matching files."}
                      </p>
                    ) : (
                      hits.map((hit) => (
                        <button
                          key={hit.path}
                          type="button"
                          onClick={() => void openFile(hit.path)}
                          className={`interactive flex w-full items-center gap-2 px-2 py-1.5 text-left text-meta ${
                            selected === hit.path
                              ? "bg-bg-layer-02 text-text-base"
                              : "text-text-muted hover:text-text-base"
                          }`}
                        >
                          <FileTypeIcon path={hit.path} className="size-3.5" />
                          <span className="min-w-0 flex-1 truncate font-mono" title={hit.path}>
                            {hit.path}
                          </span>
                          <span className="shrink-0 text-caption tabular-nums text-text-faint">
                            {formatBytes(hit.size)}
                          </span>
                        </button>
                      ))
                    )}
                    {hitsTruncated && (
                      <p className="px-2 py-1 text-caption text-text-faint">Showing the first 50 matches.</p>
                    )}
                  </>
                ) : (
                  <>
                    {grepHits.length === 0 ? (
                      <p className="px-2 py-1 text-meta text-text-faint">
                        {searching ? "Searching…" : "No matching lines."}
                      </p>
                    ) : (
                      grepHits.map((hit) => (
                        <button
                          key={`${hit.path}:${hit.line}`}
                          type="button"
                          onClick={() => void openFile(hit.path)}
                          className={`interactive flex w-full flex-col gap-0.5 px-2 py-1.5 text-left ${
                            selected === hit.path
                              ? "bg-bg-layer-02"
                              : "hover:bg-bg-layer-02"
                          }`}
                        >
                          <span className="w-full truncate font-mono text-caption text-text-faint">
                            {hit.path}:{hit.line}
                          </span>
                          <span className="w-full truncate font-mono text-meta text-text-muted">
                            {hit.text}
                          </span>
                        </button>
                      ))
                    )}
                    {grepTruncated && (
                      <p className="px-2 py-1 text-caption text-text-faint">Showing the first 50 matches.</p>
                    )}
                  </>
                )}
              </div>
            ) : (
              <>
            {creating && (
              <div className="px-2 py-1">
                <input
                  autoFocus
                  value={creating.value}
                  aria-label={`New ${creating.kind === "dir" ? "folder" : "file"}`}
                  placeholder={`New ${creating.kind === "dir" ? "folder" : "file"} in ${
                    creating.dir || "/"
                  }`}
                  onChange={(event) =>
                    setCreating({ ...creating, value: event.target.value })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      createCancelled.current = true;
                      event.currentTarget.blur();
                    }
                  }}
                  onBlur={() => void commitCreate()}
                  className="w-full rounded-xs border border-border-base bg-bg-base px-1 py-0.5 font-mono text-meta text-text-base outline-none select-text"
                />
              </div>
            )}
            {renderLevel("", 0)}
              </>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border-base bg-bg-base">
            {preview ? (
              <>
                <div className="flex shrink-0 items-center gap-2 border-b border-border-base px-3 py-1.5 text-caption text-text-faint">
                  <span className="min-w-0 flex-1 truncate font-mono">{preview.path}</span>
                  <span className="shrink-0 tabular-nums">{formatBytes(preview.size)}</span>
                  {!editing ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        disabled={formatting || preview.binary}
                        onClick={() => void formatFile()}
                      >
                        <Wand2 />
                        {formatting ? "Formatting…" : "Format"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        disabled={preview.binary || preview.truncated}
                        onClick={startEdit}
                      >
                        <Pencil />
                        Edit
                      </Button>
                    </>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1">
                      <Button type="button" size="xs" disabled={saving} onClick={() => void save()}>
                        <Save />
                        {saving ? "Saving…" : "Save"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        disabled={saving}
                        onClick={() => setEditing(false)}
                      >
                        Cancel
                      </Button>
                    </span>
                  )}
                </div>
                {notice && (
                  <p className="shrink-0 border-b border-border-base px-3 py-1.5 text-caption text-text-faint">
                    {notice}
                  </p>
                )}
                {editing ? (
                  <textarea
                    value={draft}
                    aria-label={`Edit ${preview.path}`}
                    spellCheck={false}
                    onChange={(event) => setDraft(event.target.value)}
                    className="min-h-0 flex-1 resize-none bg-bg-base p-3 font-mono text-meta leading-5 text-text-base outline-none select-text"
                  />
                ) : preview.binary ? (
                  <p className="p-3 text-meta text-text-faint">Binary file, no preview available.</p>
                ) : (
                  <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-meta leading-5 whitespace-pre text-text-muted select-text">
                    {preview.content || "(empty file)"}
                  </pre>
                )}
                {preview.truncated && !editing && (
                  <div className="shrink-0 border-t border-border-base px-3 py-1.5 text-caption text-text-faint">
                    Preview truncated at 256 KB; editing is disabled.
                  </div>
                )}
              </>
            ) : (
              <p className="p-3 text-meta text-text-faint">Select a file to preview it.</p>
            )}
          </div>
        </div>
      </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== undefined}
        title={tr("fileTreeDeleteEntry")}
        description={`Delete "${deleteTarget?.path ?? ""}"? ${
          deleteTarget?.type === "dir" ? "Only empty directories can be deleted." : "This cannot be undone."
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
