import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FileText, Images, Save } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
import { mediaExportName, serializeMedia } from "../lib/mediaExport";
import type { MediaItem } from "@lingzhu/ui/types";
import { formatDateTime, formatBytes } from "@lingzhu/ui/format";
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

function dataURL(item: MediaItem): string {
  return `data:${item.mime};base64,${item.data}`;
}

/** Read-only gallery of image and PDF attachments from tool results. */
export function MediaDialog({ open, workspace, sessionID, title, onOpenChange }: Props) {
  const tr = useT();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const load = async () => {
    if (!workspace || !sessionID) return;
    setLoading(true);
    setError("");
    try {
      const list = await api.media(workspace, sessionID, 100);
      setItems(list.media);
      setTruncated(list.truncated);
      setSelected((current) =>
        current && list.media.some((item) => item.id === current) ? current : list.media[0]?.id,
      );
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
      setItems([]);
      setSelected(undefined);
      setError("");
      setTruncated(false);
      setSaving(false);
      setNotice("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace, sessionID]);

  const saveIndex = async () => {
    if (!sessionID || items.length === 0) return;
    setSaving(true);
    try {
      const path = await api.saveTextFile(
        mediaExportName(sessionID, items.length),
        serializeMedia({ sessionId: sessionID, items, truncated }),
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

  const current = useMemo(() => items.find((item) => item.id === selected), [items, selected]);

  const openExternal = (item: MediaItem) => {
    try {
      const binary = atob(item.data);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const url = URL.createObjectURL(new Blob([bytes], { type: item.mime }));
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" height="body" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle>Media</DialogTitle>
            <DialogDescription className="truncate">
              {title ? `${title} · ` : ""}
              {tr("dialogMediaHint")}
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving || items.length === 0}
              onClick={() => void saveIndex()}
            >
              <Save />
              {saving ? "Saving…" : "Save index"}
            </Button>
            <RefreshButton loading={loading} onRefresh={() => void load()} />
          </div>
        </div>

        <ErrorBanner error={error} />
        <NoticeBanner notice={notice} mono />

        <div className="mt-4 flex min-h-0 flex-1 gap-3">
          <div className="w-64 shrink-0 overflow-auto rounded-md border border-border-base bg-bg-layer-01 py-1">
            {items.length === 0 ? (
              <p className="px-2 py-1 text-meta text-text-faint">
                {loading ? "Loading…" : "No media in this session."}
              </p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelected(item.id)}
                  className={`interactive flex w-full items-center gap-2 px-2 py-1.5 text-left text-meta ${
                    selected === item.id
                      ? "bg-bg-layer-02 text-text-base"
                      : "text-text-muted hover:text-text-base"
                  }`}
                >
                  {item.mime === "application/pdf" ? (
                    <FileText className="size-3.5 shrink-0 text-text-faint" />
                  ) : (
                    <Images className="size-3.5 shrink-0 text-text-faint" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{item.name || item.id}</span>
                    <span className="block truncate text-caption text-text-faint">
                      {item.mime} · {formatBytes(item.size)}
                    </span>
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
                    {current.name || current.id}
                  </span>
                  <span className="shrink-0">
                    {current.mime} · {formatBytes(current.size)} · {formatDateTime(current.at)}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => openExternal(current)}
                  >
                    <ExternalLink />
                    Open
                  </Button>
                </div>
                {current.mime.startsWith("image/") ? (
                  <div className="min-h-0 flex-1 overflow-auto bg-[repeating-conic-gradient(#0002_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-3">
                    <img
                      src={dataURL(current)}
                      alt={current.name || current.id}
                      className="mx-auto max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                    <FileText className="size-10 text-text-faint" />
                    <p className="text-meta text-text-muted">
                      PDF attachment ({formatBytes(current.size)})
                    </p>
                    <Button type="button" variant="outline" size="sm" onClick={() => openExternal(current)}>
                      <ExternalLink />
                      {tr("dialogOpenPdf")}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className="p-3 text-meta text-text-faint">Select media to preview it.</p>
            )}
          </div>
        </div>

        {truncated && (
          <p className="mt-2 shrink-0 text-caption text-text-faint">
            {tr("dialogFirst100Attachments")}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
