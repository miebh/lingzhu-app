import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { update } from "@lingzhu/ui/solid";
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
export function ArtifactsDialog(props: Props) {
  const tr = useT();
  const [items, setItems] = createSignal<ArtifactInfo[]>([]);
  const [selected, setSelected] = createSignal<ArtifactContent>();
  const [previewFile, setPreviewFile] = createSignal("");
  const [deleteTarget, setDeleteTarget] = createSignal<ArtifactInfo>();
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [copied, setCopied] = createSignal(false);
  const [providers, setProviders] = createSignal<ArtifactProvider[]>([]);
  const [editor, setEditor] = createSignal<ArtifactEditor>();
  const [saving, setSaving] = createSignal(false);
  const [mode, setMode] = createSignal<"source" | "preview">("source");
  const [raw, setRaw] = createSignal<ArtifactFile>();
  const [rawError, setRawError] = createSignal("");
  const [rawLoading, setRawLoading] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  const [savingFile, setSavingFile] = createSignal(false);

  const preview = async (id: string) => {
    if (!props.workspace) return;
    try {
      const content = await api.artifact(props.workspace, id);
      setSelected(content);
      setPreviewFile(content.entry || content.files[0] || "");
      setError("");
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const load = async (preferId?: string) => {
    const workspace = props.workspace;
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
        list.find((item) => item.id === selected()?.id) ??
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

  createEffect(() => {
    if (props.open) {
      void props.workspace;
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
  });

  createEffect(() => {
    const workspace = props.workspace;
    const current = selected();
    const file = previewFile();
    if (!props.open || mode() !== "preview" || !workspace || !current || !file) {
      setRaw(undefined);
      setRawError("");
      return;
    }
    const artifactID = current.id;
    let alive = true;
    setRawLoading(true);
    setRawError("");
    api
      .artifactFile(workspace, artifactID, file)
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
    onCleanup(() => {
      alive = false;
    });
  });

  const startCreate = () => {
    const list = providers();
    setEditor({
      title: "",
      entry: "index.html",
      provider: list.find((item) => item.default)?.id ?? list[0]?.id ?? "",
      files: [{ name: "index.html", content: "" }],
    });
    setError("");
  };

  const startEdit = async (info: ArtifactInfo) => {
    if (!props.workspace) return;
    try {
      const content = await api.artifact(props.workspace, info.id);
      const list = providers();
      setEditor({
        id: content.id,
        title: content.title,
        entry: content.entry,
        provider: list.find((item) => item.default)?.id ?? list[0]?.id ?? "",
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
    update(setEditor, editor, (current) => {
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
    update(setEditor, editor, (current) =>
      current ? { ...current, files: [...current.files, { name: "", content: "" }] } : current,
    );
  };

  const removeFile = (index: number) => {
    update(setEditor, editor, (current) =>
      current
        ? { ...current, files: current.files.filter((_, position) => position !== index) }
        : current,
    );
  };

  const save = async () => {
    const workspace = props.workspace;
    const current = editor();
    if (!workspace || !current) return;
    const files: Record<string, string> = {};
    for (const file of current.files) {
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
      title: current.title.trim(),
      entry: current.entry.trim(),
      files,
    };
    if (current.provider.trim()) input.provider = current.provider.trim();
    setSaving(true);
    try {
      const info = current.id
        ? await api.updateArtifact(workspace, current.id, input)
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
    const target = deleteTarget();
    const workspace = props.workspace;
    if (!target || !workspace) return;
    setDeleteTarget(undefined);
    try {
      await api.deleteArtifact(workspace, target.id);
      update(setItems, items, (current) => current.filter((item) => item.id !== target.id));
      if (selected()?.id === target.id) {
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

  const content = () => {
    const current = selected();
    const file = previewFile();
    return current && file ? current.contents[file] : undefined;
  };

  const saveFile = async () => {
    const current = selected();
    const file = previewFile();
    if (!current || !file) return;
    const name = artifactDownloadName(file, current.title || current.id);
    setSavingFile(true);
    try {
      let path = "";
      if (mode() === "preview") {
        const fileData = raw();
        if (!fileData) {
          setError("Preview is still loading.");
          return;
        }
        if (fileData.truncated) {
          setError("Preview is truncated at 8 MB; use Open to download the full file.");
          return;
        }
        path = await api.saveBase64File(name, fileData.data);
      } else if (content() !== undefined) {
        path = await api.saveTextFile(name, content()!);
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

  const canSaveFile = () =>
    Boolean(selected() && previewFile()) &&
    !savingFile() &&
    (mode() === "source" ? content() !== undefined : Boolean(raw()) && !raw()?.truncated);

  return (
    <>
      <Dialog open={props.open} onOpenChange={props.onOpenChange}>
        <DialogContent size="wide" height="body" class="flex flex-col">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <DialogTitle>{tr("artifactsTitle")}</DialogTitle>
              <DialogDescription class="truncate">{props.name || props.workspace}</DialogDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={startCreate} disabled={loading()}>
              <Plus />
              New
            </Button>
            <RefreshButton loading={loading()} onRefresh={() => void load()} />
          </div>

          <ErrorBanner error={error()} />
          <NoticeBanner notice={notice()} shrink />

          <Show
            when={editor()}
            fallback={
              <div class="mt-4 flex min-h-0 flex-1 gap-3">
                <div class="w-64 shrink-0 overflow-auto rounded-md border border-border-base bg-bg-layer-01 py-1">
                  <Show
                    when={items().length > 0}
                    fallback={
                      <p class="px-2 py-1 text-meta text-text-faint">
                        {loading() ? tr("loading") : tr("noArtifacts")}
                      </p>
                    }
                  >
                    <For each={items()}>
                      {(item) => (
                        <button
                          type="button"
                          onClick={() => void preview(item.id)}
                          class={`interactive flex w-full items-start gap-2 px-2 py-1.5 text-left text-meta ${
                            selected()?.id === item.id
                              ? "bg-bg-layer-02 text-text-base"
                              : "text-text-muted hover:text-text-base"
                          }`}
                        >
                          <Package class="mt-0.5 size-3.5 shrink-0 text-text-faint" />
                          <span class="min-w-0 flex-1">
                            <span class="block truncate">{item.title || item.id}</span>
                            <span class="block truncate text-caption text-text-faint">
                              {item.files.length} file{item.files.length === 1 ? "" : "s"} ·{" "}
                              {formatDateTime(item.updated)}
                            </span>
                          </span>
                        </button>
                      )}
                    </For>
                  </Show>
                </div>

                <div class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border-base bg-bg-base">
                  <Show
                    when={selected()}
                    fallback={
                      <p class="p-3 text-meta text-text-faint">
                        {loading() ? tr("loading") : tr("selectArtifact")}
                      </p>
                    }
                  >
                    {(artifact) => (
                      <>
                        <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-base px-3 py-1.5 text-caption text-text-faint">
                          <FileCode2 class="size-3.5" />
                          <span class="min-w-0 flex-1 truncate font-mono" title={artifact().url}>
                            {artifact().id}
                          </span>
                          <select
                            value={previewFile()}
                            aria-label={tr("artifactsArtifactFile")}
                            onChange={(event) => setPreviewFile(event.currentTarget.value)}
                            class="h-control-xs rounded-xs border border-border-base bg-bg-layer-01 px-1 text-caption text-text-base outline-none"
                          >
                            <For each={artifact().files}>
                              {(file) => <option value={file}>{file}</option>}
                            </For>
                          </select>
                          <Button
                            type="button"
                            variant={mode() === "preview" ? "default" : "outline"}
                            size="xs"
                            onClick={() => setMode(mode() === "preview" ? "source" : "preview")}
                          >
                            {mode() === "preview" ? tr("source") : tr("preview")}
                          </Button>
                          <Button type="button" variant="outline" size="xs" onClick={() => void startEdit(artifact())}>
                            <Pencil />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            disabled={!canSaveFile()}
                            onClick={() => void saveFile()}
                          >
                            <Save />
                            {savingFile() ? tr("saving") : tr("dialogSaveFile")}
                          </Button>
                          <Button type="button" variant="outline" size="xs" onClick={() => openRaw(artifact())}>
                            <ExternalLink />
                            Open
                          </Button>
                          <Button type="button" variant="outline" size="xs" onClick={() => void copyURL(artifact())}>
                            <Copy />
                            {copied() ? tr("copied") : tr("copyUrl")}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-xs"
                            aria-label={`Delete artifact ${artifact().title || artifact().id}`}
                            onClick={() => setDeleteTarget(artifact())}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                        <Show
                          when={mode() === "preview"}
                          fallback={
                            <pre class="min-h-0 flex-1 overflow-auto p-3 font-mono text-meta leading-5 whitespace-pre text-text-muted select-text">
                              {content() === undefined
                                ? "(file not available)"
                                : content() || "(empty file)"}
                            </pre>
                          }
                        >
                          <div class="flex min-h-0 flex-1 flex-col overflow-auto">
                            <Show
                              when={!rawLoading()}
                              fallback={<p class="p-3 text-meta text-text-faint">{tr("artifactsLoadingPreview")}</p>}
                            >
                              <Show
                                when={!rawError()}
                                fallback={
                                  <p class="p-3 text-meta text-state-fg-danger select-text">{rawError()}</p>
                                }
                              >
                                <Show
                                  when={raw()}
                                  fallback={<p class="p-3 text-meta text-text-faint">{tr("artifactsNoPreview")}</p>}
                                >
                                  {(fileData) => (
                                    <Show
                                      when={fileData().mediaType.startsWith("image/") || fileData().mediaType.includes("svg")}
                                      fallback={
                                        <Show
                                          when={fileData().mediaType.includes("html")}
                                          fallback={
                                            <Show
                                              when={
                                                fileData().mediaType.startsWith("text/") ||
                                                fileData().mediaType.includes("json") ||
                                                fileData().mediaType.includes("xml") ||
                                                fileData().mediaType.includes("javascript")
                                              }
                                              fallback={
                                                <p class="p-3 text-meta text-text-faint">
                                                  Preview is not available for {fileData().mediaType || "this file"} ({fileData().size} bytes).
                                                </p>
                                              }
                                            >
                                              <pre class="min-h-0 flex-1 overflow-auto p-3 font-mono text-meta leading-5 whitespace-pre-wrap break-all text-text-muted select-text">
                                                {decodeBase64(fileData().data)}
                                              </pre>
                                            </Show>
                                          }
                                        >
                                          <iframe
                                            title={`Preview of ${fileData().path}`}
                                            sandbox=""
                                            srcdoc={decodeBase64(fileData().data)}
                                            class="h-full min-h-96 w-full border-0 bg-bg-document"
                                          />
                                        </Show>
                                      }
                                    >
                                      <div class="flex min-h-0 flex-1 items-center justify-center bg-[repeating-conic-gradient(#0002_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-3">
                                        <img
                                          src={`data:${fileData().mediaType.split(";")[0]};base64,${fileData().data}`}
                                          alt={fileData().path}
                                          class="max-h-full max-w-full object-contain"
                                        />
                                      </div>
                                    </Show>
                                  )}
                                </Show>
                              </Show>
                            </Show>
                            <Show when={raw()?.truncated}>
                              <p class="shrink-0 border-t border-border-base px-3 py-1.5 text-caption text-state-fg-warning">
                                {tr("dialogPreviewTruncated8mb")}
                              </p>
                            </Show>
                          </div>
                        </Show>
                      </>
                    )}
                  </Show>
                </div>
              </div>
            }
          >
            {(draft) => (
              <div class="mt-4 flex min-h-0 flex-1 flex-col gap-2">
                <div class="flex shrink-0 flex-wrap items-end gap-2">
                  <label class="flex min-w-48 flex-1 flex-col gap-1 text-caption text-text-faint">
                    Title
                    <Input
                      value={draft().title}
                      placeholder={tr("artifactsArtifactTitle")}
                      aria-label={tr("artifactsArtifactTitle")}
                      onInput={(event) => setEditor({ ...draft(), title: event.currentTarget.value })}
                      class="select-text"
                    />
                  </label>
                  <label class="flex w-44 flex-col gap-1 text-caption text-text-faint">
                    Entry
                    <Input
                      value={draft().entry}
                      placeholder="index.html"
                      aria-label={tr("artifactsArtifactEntry")}
                      onInput={(event) => setEditor({ ...draft(), entry: event.currentTarget.value })}
                      class="select-text font-mono"
                    />
                  </label>
                  <Show when={providers().length > 1}>
                    <label class="flex w-40 flex-col gap-1 text-caption text-text-faint">
                      Provider
                      <select
                        value={draft().provider}
                        aria-label={tr("artifactsArtifactProvider")}
                        onChange={(event) => setEditor({ ...draft(), provider: event.currentTarget.value })}
                        class="h-control-md rounded-md border border-border-base bg-bg-layer-01 px-2 text-body text-text-base outline-none"
                      >
                        <For each={providers()}>
                          {(provider) => (
                            <option value={provider.id}>{provider.name || provider.id}</option>
                          )}
                        </For>
                      </select>
                    </label>
                  </Show>
                </div>

                <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
                  <For each={draft().files}>
                    {(file, index) => (
                      <div class="rounded-md border border-border-base bg-bg-layer-01 p-2">
                        <div class="flex items-center gap-2">
                          <Input
                            value={file.name}
                            placeholder="path/to/file"
                            aria-label={`File ${index() + 1} name`}
                            onInput={(event) => updateFile(index(), { name: event.currentTarget.value })}
                            class="select-text font-mono"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-xs"
                            aria-label={`Remove file ${index() + 1}`}
                            onClick={() => removeFile(index())}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                        <textarea
                          value={file.content}
                          spellcheck={false}
                          aria-label={`File ${index() + 1} content`}
                          onInput={(event) => updateFile(index(), { content: event.currentTarget.value })}
                          class="mt-2 min-h-32 w-full resize-y rounded-xs border border-border-base bg-bg-base p-2 font-mono text-meta leading-5 text-text-base outline-none select-text"
                        />
                      </div>
                    )}
                  </For>
                  <Button type="button" variant="outline" size="sm" class="self-start" onClick={addFile}>
                    <Plus />
                    {tr("dialogAddFile")}
                  </Button>
                </div>

                <div class="flex shrink-0 justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving()}
                    onClick={() => setEditor(undefined)}
                  >
                    Cancel
                  </Button>
                  <Button type="button" size="sm" disabled={saving()} onClick={() => void save()}>
                    {saving() ? tr("saving") : draft().id ? tr("saveChanges") : tr("createArtifact")}
                  </Button>
                </div>
              </div>
            )}
          </Show>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget() !== undefined}
        title={tr("artifactsDeleteArtifact")}
        description={`Delete "${deleteTarget()?.title || deleteTarget()?.id || ""}"? Its files are removed from disk.`}
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
