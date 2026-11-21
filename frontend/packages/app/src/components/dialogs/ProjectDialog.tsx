import { For, Show, createEffect, createSignal } from "solid-js";
import { Copy, FolderCog, Save } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { projectExportName, serializeProject } from "../../lib/projectExport";
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
export function ProjectDialog(props: Props) {
  const [project, setProject] = createSignal<ProjectInfo>();
  const [location, setLocation] = createSignal<SessionLocation>();
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [copied, setCopied] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [notice, setNotice] = createSignal("");

  const load = async () => {
    const workspace = props.workspace;
    if (!workspace) return;
    setLoading(true);
    setError("");
    try {
      const info = await api.project(workspace);
      setProject(info);
      const sessionID = props.sessionID;
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

  createEffect(() => {
    if (props.open) {
      void props.workspace;
      void props.sessionID;
      void load();
    } else {
      setProject(undefined);
      setLocation(undefined);
      setError("");
      setCopied("");
      setSaving(false);
      setNotice("");
    }
  });

  const saveProject = async () => {
    const workspace = props.workspace;
    const info = project();
    if (!workspace || !info) return;
    setSaving(true);
    try {
      const path = await api.saveTextFile(
        projectExportName(info.name || props.name || workspace),
        serializeProject({ workspace, project: info, location: location() }),
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
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="wide" class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle class="flex items-center gap-2">
              <FolderCog class="size-4 text-text-faint" />
              Project
            </DialogTitle>
            <DialogDescription class="truncate">{props.name || props.workspace}</DialogDescription>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving() || !project()}
              onClick={() => void saveProject()}
            >
              <Save />
              {saving() ? "Saving…" : "Save file"}
            </Button>
            <RefreshButton loading={loading()} onRefresh={() => void load()} />
          </div>
        </div>

        <ErrorBanner error={error()} class="mt-3" />
        <NoticeBanner notice={notice()} mono />

        <Show
          when={project()}
          fallback={
            <p class="mt-4 text-meta text-text-faint">{loading() ? "Loading…" : "No project metadata."}</p>
          }
        >
          {(current) => (
            <>
              <div class="mt-4 rounded-md border border-border-base">
                <DetailRow label="Directory" value={current().directory} />
                <DetailRow label="Config" value={current().config || "not loaded from a file"} />
                <DetailRow label="Instructions" value={current().instructions || "no AGENTS.md"} />
                <DetailRow label="Sessions" value={String(current().sessions)} />
                <DetailRow
                  label="VCS"
                  value={
                    current().vcs
                      ? `${current().vcs!.provider} · ${current().vcs!.branch.current || current().vcs!.branch.default || "detached"}`
                      : "not a git repository"
                  }
                />
              </div>

              <div class="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => void copy(current().directory)}
                >
                  <Copy />
                  {copied() === current().directory ? "Copied" : "Copy directory"}
                </Button>
                <Show when={current().config}>
                  {(configPath) => (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => void copy(configPath())}
                    >
                      <Copy />
                      {copied() === configPath() ? "Copied" : "Copy config path"}
                    </Button>
                  )}
                </Show>
              </div>

              <div class="mt-4">
                <p class="text-caption text-text-faint">Session location</p>
                <Show
                  when={location()}
                  fallback={
                    <p class="mt-2 text-meta text-text-faint">
                      {props.sessionID
                        ? "Location is unavailable for this session."
                        : "Open a session in this workspace to see its model and permissions."}
                    </p>
                  }
                >
                  {(spot) => (
                    <>
                      <div class="mt-2 rounded-md border border-border-base">
                        <DetailRow label="Session" value={spot().sessionId} />
                        <DetailRow label="Provider" value={spot().provider} />
                        <DetailRow label="Model" value={spot().model} />
                        <DetailRow label="Agent" value={spot().agent || "default"} />
                      </div>
                      <div class="mt-2 rounded-md border border-border-base">
                        <Show
                          when={spot().permissions.length > 0}
                          fallback={<p class="p-3 text-meta text-text-faint">No permission rules.</p>}
                        >
                          <For each={spot().permissions}>
                            {(rule) => (
                              <div class="flex items-center gap-2 border-b border-border-base px-3 py-1.5 text-meta last:border-b-0">
                                <span
                                  class={`shrink-0 rounded-xs border border-border-base px-1 text-caption ${
                                    rule.effect === "deny" ? "text-state-fg-danger" : "text-state-fg-success"
                                  }`}
                                >
                                  {rule.effect}
                                </span>
                                <span class="shrink-0 font-mono text-caption text-text-muted">
                                  {rule.action}
                                </span>
                                <span class="min-w-0 truncate font-mono text-caption text-text-faint">
                                  {rule.resource}
                                </span>
                              </div>
                            )}
                          </For>
                        </Show>
                      </div>
                    </>
                  )}
                </Show>
              </div>
            </>
          )}
        </Show>
      </DialogContent>
    </Dialog>
  );
}
