import { useEffect, useState } from "react";
import { Save, Wand2 } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
import { formattersExportName, serializeFormatters } from "../lib/formattersExport";
import type { FormatterInfo } from "@lingzhu/ui/types";
import { RefreshButton, ErrorBanner } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";

interface Props {
  open: boolean;
  workspace?: string;
  name?: string;
  onOpenChange: (open: boolean) => void;
}

/** Read-only list of formatters resolved for one workspace. */
export function FormattersDialog({ open, workspace, name, onOpenChange }: Props) {
  const [items, setItems] = useState<FormatterInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const load = async () => {
    if (!workspace) return;
    setLoading(true);
    setError("");
    try {
      setItems(await api.formatters(workspace));
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
      setError("");
      setSaving(false);
      setNotice("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace]);

  const saveList = async () => {
    if (!workspace || items.length === 0) return;
    setSaving(true);
    try {
      const path = await api.saveTextFile(
        formattersExportName(workspace),
        serializeFormatters({ workspace, formatters: items }),
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" height="body" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="size-4 text-text-faint" />
              Formatters
            </DialogTitle>
            <DialogDescription className="truncate">{name || workspace}</DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving || items.length === 0}
              onClick={() => void saveList()}
            >
              <Save />
              {saving ? "Saving…" : "Save file"}
            </Button>
            <RefreshButton loading={loading} onRefresh={() => void load()} />
          </div>
        </div>

        <ErrorBanner error={error} className="mt-3" />
        <NoticeBanner notice={notice} mono />

        <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
          {items.length === 0 ? (
            <p className="p-3 text-meta text-text-faint">
              {loading ? "Loading…" : "No formatters configured."}
            </p>
          ) : (
            items.map((item) => (
              <div key={`${item.name}:${item.extensions.join(",")}`} className="border-b border-border-base px-3 py-2 last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-body text-text-base">{item.name}</span>
                  <span className="rounded-xs border border-border-base px-1 text-caption text-text-faint">
                    {item.source}
                  </span>
                  <span className="text-caption text-text-faint">
                    {item.extensions.map((extension) => `.${extension}`).join(" ")}
                  </span>
                </div>
                <p className="mt-1 truncate font-mono text-caption text-text-muted" title={item.command.join(" ")}>
                  {item.command.join(" ")}
                </p>
              </div>
            ))
          )}
        </div>

        <p className="mt-2 text-caption text-text-faint">
          Use the Files panel's Format action to run the matching formatter on one file.
        </p>
      </DialogContent>
    </Dialog>
  );
}
