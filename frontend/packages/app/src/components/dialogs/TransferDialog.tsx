import { useEffect, useState } from "react";
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
export function TransferDialog({ open, workspace, sessionID, title, onOpenChange, onImported }: Props) {
  const tr = useT();
  const [bundle, setBundle] = useState<SessionBundle>();
  const [exportText, setExportText] = useState("");
  const [importText, setImportText] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!open) {
      setBundle(undefined);
      setExportText("");
      setImportText("");
      setError("");
      setNotice("");
      setCopied("");
      return;
    }
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
    return () => {
      alive = false;
    };
  }, [open, workspace, sessionID]);

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
    if (!workspace || !sessionID) return;
    try {
      const markdown = await api.exportMarkdown(workspace, sessionID);
      await copy("markdown", markdown);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const fileName = (extension: string) => {
    const base = (title || sessionID || "session").replace(/[\\/:*?"<>|]+/g, "-").trim();
    return `${base || "session"}.${extension}`;
  };

  const saveBundle = async () => {
    if (!exportText) return;
    try {
      const path = await api.saveTextFile(fileName("json"), exportText);
      if (path) setNotice(`Saved ${path}`);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const saveMarkdown = async () => {
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
    if (!workspace) return;
    if (!importText.trim()) {
      setError("Paste a session bundle first.");
      return;
    }
    setImporting(true);
    try {
      const info = await api.importBundle(workspace, unwrap(importText));
      setImportText("");
      setError("");
      setNotice(`Imported ${info.title || info.id}`);
      onImported?.(info);
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" height="body" className="flex flex-col">
        <div>
          <DialogTitle className="flex items-center gap-2">
            <Download className="size-4 text-text-faint" />
            {tr("dialogSessionTransfer")}
          </DialogTitle>
          <DialogDescription className="truncate">
            {sessionID ? `${title || sessionID} · ` : ""}
            Save or copy a session bundle out, load a file, or paste one in
          </DialogDescription>
        </div>

        <ErrorBanner error={error} />
        <NoticeBanner notice={notice} shrink />

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
          {sessionID && (
            <section className="flex min-h-0 flex-col">
              <div className="flex shrink-0 items-center gap-2">
                <p className="text-body text-text-base">Export</p>
                <span className="text-caption text-text-faint">
                  {bundle ? `${bundle.events.length} events` : loading ? "loading…" : ""}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={!exportText}
                    onClick={() => void copy("json", exportText)}
                  >
                    <Clipboard />
                    {copied === "json" ? "Copied" : "Copy JSON"}
                  </Button>
                  <Button type="button" variant="outline" size="xs" onClick={() => void copyMarkdown()}>
                    <Download />
                    {copied === "markdown" ? "Copied" : "Copy Markdown"}
                  </Button>
                  <Button type="button" variant="outline" size="xs" disabled={!exportText} onClick={() => void saveBundle()}>
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
                value={exportText}
                aria-label={tr("transferSessionBundleJSON")}
                placeholder={loading ? "Loading bundle…" : "Open a session to export"}
                className="mt-2 min-h-40 resize-y rounded-md border border-border-base bg-bg-layer-01 p-2 font-mono text-caption leading-5 text-text-muted outline-none select-text"
              />
            </section>
          )}

          <section className="flex min-h-0 flex-col">
            <div className="flex shrink-0 items-center gap-2">
              <p className="text-body text-text-base">Import</p>
              <span className="text-caption text-text-faint">Load a bundle JSON or paste one</span>
              <span className="ml-auto flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" disabled={importing} onClick={() => void loadBundle()}>
                  <FolderOpen />
                  {tr("dialogLoadFile")}
                </Button>
                <Button type="button" size="sm" disabled={importing} onClick={() => void runImport()}>
                  <Upload />
                  {importing ? "Importing…" : "Import session"}
                </Button>
              </span>
            </div>
            <textarea
              value={importText}
              aria-label={tr("transferImportBundleJSON")}
              onChange={(event) => setImportText(event.target.value)}
              placeholder='{"id":"s-...","title":"...","events":[...]}'
              className="mt-2 min-h-40 flex-1 resize-y rounded-md border border-border-base bg-bg-base p-2 font-mono text-caption leading-5 text-text-base outline-none select-text"
            />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
