import { For, Show, createEffect, createSignal, onCleanup, untrack } from "solid-js";
import { Play, Sparkles } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { Textarea } from "@lingzhu/ui/textarea";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import type { FileContent, SkillDetail, SkillSummary } from "@lingzhu/ui/types";
import { RefreshButton, ErrorBanner } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  sessionID?: string;
  title?: string;
  /** One skill to select when the dialog opens. */
  skillID?: string;
  /** Opens the create form instead of selecting a skill. */
  create?: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Starts one discovered skill as a new turn with optional arguments. */
export function SkillsDialog(props: Props) {
  const tr = useT();
  const [skills, setSkills] = createSignal<SkillSummary[]>([]);
  const [name, setName] = createSignal(props.skillID ?? "");
  const [args, setArgs] = createSignal("");
  const [detail, setDetail] = createSignal<SkillDetail>();
  const [detailLoading, setDetailLoading] = createSignal(false);
  const [preview, setPreview] = createSignal<FileContent & { error?: string }>();
  const [previewLoading, setPreviewLoading] = createSignal(false);
  const [sourceErrors, setSourceErrors] = createSignal<{ url: string; error: string }[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [creating, setCreating] = createSignal(Boolean(props.create));
  const [newID, setNewID] = createSignal("");
  const [newName, setNewName] = createSignal("");
  const [newDescription, setNewDescription] = createSignal("");
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");

  const loadDetail = async (id: string) => {
    const workspace = props.workspace;
    if (!workspace || !id.trim()) {
      setDetail(undefined);
      return;
    }
    setDetailLoading(true);
    try {
      setDetail(await api.skillDetail(workspace, id.trim()));
      setError("");
    } catch (err) {
      setDetail(undefined);
      setError(messageOf(err));
    } finally {
      setDetailLoading(false);
    }
  };

  const load = async (rescan = false, preferred?: string) => {
    const workspace = props.workspace;
    if (!workspace) return;
    setLoading(true);
    try {
      if (rescan) await api.refreshSkills(workspace);
      const [next, errors] = await Promise.all([api.skills(workspace), api.skillErrors(workspace)]);
      setSkills(next);
      setSourceErrors(errors);
      const wanted = (preferred ?? untrack(name)).trim();
      const selected = (wanted && next.some((skill) => skill.id === wanted) ? wanted : "") || next[0]?.id || "";
      setName(selected);
      setError("");
      if (selected) await loadDetail(selected);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  const selectSkill = (id: string) => {
    setName(id);
    setPreview(undefined);
    void loadDetail(id);
  };

  const createSkill = async () => {
    const workspace = props.workspace;
    if (!workspace) return;
    const id = newID().trim();
    if (!id) {
      setError("Skill id is required.");
      return;
    }
    setBusy(true);
    try {
      await api.createSkill(workspace, id, newName().trim() || id, newDescription().trim());
      setCreating(false);
      setNewID("");
      setNewName("");
      setNewDescription("");
      setNotice(`Skill "${id}" created`);
      setName(id);
      await load(false);
      setError("");
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const deleteSkill = async () => {
    const workspace = props.workspace;
    if (!workspace || !name().trim()) return;
    if (!window.confirm(`Delete skill "${name().trim()}" and its folder?`)) return;
    setBusy(true);
    try {
      await api.deleteSkill(workspace, name().trim());
      setNotice(`Skill "${name().trim()}" deleted`);
      setName("");
      setDetail(undefined);
      await load(false);
      setError("");
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  createEffect(() => {
    if (props.open) {
      setName(props.skillID ?? "");
      setCreating(Boolean(props.create));
      void load(false, props.skillID);
      // The core watches skill roots; poll the catalog so new or removed
      // skills appear without closing the dialog.
      const workspace = props.workspace;
      const timer = window.setInterval(() => {
        if (!workspace) return;
        void api
          .skills(workspace)
          .then((next) => setSkills(next))
          .catch(() => undefined);
      }, 3000);
      onCleanup(() => window.clearInterval(timer));
      return;
    }
    setSkills([]);
    setName("");
    setArgs("");
    setDetail(undefined);
    setPreview(undefined);
    setSourceErrors([]);
    setError("");
    setNotice("");
    setBusy(false);
    setCreating(false);
    setNewID("");
    setNewName("");
    setNewDescription("");
  });

  const openPreview = async (path: string) => {
    const workspace = props.workspace;
    if (!workspace || !path) return;
    setPreview(undefined);
    setPreviewLoading(true);
    try {
      const file = await api.fileContent(workspace, path);
      setPreview(file);
      setError("");
    } catch (err) {
      setPreview({
        path,
        content: "",
        truncated: false,
        binary: false,
        size: 0,
        error: messageOf(err),
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const reveal = async (path: string) => {
    if (!path) return;
    try {
      await api.revealPath(path);
      setNotice(`Opened ${path}`);
      setError("");
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    }
  };

  const invoke = async () => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    const id = name().trim();
    if (!id) {
      setError("Skill name is required.");
      return;
    }
    setBusy(true);
    try {
      await api.skill(workspace, sessionID, id, args().trim());
      setNotice(`Skill "${id}" started`);
      setError("");
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="wide" height="body" class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle class="flex items-center gap-2">
              <Sparkles class="size-4 text-text-faint" />
              Skills
            </DialogTitle>
            <DialogDescription class="truncate">
              {props.title ? `${props.title} · ` : ""}
              {skills().length} discovered
            </DialogDescription>
          </div>
          <div class="flex items-center gap-2">
            <Button type="button" variant="outline" size="xs" onClick={() => setCreating(!creating())}>
              {creating() ? tr("cancel") : tr("newSkill")}
            </Button>
            <RefreshButton loading={loading()} onRefresh={() => void load(true)} />
          </div>
        </div>

        <ErrorBanner error={error()} />
        <NoticeBanner notice={notice()} shrink />
        <Show when={sourceErrors().length > 0}>
          <div class="mt-2 rounded-md border border-border-base bg-bg-layer-01 px-3 py-2 text-caption text-state-fg-danger">
            <For each={sourceErrors()}>
              {(item) => (
                <p class="break-all">
                  {item.url ? `${item.url}: ` : ""}
                  {item.error}
                </p>
              )}
            </For>
          </div>
        </Show>

        <Show when={creating()}>
          <div class="mt-3 grid gap-2 rounded-md border border-border-base bg-bg-layer-01 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_auto]">
            <Input
              value={newID()}
              aria-label={tr("skillNewID")}
              placeholder={tr("skillIDPlaceholder")}
              onInput={(event) => setNewID(event.currentTarget.value)}
              class="select-text font-mono"
            />
            <Input
              value={newName()}
              aria-label={tr("skillNewName")}
              placeholder={tr("skillNamePlaceholder")}
              onInput={(event) => setNewName(event.currentTarget.value)}
              class="select-text"
            />
            <Input
              value={newDescription()}
              aria-label={tr("skillNewDescription")}
              placeholder={tr("skillDescriptionPlaceholder")}
              onInput={(event) => setNewDescription(event.currentTarget.value)}
              class="select-text"
            />
            <Button type="button" size="sm" disabled={busy() || !newID().trim()} onClick={() => void createSkill()}>
              Create
            </Button>
          </div>
        </Show>

        <div class="mt-4 grid min-h-0 flex-1 gap-3 md:grid-cols-2">
          <div class="min-h-0 overflow-auto rounded-md border border-border-base">
            <Show
              when={skills().length > 0}
              fallback={
                <p class="p-3 text-meta text-text-faint">
                  {loading() ? tr("loading") : tr("noSkills")}
                </p>
              }
            >
              <For each={skills()}>
                {(skill) => (
                  <button
                    type="button"
                    onClick={() => selectSkill(skill.id)}
                    class={`interactive flex w-full flex-col gap-0.5 border-b border-border-base px-3 py-2 text-left last:border-b-0 ${
                      name() === skill.id ? "bg-bg-layer-02" : "hover:bg-bg-layer-01"
                    }`}
                  >
                    <span class="flex items-center gap-2">
                      <span class="text-body text-text-base">{skill.name || skill.id}</span>
                      <span class="font-mono text-caption text-text-faint">{skill.id}</span>
                      <Show when={skill.autoinvoke === false}>
                        <span class="text-caption text-text-faint">{tr("skillManual")}</span>
                      </Show>
                    </span>
                    <Show when={skill.description}>
                      <span class="text-caption text-text-faint">{skill.description}</span>
                    </Show>
                  </button>
                )}
              </For>
            </Show>
          </div>

          <div class="flex min-h-0 min-w-0 flex-col gap-2 overflow-auto">
            <div class="rounded-md border border-border-base bg-bg-layer-01 p-2">
              <div class="flex items-baseline gap-2">
                <p class="min-w-0 flex-1 truncate text-body text-text-base">
                  {detail()?.name || name() || "No skill selected"}
                </p>
                <Show when={detail()?.autoinvoke}>
                  <span class="shrink-0 text-caption text-state-fg-success">{tr("skillAuto")}</span>
                </Show>
                <Show when={name().trim()}>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    class="shrink-0"
                    disabled={busy()}
                    onClick={() => void deleteSkill()}
                  >
                    Delete
                  </Button>
                </Show>
              </div>
              <Show when={detail()?.description}>
                <p class="mt-1 text-caption text-text-faint">{detail()!.description}</p>
              </Show>
              <Show when={detail()?.path}>
                {(path) => (
                  <button
                    type="button"
                    onClick={() => void openPreview(path())}
                    class="interactive mt-1 block max-w-full break-all text-left font-mono text-caption text-text-faint hover:text-text-base"
                    title={path()}
                  >
                    {path()}
                  </button>
                )}
              </Show>
              <Show when={detailLoading()}>
                <p class="mt-2 text-meta text-text-faint">{tr("loading")}</p>
              </Show>
              <Show when={detail()?.files && detail()!.files!.length > 0}>
                <div class="mt-2">
                  <p class="text-caption text-text-faint">{tr("skillFiles")}</p>
                  <div class="mt-1 flex flex-wrap gap-1">
                    <For each={detail()?.files ?? []}>
                      {(file) => (
                        <button
                          type="button"
                          onClick={() => void openPreview(file)}
                          title={file}
                          class="interactive rounded border border-border-base px-1 py-0.5 font-mono text-caption text-text-muted hover:text-text-base"
                        >
                          {file.split(/[\\/]/).pop()}
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
              <p class="mt-2 text-caption text-text-faint">{tr("skillInstructions")}</p>
              <pre class="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-caption leading-5 text-text-muted select-text">
                {detail()?.content || "Select a skill to preview its instructions."}
              </pre>
            </div>

            <Show when={previewLoading() || preview()}>
              <div class="rounded-md border border-border-base bg-bg-layer-01 p-2">
                <div class="flex items-center gap-2">
                  <p class="min-w-0 flex-1 truncate font-mono text-caption text-text-muted">
                    {preview()?.path || tr("loading")}
                  </p>
                  <Show when={preview()?.path}>
                    {(path) => (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => void reveal(path())}
                      >
                        {tr("revealInFileExplorer")}
                      </Button>
                    )}
                  </Show>
                  <Button type="button" variant="ghost" size="xs" onClick={() => setPreview(undefined)}>
                    Close
                  </Button>
                </div>
                <Show
                  when={!previewLoading()}
                  fallback={<p class="mt-2 text-meta text-text-faint">{tr("loading")}</p>}
                >
                  <Show
                    when={!preview()?.error}
                    fallback={<p class="mt-2 text-caption text-state-fg-danger">{preview()!.error}</p>}
                  >
                    <Show
                      when={!preview()?.binary}
                      fallback={
                        <p class="mt-2 text-meta text-text-faint">Binary file ({preview()!.size} bytes).</p>
                      }
                    >
                      <pre class="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-caption leading-5 text-text-muted select-text">
                        {preview()?.content || "Empty file."}
                        {preview()?.truncated ? "\n\n[truncated]" : ""}
                      </pre>
                    </Show>
                  </Show>
                </Show>
              </div>
            </Show>

            <label class="flex flex-col gap-1 text-caption text-text-faint">
              {tr("dialogSkillNameOrId")}
              <Input
                value={name()}
                aria-label={tr("skillsSkillName")}
                placeholder={tr("dialogSkillExample")}
                onInput={(event) => setName(event.currentTarget.value)}
                onBlur={() => void loadDetail(name())}
                class="select-text font-mono"
              />
            </label>
            <label class="flex flex-col gap-1 text-caption text-text-faint">
              Arguments (optional)
              <Textarea
                value={args()}
                aria-label={tr("skillsSkillArguments")}
                placeholder={tr("skillsExtraInstructionsAppendedToTheSkillPrompt")}
                onInput={(event) => setArgs(event.currentTarget.value)}
                class="min-h-20 select-text"
              />
            </label>
            <Button type="button" size="sm" class="self-end" disabled={busy()} onClick={() => void invoke()}>
              <Play />
              {busy() ? tr("startingNow") : tr("runSkill")}
            </Button>
            <p class="text-caption text-text-faint">
              The skill becomes a new user turn; its output appears in the chat.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
