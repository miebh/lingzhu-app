import { useEffect, useState } from "react";
import { Clipboard, Download, Save } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../lib/api";
import {
  batchExportName,
  batchMarkdownName,
  combineMarkdown,
  serializeBundles,
  type BatchExportItem,
  type MarkdownPart,
} from "../lib/batchExport";
import { messageOf } from "../lib/errors";
import type { SessionBundle } from "@lingzhu/ui/types";
import { RefreshButton, ErrorBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  items: BatchExportItem[];
  onOpenChange: (open: boolean) => void;
}

interface Loaded {
  item: BatchExportItem;
  bundle?: SessionBundle;
  error?: string;
}

/** Collects exported bundles for several sessions into one copyable view. */
export function BatchExportDialog({ open, items, onOpenChange }: Props) {
  const tr = useT();
  const [entries, setEntries] = useState<Loaded[]>([]);
  const [selected, setSelected] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [saved, setSaved] = useState("");
  const [savingMarkdown, setSavingMarkdown] = useState(false);

  const load = async () => {
    if (!open || items.length === 0) return;
    setLoading(true);
    setError("");
    try {
      const loaded: Loaded[] = [];
      for (const item of items) {
        try {
          loaded.push({ item, bundle: await api.exportBundle(item.path, item.id) });
        } catch (err) {
          loaded.push({ item, error: messageOf(err) });
        }
      }
      setEntries(loaded);
      const first = loaded.find((entry) => entry.bundle);
      setSelected(first?.item.id);
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
      setEntries([]);
      setSelected(undefined);
      setError("");
      setCopied("");
      setSaved("");
      setSavingMarkdown(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items]);

  const current = entries.find((entry) => entry.item.id === selected && entry.bundle);

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(""), 1500);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const readyBundles = () => entries.flatMap((entry) => (entry.bundle ? [entry.bundle] : []));

  const copyAll = () => {
    void copy("all", serializeBundles(readyBundles()));
  };

  const saveAll = async () => {
    const bundles = readyBundles();
    if (bundles.length === 0) return;
    try {
      const path = await api.saveTextFile(batchExportName(bundles.length), serializeBundles(bundles));
      if (path) {
        setSaved(path);
        setError("");
      }
    } catch (err) {
      setSaved("");
      setError(messageOf(err));
    }
  };

  const saveMarkdown = async () => {
    const ready = entries.filter((entry) => entry.bundle);
    if (ready.length === 0) return;
    setSavingMarkdown(true);
    try {
      const parts: MarkdownPart[] = [];
      for (const entry of ready) {
        if (!entry.bundle) continue;
        parts.push({
          id: entry.item.id,
          title: entry.bundle.title,
          markdown: await api.exportMarkdown(entry.item.path, entry.item.id),
        });
      }
      const path = await api.saveTextFile(batchMarkdownName(parts.length), combineMarkdown(parts));
      if (path) {
        setSaved(path);
        setError("");
      }
    } catch (err) {
      setSaved("");
      setError(messageOf(err));
    } finally {
      setSavingMarkdown(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" height="body" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <Download className="size-4 text-text-faint" />
              {tr("dialogExportSessions")}
            </DialogTitle>
            <DialogDescription className="truncate">
              {entries.filter((entry) => entry.bundle).length}/{items.length} bundles ready
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void copyAll()}
            >
              <Clipboard />
              {copied === "all" ? "Copied" : "Copy all"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || entries.every((entry) => !entry.bundle)}
              onClick={() => void saveAll()}
            >
              <Save />
              {tr("dialogSaveJson")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || savingMarkdown || entries.every((entry) => !entry.bundle)}
              onClick={() => void saveMarkdown()}
            >
              <Save />
              {savingMarkdown ? "Saving…" : "Save MD"}
            </Button>
            <RefreshButton loading={loading} onRefresh={() => void load()} />
          </div>
        </div>

        <ErrorBanner error={error} />
        {saved && (
          <div className="mt-3 shrink-0 rounded-md border border-border-base bg-bg-layer-01 px-3 py-2 text-meta text-text-muted select-text">
            Saved {saved}
          </div>
        )}

        <div className="mt-4 flex min-h-0 flex-1 gap-3">
          <div className="w-64 shrink-0 overflow-auto rounded-md border border-border-base bg-bg-layer-01 py-1">
            {entries.length === 0 ? (
              <p className="px-2 py-1 text-meta text-text-faint">
                {loading ? "Collecting bundles…" : "No sessions selected."}
              </p>
            ) : (
              entries.map((entry) => (
                <button
                  key={entry.item.id}
                  type="button"
                  onClick={() => entry.bundle && setSelected(entry.item.id)}
                  className={`interactive flex w-full flex-col gap-0.5 px-2 py-1.5 text-left text-meta ${
                    selected === entry.item.id
                      ? "bg-bg-layer-02 text-text-base"
                      : "text-text-muted hover:text-text-base"
                  } ${entry.error ? "opacity-70" : ""}`}
                >
                  <span className="w-full truncate">
                    {entry.bundle?.title || entry.item.id}
                  </span>
                  <span className="w-full truncate text-caption text-text-faint">
                    {entry.error
                      ? `failed: ${entry.error}`
                      : `${entry.bundle?.events.length ?? 0} events`}
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border-base bg-bg-base">
            {current ? (
              <>
                <div className="flex shrink-0 items-center gap-2 border-b border-border-base px-3 py-1.5 text-caption text-text-faint">
                  <span className="min-w-0 flex-1 truncate font-mono">
                    {current.bundle?.id} · {current.bundle?.events.length} events
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() =>
                      current.bundle && void copy(current.item.id, JSON.stringify(current.bundle, null, 2))
                    }
                  >
                    <Clipboard />
                    {copied === current.item.id ? "Copied" : "Copy JSON"}
                  </Button>
                </div>
                <textarea
                  readOnly
                  value={current.bundle ? JSON.stringify(current.bundle, null, 2) : ""}
                  aria-label={tr("batchExportSessionBundle")}
                  className="min-h-0 flex-1 resize-none bg-bg-base p-3 font-mono text-caption leading-5 text-text-muted outline-none select-text"
                />
              </>
            ) : (
              <p className="p-3 text-meta text-text-faint">
                {loading ? "Collecting bundles…" : "Select a session to view its bundle."}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
