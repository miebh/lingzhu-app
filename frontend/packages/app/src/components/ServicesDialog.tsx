import { useEffect, useState } from "react";
import { Image, Save, Search, Server } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
import { serializeServices, servicesExportName } from "../lib/servicesExport";
import type { ImageStatus, WebSearchStatus } from "@lingzhu/ui/types";
import { RefreshButton, ErrorBanner, DetailRow } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  name?: string;
  onOpenChange: (open: boolean) => void;
}

function Badge({ configured }: { configured: boolean }) {
  return (
    <span
      className={`rounded-xs border border-border-base px-1.5 py-0.5 text-caption ${
        configured ? "text-state-fg-success" : "text-state-fg-warning"
      }`}
    >
      {configured ? "configured" : "not configured"}
    </span>
  );
}

/** Read-only status of web search and image generation for this workspace. */
export function ServicesDialog({ open, workspace, name, onOpenChange }: Props) {
  const tr = useT();
  const [search, setSearch] = useState<WebSearchStatus>();
  const [image, setImage] = useState<ImageStatus>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const load = async () => {
    if (!workspace) return;
    setLoading(true);
    setError("");
    try {
      const [nextSearch, nextImage] = await Promise.all([
        api.webSearchStatus(workspace),
        api.imageStatus(workspace),
      ]);
      setSearch(nextSearch);
      setImage(nextImage);
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
      setSearch(undefined);
      setImage(undefined);
      setError("");
      setSaving(false);
      setNotice("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace]);

  const saveStatus = async () => {
    if (!workspace || (!search && !image)) return;
    setSaving(true);
    try {
      const path = await api.saveTextFile(
        servicesExportName(),
        serializeServices({ workspace, webSearch: search, image }),
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
      <DialogContent size="wide" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <Server className="size-4 text-text-faint" />
              Services
            </DialogTitle>
            <DialogDescription className="truncate">{name || workspace}</DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving || (!search && !image)}
              onClick={() => void saveStatus()}
            >
              <Save />
              {saving ? "Saving…" : "Save file"}
            </Button>
            <RefreshButton loading={loading} onRefresh={() => void load()} />
          </div>
        </div>

        <ErrorBanner error={error} className="mt-3" />
        <NoticeBanner notice={notice} mono />

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <section className="rounded-md border border-border-base">
            <div className="flex items-center gap-2 border-b border-border-base px-3 py-2 text-body text-text-base">
              <Search className="size-4 text-text-faint" />
              {tr("paletteWebSearch")}
              {search && <span className="ml-auto">{<Badge configured={search.configured} />}</span>}
            </div>
            {search ? (
              <>
                <DetailRow label="Provider" value={search.provider} />
                <DetailRow label="Endpoint" value={search.endpoint} />
                <DetailRow label="Max results" value={String(search.maxResults)} />
              </>
            ) : (
              <p className="p-3 text-meta text-text-faint">{loading ? "Loading…" : "No status."}</p>
            )}
          </section>

          <section className="rounded-md border border-border-base">
            <div className="flex items-center gap-2 border-b border-border-base px-3 py-2 text-body text-text-base">
              <Image className="size-4 text-text-faint" />
              {tr("dialogImageGeneration")}
              {image && <span className="ml-auto">{<Badge configured={image.configured} />}</span>}
            </div>
            {image ? (
              <>
                <DetailRow label="Provider" value={image.provider} />
                <DetailRow label="Endpoint" value={image.endpoint} />
                <DetailRow label="Model" value={image.model} />
                <DetailRow label="Size" value={image.size} />
              </>
            ) : (
              <p className="p-3 text-meta text-text-faint">{loading ? "Loading…" : "No status."}</p>
            )}
          </section>
        </div>

        <p className="mt-3 text-caption text-text-faint">
          Status hides API keys; configure providers in the config file or settings.
        </p>
      </DialogContent>
    </Dialog>
  );
}
