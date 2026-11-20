import { useEffect, useState } from "react";
import { Copy, ExternalLink, FileCode2, Package, Pencil, Plus, Save, Trash2 } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { ConfirmDialog } from "./Dialogs";
import { api } from "../../lib/api";
import { artifactDownloadName } from "../../lib/artifactFile";
import { messageOf } from "../../lib/errors";
import type {
  ArtifactContent,
  ArtifactFile,
  ArtifactInfo,
  ArtifactProvider,
  ArtifactWrite,
} from "@lingzhu/ui/types";
import { formatDateTime } from "@lingzhu/ui/format";
import { RefreshButton, ErrorBanner } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  name?: string;
  onOpenChange: (open: boolean) => void;
}

interface DraftFile {
  name: string;
  content: string;
}

interface ArtifactEditor {
  id?: string;
  title: string;
  entry: string;
  provider: string;
  files: DraftFile[];
}

function decodeBase64(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Lists published artifacts, previews their files and removes them. */
export function ArtifactsDialog({ open, workspace, name, onOpenChange }: Props) {
  const tr = useT();
  const [items, setItems] = useState<ArtifactInfo[]>([]);
  const [selected, setSelected] = useState<ArtifactContent>();
  const [previewFile, setPreviewFile] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ArtifactInfo>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [providers, setProviders] = useState<ArtifactProvider[]>([]);
  const [editor, setEditor] = useState<ArtifactEditor>();
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"source" | "preview">("source");
  const [raw, setRaw] = useState<ArtifactFile>();
  const [rawError, setRawError] = useState("");
  const [rawLoading, setRawLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [savingFile, setSavingFile] = useState(false);

  const preview = async (id: string) => {
    if (!workspace) return;
    try {
      const content = await api.artifact(workspace, id);
      setSelected(content);
      setPreviewFile(content.entry || content.files[0] || "");
      setError("");
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const load = async (preferId?: string) => {
    if (!workspace) return;
    setLoading(true);
    setError("");
    try {
      const [list, nextProviders] = await Promise.all([
        api.artifacts(workspace),
        api.artifactProviders(workspace).catch(() => []),
      ]);
      setItems(list);
      setProviders(nextProviders);
      const current =
        list.find((item) => item.id === preferId) ??
        list.find((item) => item.id === selected?.id) ??
        list[0];
      if (current) {
        await preview(current.id);
      } else {
        setSelected(undefined);
        setPreviewFile("");
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void load();
    } else {
      setItems([]);
      setSelected(undefined);
      setPreviewFile("");
      setError("");
      setCopied(false);
      setProviders([]);
      setEditor(undefined);
      setSaving(false);
      setMode("source");
      setRaw(undefined);
      setRawError("");
      setNotice("");
      setSavingFile(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace]);

  useEffect(() => {
    if (!open || mode !== "preview" || !workspace || !selected || !previewFile) {
      setRaw(undefined);
      setRawError("");
      return;
    }
    let alive = true;
    setRawLoading(true);
    setRawError("");
    api
      .artifactFile(workspace, selected.id, previewFile)
      .then((value) => {
        if (alive) setRaw(value);
      })
      .catch((err) => {
        if (alive) {
          setRaw(undefined);
          setRawError(messageOf(err));
        }
      })
      .finally(() => {
        if (alive) setRawLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, workspace, selected?.id, previewFile]);

  const startCreate = () => {
    setEditor({
      title: "",
      entry: "index.html",
      provider: providers.find((item) => item.default)?.id ?? providers[0]?.id ?? "",
      files: [{ name: "index.html", content: "" }],
    });
    setError("");
  };

  const startEdit = async (info: ArtifactInfo) => {
    if (!workspace) return;
    try {
      const content = await api.artifact(workspace, info.id);
      setEditor({
        id: content.id,
        title: content.title,
        entry: content.entry,
        provider: providers.find((item) => item.default)?.id ?? providers[0]?.id ?? "",
        files: Object.entries(content.contents).map(([file, body]) => ({
          name: file,
          content: body,
        })),
      });
      setError("");
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const updateFile = (index: number, patch: Partial<DraftFile>) => {
    setEditor((current) => {
      if (!current) return current;
      return {
        ...current,
        files: current.files.map((file, position) =>
          position === index ? { ...file, ...patch } : file,
        ),
      };
    });
  };

  const addFile = () => {
    setEditor((current) =>
      current ? { ...current, files: [...current.files, { name: "", content: "" }] } : current,
    );
  };

  const removeFile = (index: number) => {
    setEditor((current) =>
      current
        ? { ...current, files: current.files.filter((_, position) => position !== index) }
        : current,
    );
  };

  const save = async () => {
    if (!workspace || !editor) return;
    const files: Record<string, string> = {};
    for (const file of editor.files) {
      const name = file.name.trim();
      if (!name) {
        setError("Every file needs a name.");
        return;
      }
      if (files[name] !== undefined) {
        setError(`Duplicate file ${name}.`);
        return;
      }
      files[name] = file.content;
    }
    if (Object.keys(files).length === 0) {
      setError("Add at least one file.");
      return;
    }
    const input: ArtifactWrite = {
      title: editor.title.trim(),
      entry: editor.entry.trim(),
      files,
    };
    if (editor.provider.trim()) input.provider = editor.provider.trim();
    setSaving(true);
    try {
      const info = editor.id
        ? await api.updateArtifact(workspace, editor.id, input)
        : await api.createArtifact(workspace, input);
      setEditor(undefined);
      await load(info.id);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const target = deleteTarget;
    if (!target || !workspace) return;
    setDeleteTarget(undefined);
    try {
      await api.deleteArtifact(workspace, target.id);
      setItems((current) => current.filter((item) => item.id !== target.id));
      if (selected?.id === target.id) {
        setSelected(undefined);
        setPreviewFile("");
      }
      setError("");
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const openRaw = (info: ArtifactInfo) => {
    window.open(info.url, "_blank", "noopener,noreferrer");
  };

  const copyURL = async (info: ArtifactInfo) => {
    try {
      await navigator.clipboard.writeText(info.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const content = selected && previewFile ? selected.contents[previewFile] : undefined;

  const saveFile = async () => {
    if (!selected || !previewFile) return;
    const name = artifactDownloadName(previewFile, selected.title || selected.id);
    setSavingFile(true);
    try {
      let path = "";
      if (mode === "preview") {
        if (!raw) {
          setError("Preview is still loading.");
          return;
        }
        if (raw.truncated) {
          setError("Preview is truncated at 8 MB; use Open to download the full file.");
          return;
        }
        path = await api.saveBase64File(name, raw.data);
      } else if (content !== undefined) {
        path = await api.saveTextFile(name, content);
      }
      if (path) {
        setNotice(`Saved ${path}`);
        setError("");
      }
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setSavingFile(false);
    }
  };

  const canSaveFile =
    Boolean(selected && previewFile) &&
    !savingFile &&
    (mode === "source" ? content !== undefined : Boolean(raw) && !raw?.truncated);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="wide" height="body" className="flex flex-col">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle>Artifacts</DialogTitle>
              <DialogDescription className="truncate">{name || workspace}</DialogDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={startCreate} disabled={loading}>
              <Plus />
              New
            </Button>
            <RefreshButton loading={loading} onRefresh={() => void load()} />
          </div>

          <ErrorBanner error={error} />
          <NoticeBanner notice={notice} shrink />

          {editor ? (
            <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2">
              <div className="flex shrink-0 flex-wrap items-end gap-2">
                <label className="flex min-w-48 flex-1 flex-col gap-1 text-caption text-text-faint">
                  Title
                  <Input
                    value={editor.title}
                    placeholder={tr("artifactsArtifactTitle")}
                    aria-label={tr("artifactsArtifactTitle")}
                    onChange={(event) => setEditor({ ...editor, title: event.target.value })}
                    className="select-text"
                  />
                </label>
                <label className="flex w-44 flex-col gap-1 text-caption text-text-faint">
                  Entry
                  <Input
                    value={editor.entry}
                    placeholder="index.html"
                    aria-label={tr("artifactsArtifactEntry")}
                    onChange={(event) => setEditor({ ...editor, entry: event.target.value })}
                    className="select-text font-mono"
                  />
                </label>
                {providers.length > 1 && (
                  <label className="flex w-40 flex-col gap-1 text-caption text-text-faint">
                    Provider
                    <select
                      value={editor.provider}
                      aria-label={tr("artifactsArtifactProvider")}
                      onChange={(event) => setEditor({ ...editor, provider: event.target.value })}
                      className="h-control-md rounded-md border border-border-base bg-bg-layer-01 px-2 text-body text-text-base outline-none"
                    >
                      {providers.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.name || provider.id}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
                {editor.files.map((file, index) => (
                  <div
                    key={index}
                    className="rounded-md border border-border-base bg-bg-layer-01 p-2"
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        value={file.name}
                        placeholder="path/to/file"
                        aria-label={`File ${index + 1} name`}
                        onChange={(event) => updateFile(index, { name: event.target.value })}
                        className="select-text font-mono"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-xs"
                        aria-label={`Remove file ${index + 1}`}
                        onClick={() => removeFile(index)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <textarea
                      value={file.content}
                      spellCheck={false}
                      aria-label={`File ${index + 1} content`}
                      onChange={(event) => updateFile(index, { content: event.target.value })}
                      className="mt-2 min-h-32 w-full resize-y rounded-xs border border-border-base bg-bg-base p-2 font-mono text-meta leading-5 text-text-base outline-none select-text"
                    />
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="self-start" onClick={addFile}>
                  <Plus />
                  {tr("dialogAddFile")}
                </Button>
              </div>

              <div className="flex shrink-0 justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => setEditor(undefined)}
                >
                  Cancel
                </Button>
                <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
                  {saving ? "Saving…" : editor.id ? "Save changes" : "Create artifact"}
                </Button>
              </div>
            </div>
          ) : (
          <div className="mt-4 flex min-h-0 flex-1 gap-3">
            <div className="w-64 shrink-0 overflow-auto rounded-md border border-border-base bg-bg-layer-01 py-1">
              {items.length === 0 ? (
                <p className="px-2 py-1 text-meta text-text-faint">
                  {loading ? "Loading…" : "No artifacts yet."}
                </p>
              ) : (
                items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void preview(item.id)}
                    className={`interactive flex w-full items-start gap-2 px-2 py-1.5 text-left text-meta ${
                      selected?.id === item.id
                        ? "bg-bg-layer-02 text-text-base"
                        : "text-text-muted hover:text-text-base"
                    }`}
                  >
                    <Package className="mt-0.5 size-3.5 shrink-0 text-text-faint" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{item.title || item.id}</span>
                      <span className="block truncate text-caption text-text-faint">
                        {item.files.length} file{item.files.length === 1 ? "" : "s"} ·{" "}
                        {formatDateTime(item.updated)}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border-base bg-bg-base">
              {selected ? (
                <>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-base px-3 py-1.5 text-caption text-text-faint">
                    <FileCode2 className="size-3.5" />
                    <span className="min-w-0 flex-1 truncate font-mono" title={selected.url}>
                      {selected.id}
                    </span>
                    <select
                      value={previewFile}
                      aria-label={tr("artifactsArtifactFile")}
                      onChange={(event) => setPreviewFile(event.target.value)}
                      className="h-control-xs rounded-xs border border-border-base bg-bg-layer-01 px-1 text-caption text-text-base outline-none"
                    >
                      {selected.files.map((file) => (
                        <option key={file} value={file}>
                          {file}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant={mode === "preview" ? "default" : "outline"}
                      size="xs"
                      onClick={() => setMode((current) => (current === "preview" ? "source" : "preview"))}
                    >
                      {mode === "preview" ? "Source" : "Preview"}
                    </Button>
                    <Button type="button" variant="outline" size="xs" onClick={() => void startEdit(selected)}>
                      <Pencil />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={!canSaveFile}
                      onClick={() => void saveFile()}
                    >
                      <Save />
                      {savingFile ? "Saving…" : "Save file"}
                    </Button>
                    <Button type="button" variant="outline" size="xs" onClick={() => openRaw(selected)}>
                      <ExternalLink />
                      Open
                    </Button>
                    <Button type="button" variant="outline" size="xs" onClick={() => void copyURL(selected)}>
                      <Copy />
                      {copied ? "Copied" : "Copy URL"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      aria-label={`Delete artifact ${selected.title || selected.id}`}
                      onClick={() => setDeleteTarget(selected)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  {mode === "preview" ? (
                    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
                      {rawLoading ? (
                        <p className="p-3 text-meta text-text-faint">Loading preview…</p>
                      ) : rawError ? (
                        <p className="p-3 text-meta text-state-fg-danger select-text">{rawError}</p>
                      ) : raw ? (
                        raw.mediaType.startsWith("image/") || raw.mediaType.includes("svg") ? (
                          <div className="flex min-h-0 flex-1 items-center justify-center bg-[repeating-conic-gradient(#0002_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-3">
                            <img
                              src={`data:${raw.mediaType.split(";")[0]};base64,${raw.data}`}
                              alt={raw.path}
                              className="max-h-full max-w-full object-contain"
                            />
                          </div>
                        ) : raw.mediaType.includes("html") ? (
                          <iframe
                            title={`Preview of ${raw.path}`}
                            sandbox=""
                            srcDoc={decodeBase64(raw.data)}
                            className="h-full min-h-96 w-full border-0 bg-bg-document"
                          />
                        ) : raw.mediaType.startsWith("text/") ||
                          raw.mediaType.includes("json") ||
                          raw.mediaType.includes("xml") ||
                          raw.mediaType.includes("javascript") ? (
                          <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-meta leading-5 whitespace-pre-wrap break-all text-text-muted select-text">
                            {decodeBase64(raw.data)}
                          </pre>
                        ) : (
                          <p className="p-3 text-meta text-text-faint">
                            Preview is not available for {raw.mediaType || "this file"} ({raw.size} bytes).
                          </p>
                        )
                      ) : (
                        <p className="p-3 text-meta text-text-faint">No preview.</p>
                      )}
                      {raw?.truncated && (
                        <p className="shrink-0 border-t border-border-base px-3 py-1.5 text-caption text-state-fg-warning">
                          {tr("dialogPreviewTruncated8mb")}
                        </p>
                      )}
                    </div>
                  ) : (
                    <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-meta leading-5 whitespace-pre text-text-muted select-text">
                      {content === undefined
                        ? "(file not available)"
                        : content || "(empty file)"}
                    </pre>
                  )}
                </>
              ) : (
                <p className="p-3 text-meta text-text-faint">
                  {loading ? "Loading…" : "Select an artifact to preview its entry file."}
                </p>
              )}
            </div>
          </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== undefined}
        title={tr("artifactsDeleteArtifact")}
        description={`Delete "${deleteTarget?.title || deleteTarget?.id || ""}"? Its files are removed from disk.`}
        confirmLabel="Delete"
        destructive
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(undefined);
        }}
        onConfirm={() => void remove()}
      />
    </>
  );
}
