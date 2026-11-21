import { Show, createEffect, createSignal } from "solid-js";
import { Copy, Cpu, Save } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../../lib/api";
import { environmentExportName, serializeEnvironment } from "../../lib/environmentExport";
import { messageOf } from "../../lib/errors";
import type { SessionEnvironment } from "@lingzhu/ui/types";
import { RefreshButton, ErrorBanner, DetailRow } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";
import { t } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  sessionID?: string;
  title?: string;
  onOpenChange: (open: boolean) => void;
}

/** Read-only runtime environment of one session. */
export function EnvironmentDialog(props: Props) {
  const [env, setEnv] = createSignal<SessionEnvironment>();
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [copied, setCopied] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [notice, setNotice] = createSignal("");

  const load = async () => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    setLoading(true);
    setError("");
    try {
      setEnv(await api.environment(workspace, sessionID));
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
      setEnv(undefined);
      setError("");
      setCopied("");
      setSaving(false);
      setNotice("");
    }
  });

  const saveEnvironment = async () => {
    const current = env();
    if (!current) return;
    setSaving(true);
    try {
      const path = await api.saveTextFile(
        environmentExportName(current.id),
        serializeEnvironment({ environment: current }),
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
              <Cpu class="size-4 text-text-faint" />
              {t("environmentTitle")}
            </DialogTitle>
            <DialogDescription class="truncate">{props.title || props.sessionID}</DialogDescription>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving() || !env()}
              onClick={() => void saveEnvironment()}
            >
              <Save />
              {saving() ? t("saving") : t("dialogSaveFile")}
            </Button>
            <RefreshButton loading={loading()} onRefresh={() => void load()} />
          </div>
        </div>

        <ErrorBanner error={error()} class="mt-3" />
        <NoticeBanner notice={notice()} mono />

        <Show
          when={env()}
          fallback={
            <p class="mt-4 text-meta text-text-faint">{loading() ? t("loading") : t("noEnvironmentData")}</p>
          }
        >
          {(current) => (
            <>
              <div class="mt-4 rounded-md border border-border-base">
                <DetailRow label={t("sessionLabel")} value={current().id} />
                <DetailRow label={t("workdir")} value={current().workdir || t("processDirectory")} />
                <DetailRow label={t("shellLabel")} value={current().shell.join(" ")} />
                <DetailRow label={t("runningLabel")} value={current().running ? t("yes") : t("no")} />
                <DetailRow label={t("providerLabel")} value={current().provider} />
                <DetailRow label={t("modelLabel")} value={current().model} />
                <DetailRow label={t("agent")} value={current().agent || t("defaultValue")} />
                <DetailRow label={t("platform")} value={`${current().os}/${current().arch}`} />
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <Show when={current().workdir}>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => void copy(current().workdir)}
                  >
                    <Copy />
                    {copied() === current().workdir ? t("copied") : t("copyWorkdir")}
                  </Button>
                </Show>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => void copy(current().shell.join(" "))}
                >
                  <Copy />
                  {copied() === current().shell.join(" ") ? t("copied") : t("copyShell")}
                </Button>
              </div>
            </>
          )}
        </Show>
      </DialogContent>
    </Dialog>
  );
}
