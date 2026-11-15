import { useEffect, useState } from "react";
import { Copy, FolderCog, Save } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
import { projectExportName, serializeProject } from "../lib/projectExport";
import type { ProjectInfo, SessionLocation } from "@lingzhu/ui/types";
import { RefreshButton, ErrorBanner, DetailRow } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";

interface Props {
  open: boolean;
  workspace?: string;
  sessionID?: string;
  name?: string;
  onOpenChange: (open: boolean) => void;
}

/** Workspace metadata plus the active session's model and permissions. */
export function ProjectDialog({ open, workspace, sessionID, name, onOpenChange }: Props) {
  const [project, setProject] = useState<ProjectInfo>();
  const [location, setLocation] = useState<SessionLocation>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const load = async () => {
    if (!workspace) return;
    setLoading(true);
    setError("");
    try {
      const info = await api.project(workspace);
      setProject(info);
      if (sessionID) {
        try {
          setLocation(await api.location(workspace, sessionID));
        } catch {
          setLocation(undefined);
        }
      } else {
        setLocation(undefined);
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
      setProject(undefined);
      setLocation(undefined);
      setError("");
      setCopied("");
      setSaving(false);
      setNotice("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace, sessionID]);

  const saveProject = async () => {
    if (!workspace || !project) return;
    setSaving(true);
    try {
      const path = await api.saveTextFile(
        projectExportName(project.name || name || workspace),
        serializeProject({ workspace, project, location }),
      );
      if (path) {
        setNotice(`Saved ${path}`);
        setError("");
      }
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      window.setTimeout(() => setCopied(""), 1500);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <FolderCog className="size-4 text-text-faint" />
              Project
            </DialogTitle>
            <DialogDescription className="truncate">{name || workspace}</DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving || !project}
              onClick={() => void saveProject()}
            >
              <Save />
              {saving ? "Saving…" : "Save file"}
            </Button>
            <RefreshButton loading={loading} onRefresh={() => void load()} />
          </div>
        </div>

        <ErrorBanner error={error} className="mt-3" />
        <NoticeBanner notice={notice} mono />

        {project ? (
          <>
            <div className="mt-4 rounded-md border border-border-base">
              <DetailRow label="Directory" value={project.directory} />
              <DetailRow label="Config" value={project.config || "not loaded from a file"} />
              <DetailRow label="Instructions" value={project.instructions || "no AGENTS.md"} />
              <DetailRow label="Sessions" value={String(project.sessions)} />
              <DetailRow
                label="VCS"
                value={
                  project.vcs
                    ? `${project.vcs.provider} · ${project.vcs.branch.current || project.vcs.branch.default || "detached"}`
                    : "not a git repository"
                }
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => void copy(project.directory)}
              >
                <Copy />
                {copied === project.directory ? "Copied" : "Copy directory"}
              </Button>
              {project.config && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => void copy(project.config ?? "")}
                >
                  <Copy />
                  {copied === project.config ? "Copied" : "Copy config path"}
                </Button>
              )}
            </div>

            <div className="mt-4">
              <p className="text-caption text-text-faint">Session location</p>
              {location ? (
                <>
                  <div className="mt-2 rounded-md border border-border-base">
                    <DetailRow label="Session" value={location.sessionId} />
                    <DetailRow label="Provider" value={location.provider} />
                    <DetailRow label="Model" value={location.model} />
                    <DetailRow label="Agent" value={location.agent || "default"} />
                  </div>
                  <div className="mt-2 rounded-md border border-border-base">
                    {location.permissions.length === 0 ? (
                      <p className="p-3 text-meta text-text-faint">No permission rules.</p>
                    ) : (
                      location.permissions.map((rule, index) => (
                        <div
                          key={`${rule.action}:${rule.resource}:${index}`}
                          className="flex items-center gap-2 border-b border-border-base px-3 py-1.5 text-meta last:border-b-0"
                        >
                          <span
                            className={`shrink-0 rounded-xs border border-border-base px-1 text-caption ${
                              rule.effect === "deny" ? "text-state-fg-danger" : "text-state-fg-success"
                            }`}
                          >
                            {rule.effect}
                          </span>
                          <span className="shrink-0 font-mono text-caption text-text-muted">
                            {rule.action}
                          </span>
                          <span className="min-w-0 truncate font-mono text-caption text-text-faint">
                            {rule.resource}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <p className="mt-2 text-meta text-text-faint">
                  {sessionID
                    ? "Location is unavailable for this session."
                    : "Open a session in this workspace to see its model and permissions."}
                </p>
              )}
            </div>
          </>
        ) : (
          <p className="mt-4 text-meta text-text-faint">{loading ? "Loading…" : "No project metadata."}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
