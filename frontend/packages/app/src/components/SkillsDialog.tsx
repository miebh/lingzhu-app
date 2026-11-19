import { useEffect, useState } from "react";
import { Play, Sparkles } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { Textarea } from "@lingzhu/ui/textarea";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
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
export function SkillsDialog({ open, workspace, sessionID, title, skillID, create, onOpenChange }: Props) {
  const tr = useT();
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [name, setName] = useState(skillID ?? "");
  const [args, setArgs] = useState("");
  const [detail, setDetail] = useState<SkillDetail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [preview, setPreview] = useState<FileContent & { error?: string }>();
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sourceErrors, setSourceErrors] = useState<{ url: string; error: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(Boolean(create));
  const [newID, setNewID] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadDetail = async (id: string) => {
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
    if (!workspace) return;
    setLoading(true);
    try {
      if (rescan) await api.refreshSkills(workspace);
      const [next, errors] = await Promise.all([api.skills(workspace), api.skillErrors(workspace)]);
      setSkills(next);
      setSourceErrors(errors);
      const wanted = (preferred ?? name).trim();
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
    if (!workspace) return;
    const id = newID.trim();
    if (!id) {
      setError("Skill id is required.");
      return;
    }
    setBusy(true);
    try {
      await api.createSkill(workspace, id, newName.trim() || id, newDescription.trim());
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
    if (!workspace || !name.trim()) return;
    if (!window.confirm(`Delete skill "${name.trim()}" and its folder?`)) return;
    setBusy(true);
    try {
      await api.deleteSkill(workspace, name.trim());
      setNotice(`Skill "${name.trim()}" deleted`);
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

  useEffect(() => {
    if (open) {
      setName(skillID ?? "");
      setCreating(Boolean(create));
      void load(false, skillID);
      // The core watches skill roots; poll the catalog so new or removed
      // skills appear without closing the dialog.
      const timer = window.setInterval(() => {
        if (!workspace) return;
        void api
          .skills(workspace)
          .then(setSkills)
          .catch(() => undefined);
      }, 3000);
      return () => window.clearInterval(timer);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace, skillID, create]);

  const openPreview = async (path: string) => {
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
    if (!workspace || !sessionID) return;
    const id = name.trim();
    if (!id) {
      setError("Skill name is required.");
      return;
    }
    setBusy(true);
    try {
      await api.skill(workspace, sessionID, id, args.trim());
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" height="body" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-text-faint" />
              Skills
            </DialogTitle>
            <DialogDescription className="truncate">
              {title ? `${title} · ` : ""}
              {skills.length} discovered
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="xs" onClick={() => setCreating((value) => !value)}>
              {creating ? "Cancel" : "New skill"}
            </Button>
            <RefreshButton loading={loading} onRefresh={() => void load(true)} />
          </div>
        </div>

        <ErrorBanner error={error} />
        <NoticeBanner notice={notice} shrink />
        {sourceErrors.length > 0 && (
          <div className="mt-2 rounded-md border border-border-base bg-bg-layer-01 px-3 py-2 text-caption text-state-fg-danger">
            {sourceErrors.map((item) => (
              <p key={`${item.url}:${item.error}`} className="break-all">
                {item.url ? `${item.url}: ` : ""}
                {item.error}
              </p>
            ))}
          </div>
        )}

        {creating && (
          <div className="mt-3 grid gap-2 rounded-md border border-border-base bg-bg-layer-01 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_auto]">
            <Input
              value={newID}
              aria-label={tr("skillNewID")}
              placeholder={tr("skillIDPlaceholder")}
              onChange={(event) => setNewID(event.target.value)}
              className="select-text font-mono"
            />
            <Input
              value={newName}
              aria-label={tr("skillNewName")}
              placeholder={tr("skillNamePlaceholder")}
              onChange={(event) => setNewName(event.target.value)}
              className="select-text"
            />
            <Input
              value={newDescription}
              aria-label={tr("skillNewDescription")}
              placeholder={tr("skillDescriptionPlaceholder")}
              onChange={(event) => setNewDescription(event.target.value)}
              className="select-text"
            />
            <Button type="button" size="sm" disabled={busy || !newID.trim()} onClick={() => void createSkill()}>
              Create
            </Button>
          </div>
        )}

        <div className="mt-4 grid min-h-0 flex-1 gap-3 md:grid-cols-2">
          <div className="min-h-0 overflow-auto rounded-md border border-border-base">
            {skills.length === 0 ? (
              <p className="p-3 text-meta text-text-faint">
                {loading ? "Loading…" : "No skills discovered for this workspace."}
              </p>
            ) : (
              skills.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => selectSkill(skill.id)}
                  className={`interactive flex w-full flex-col gap-0.5 border-b border-border-base px-3 py-2 text-left last:border-b-0 ${
                    name === skill.id ? "bg-bg-layer-02" : "hover:bg-bg-layer-01"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-body text-text-base">{skill.name || skill.id}</span>
                    <span className="font-mono text-caption text-text-faint">{skill.id}</span>
                    {skill.autoinvoke === false && (
                      <span className="text-caption text-text-faint">manual</span>
                    )}
                  </span>
                  {skill.description && (
                    <span className="text-caption text-text-faint">{skill.description}</span>
                  )}
                </button>
              ))
            )}
          </div>

          <div className="flex min-h-0 min-w-0 flex-col gap-2 overflow-auto">
            <div className="rounded-md border border-border-base bg-bg-layer-01 p-2">
              <div className="flex items-baseline gap-2">
                <p className="min-w-0 flex-1 truncate text-body text-text-base">
                  {detail?.name || name || "No skill selected"}
                </p>
                {detail?.autoinvoke && (
                  <span className="shrink-0 text-caption text-state-fg-success">auto</span>
                )}
                {name.trim() && (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="shrink-0"
                    disabled={busy}
                    onClick={() => void deleteSkill()}
                  >
                    Delete
                  </Button>
                )}
              </div>
              {detail?.description && (
                <p className="mt-1 text-caption text-text-faint">{detail.description}</p>
              )}
              {detail?.path && (
                <button
                  type="button"
                  onClick={() => void openPreview(detail.path)}
                  className="interactive mt-1 block max-w-full break-all text-left font-mono text-caption text-text-faint hover:text-text-base"
                  title={detail.path}
                >
                  {detail.path}
                </button>
              )}
              {detailLoading && <p className="mt-2 text-meta text-text-faint">Loading…</p>}
              {detail?.files && detail.files.length > 0 && (
                <div className="mt-2">
                  <p className="text-caption text-text-faint">Files</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {detail.files.map((file) => (
                      <button
                        key={file}
                        type="button"
                        onClick={() => void openPreview(file)}
                        title={file}
                        className="interactive rounded border border-border-base px-1 py-0.5 font-mono text-caption text-text-muted hover:text-text-base"
                      >
                        {file.split(/[\\/]/).pop()}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <p className="mt-2 text-caption text-text-faint">Instructions</p>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-caption leading-5 text-text-muted select-text">
                {detail?.content || "Select a skill to preview its instructions."}
              </pre>
            </div>

            {(previewLoading || preview) && (
              <div className="rounded-md border border-border-base bg-bg-layer-01 p-2">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate font-mono text-caption text-text-muted">
                    {preview?.path || "Loading…"}
                  </p>
                  {preview?.path && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => void reveal(preview.path)}
                    >
                      {tr("revealInFileExplorer")}
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="xs" onClick={() => setPreview(undefined)}>
                    Close
                  </Button>
                </div>
                {previewLoading ? (
                  <p className="mt-2 text-meta text-text-faint">Loading…</p>
                ) : preview?.error ? (
                  <p className="mt-2 text-caption text-state-fg-danger">{preview.error}</p>
                ) : preview?.binary ? (
                  <p className="mt-2 text-meta text-text-faint">Binary file ({preview.size} bytes).</p>
                ) : (
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-caption leading-5 text-text-muted select-text">
                    {preview?.content || "Empty file."}
                    {preview?.truncated ? "\n\n[truncated]" : ""}
                  </pre>
                )}
              </div>
            )}

            <label className="flex flex-col gap-1 text-caption text-text-faint">
              {tr("dialogSkillNameOrId")}
              <Input
                value={name}
                aria-label={tr("skillsSkillName")}
                placeholder={tr("dialogSkillExample")}
                onChange={(event) => setName(event.target.value)}
                onBlur={() => void loadDetail(name)}
                className="select-text font-mono"
              />
            </label>
            <label className="flex flex-col gap-1 text-caption text-text-faint">
              Arguments (optional)
              <Textarea
                value={args}
                aria-label={tr("skillsSkillArguments")}
                placeholder={tr("skillsExtraInstructionsAppendedToTheSkillPrompt")}
                onChange={(event) => setArgs(event.target.value)}
                className="min-h-20 select-text"
              />
            </label>
            <Button type="button" size="sm" className="self-end" disabled={busy} onClick={() => void invoke()}>
              <Play />
              {busy ? "Starting…" : "Run skill"}
            </Button>
            <p className="text-caption text-text-faint">
              The skill becomes a new user turn; its output appears in the chat.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
