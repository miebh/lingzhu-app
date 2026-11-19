import { useEffect, useState } from "react";
import { Play, Sparkles } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { Textarea } from "@lingzhu/ui/textarea";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
import type { SkillSummary } from "@lingzhu/ui/types";
import { RefreshButton, ErrorBanner } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  sessionID?: string;
  title?: string;
  onOpenChange: (open: boolean) => void;
}

/** Starts one discovered skill as a new turn with optional arguments. */
export function SkillsDialog({ open, workspace, sessionID, title, onOpenChange }: Props) {
  const tr = useT();
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [name, setName] = useState("");
  const [args, setArgs] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async (rescan = false) => {
    if (!workspace) return;
    setLoading(true);
    try {
      if (rescan) await api.refreshSkills(workspace);
      const next = await api.skills(workspace);
      setSkills(next);
      setName((current) => current || next[0]?.id || "");
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void load(false);
    } else {
      setSkills([]);
      setName("");
      setArgs("");
      setError("");
      setNotice("");
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace]);

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
          <RefreshButton loading={loading} onRefresh={() => void load(true)} />
        </div>

        <ErrorBanner error={error} />
        <NoticeBanner notice={notice} shrink />

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
                  onClick={() => setName(skill.id)}
                  className={`interactive flex w-full flex-col gap-0.5 border-b border-border-base px-3 py-2 text-left last:border-b-0 ${
                    name === skill.id ? "bg-bg-layer-02" : "hover:bg-bg-layer-01"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-body text-text-base">{skill.name || skill.id}</span>
                    <span className="font-mono text-caption text-text-faint">{skill.id}</span>
                  </span>
                  {skill.description && (
                    <span className="text-caption text-text-faint">{skill.description}</span>
                  )}
                </button>
              ))
            )}
          </div>

          <div className="flex min-h-0 min-w-0 flex-col gap-2">
            <label className="flex flex-col gap-1 text-caption text-text-faint">
              {tr("dialogSkillNameOrId")}
              <Input
                value={name}
                aria-label={tr("skillsSkillName")}
                placeholder={tr("dialogSkillExample")}
                onChange={(event) => setName(event.target.value)}
                className="select-text font-mono"
              />
            </label>
            <label className="flex min-h-0 flex-1 flex-col gap-1 text-caption text-text-faint">
              Arguments (optional)
              <Textarea
                value={args}
                aria-label={tr("skillsSkillArguments")}
                placeholder={tr("skillsExtraInstructionsAppendedToTheSkillPrompt")}
                onChange={(event) => setArgs(event.target.value)}
                className="min-h-24 flex-1 select-text"
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
