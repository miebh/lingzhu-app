import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import { Clipboard, Download, FolderOpen, Save, Upload } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import type { SessionBundle, SessionInfo } from "@lingzhu/ui/types";
import { ErrorBanner } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  sessionID?: string;
  title?: string;
  onOpenChange: (open: boolean) => void;
  onImported?: (session: SessionInfo) => void;
}

function unwrap(text: string): SessionBundle {
  const parsed = JSON.parse(text) as SessionBundle | { bundle?: SessionBundle };
  const bundle = "bundle" in parsed && parsed.bundle ? parsed.bundle : (parsed as SessionBundle);
  if (!bundle || typeof bundle !== "object" || !bundle.id) {
    throw new Error("Bundle must include an id.");
  }
  return bundle;
}

/** Exports one session's bundle/Markdown and imports pasted bundles. */
export function TransferDialog(props: Props) {
  const tr = useT();
  const [bundle, setBundle] = createSignal<SessionBundle>();
  const [exportText, setExportText] = createSignal("");
  const [importText, setImportText] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [importing, setImporting] = createSignal(false);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [copied, setCopied] = createSignal("");

  createEffect(() => {
    if (!props.open) {
      setBundle(undefined);
      setExportText("");
      setImportText("");
      setError("");
      setNotice("");
      setCopied("");
      return;
    }
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    let alive = true;
    setLoading(true);
    setError("");
    api
      .exportBundle(workspace, sessionID)
      .then((value) => {
        if (!alive) return;
        setBundle(value);
        setExportText(JSON.stringify(value, null, 2));
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

  const copy = async (kind: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(""), 1500);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const copyMarkdown = async () => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    try {
      const markdown = await api.exportMarkdown(workspace, sessionID);
      await copy("markdown", markdown);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const fileName = (extension: string) => {
    const base = (props.title || props.sessionID || "session").replace(/[\\/:*?"<>|]+/g, "-").trim();
    return `${base || "session"}.${extension}`;
  };

  const saveBundle = async () => {
    if (!exportText()) return;
    try {
      const path = await api.saveTextFile(fileName("json"), exportText());
      if (path) setNotice(`Saved ${path}`);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const saveMarkdown = async () => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    try {
      const markdown = await api.exportMarkdown(workspace, sessionID);
      const path = await api.saveTextFile(fileName("md"), markdown);
      if (path) setNotice(`Saved ${path}`);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const loadBundle = async () => {
    try {
      const file = await api.pickTextFile("Open session bundle");
      if (!file.path) return;
      setImportText(file.content);
      setError("");
      setNotice(`Loaded ${file.name}`);
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    }
  };

  const runImport = async () => {
    if (!props.workspace) return;
    if (!importText().trim()) {
      setError("Paste a session bundle first.");
      return;
    }
    setImporting(true);
    try {
      const info = await api.importBundle(props.workspace, unwrap(importText()));
      setImportText("");
      setError("");
      setNotice(`Imported ${info.title || info.id}`);
      props.onImported?.(info);
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="wide" height="body" class="flex flex-col">
        <div>
          <DialogTitle class="flex items-center gap-2">
            <Download class="size-4 text-text-faint" />
            {tr("dialogSessionTransfer")}
          </DialogTitle>
          <DialogDescription class="truncate">
            {props.sessionID ? `${props.title || props.sessionID} · ` : ""}
            Save or copy a session bundle out, load a file, or paste one in
          </DialogDescription>
        </div>

        <ErrorBanner error={error()} />
        <NoticeBanner notice={notice()} shrink />

        <div class="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
          <Show when={props.sessionID}>
            <section class="flex min-h-0 flex-col">
              <div class="flex shrink-0 items-center gap-2">
                <p class="text-body text-text-base">{tr("transferExport")}</p>
                <span class="text-caption text-text-faint">
                  {bundle() ? tr("eventsCount", { count: bundle()!.events.length }) : loading() ? tr("loading") : ""}
                </span>
                <span class="ml-auto flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={!exportText()}
                    onClick={() => void copy("json", exportText())}
                  >
                    <Clipboard />
                    {copied() === "json" ? tr("copied") : tr("copyJson")}
                  </Button>
                  <Button type="button" variant="outline" size="xs" onClick={() => void copyMarkdown()}>
                    <Download />
                    {copied() === "markdown" ? tr("copied") : tr("copyMarkdown")}
                  </Button>
                  <Button type="button" variant="outline" size="xs" disabled={!exportText()} onClick={() => void saveBundle()}>
                    <Save />
                    {tr("dialogSaveJson")}
                  </Button>
                  <Button type="button" variant="outline" size="xs" onClick={() => void saveMarkdown()}>
                    <Save />
                    {tr("dialogSaveMd")}
                  </Button>
                </span>
              </div>
              <textarea
                readOnly
                value={exportText()}
                aria-label={tr("transferSessionBundleJSON")}
                placeholder={loading() ? tr("loadingBundle") : tr("openSessionToExport")}
                class="mt-2 min-h-40 resize-y rounded-md border border-border-base bg-bg-layer-01 p-2 font-mono text-caption leading-5 text-text-muted outline-none select-text"
              />
            </section>
          </Show>

          <section class="flex min-h-0 flex-col">
            <div class="flex shrink-0 items-center gap-2">
              <p class="text-body text-text-base">{tr("transferImport")}</p>
              <span class="text-caption text-text-faint">{tr("transferLoadBundle")}</span>
              <span class="ml-auto flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" disabled={importing()} onClick={() => void loadBundle()}>
                  <FolderOpen />
                  {tr("dialogLoadFile")}
                </Button>
                <Button type="button" size="sm" disabled={importing()} onClick={() => void runImport()}>
                  <Upload />
                  {importing() ? tr("importing") : tr("importSession")}
                </Button>
              </span>
            </div>
            <textarea
              value={importText()}
              aria-label={tr("transferImportBundleJSON")}
              onInput={(event) => setImportText(event.currentTarget.value)}
              placeholder='{"id":"s-...","title":"...","events":[...]}'
              class="mt-2 min-h-40 flex-1 resize-y rounded-md border border-border-base bg-bg-base p-2 font-mono text-caption leading-5 text-text-base outline-none select-text"
            />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
