import { useEffect, useState } from "react";
import { Save, Search } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { searchEventsExportName, serializeSearchEvents } from "../../lib/searchEventsExport";
import type { SearchHit } from "@lingzhu/ui/types";
import { formatDateTime } from "@lingzhu/ui/format";
import { ErrorBanner } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  name?: string;
  onOpenChange: (open: boolean) => void;
  onOpenSession?: (sessionID: string) => void;
}

/** Searches durable event payloads across every session of a workspace. */
export function SearchDialog({ open, workspace, name, onOpenChange, onOpenSession }: Props) {
  const tr = useT();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
      setLoading(false);
      setSearched(false);
      setError("");
      setSaving(false);
      setNotice("");
    }
  }, [open]);

  const search = async () => {
    if (!workspace) return;
    const term = query.trim();
    if (!term) {
      setError("Enter a search term.");
      return;
    }
    setLoading(true);
    try {
      setHits(await api.searchEvents(workspace, term, 50));
      setSearched(true);
      setError("");
    } catch (err) {
      setHits([]);
      setSearched(true);
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  const saveHits = async () => {
    if (!workspace || hits.length === 0) return;
    setSaving(true);
    try {
      const path = await api.saveTextFile(
        searchEventsExportName(query.trim() || "event-search", hits.length),
        serializeSearchEvents({ workspace, query: query.trim(), hits }),
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
        <div className="min-w-0">
          <DialogTitle className="flex items-center gap-2">
            <Search className="size-4 text-text-faint" />
            {tr("searchEvents")}
          </DialogTitle>
          <DialogDescription className="truncate">{name || workspace}</DialogDescription>
        </div>

        <div className="mt-4 flex shrink-0 items-center gap-2">
          <Input
            autoFocus
            value={query}
            aria-label={tr("searchSearchEvents")}
            placeholder={tr("searchSearchAllSessionEvents")}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void search();
              }
            }}
            className="select-text"
          />
          <Button type="button" size="sm" disabled={loading} onClick={() => void search()}>
            <Search />
            {loading ? "Searching…" : "Search"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving || hits.length === 0}
            onClick={() => void saveHits()}
          >
            <Save />
            {saving ? "Saving…" : "Save file"}
          </Button>
        </div>

        <ErrorBanner error={error} />
        <NoticeBanner notice={notice} mono shrink />

        <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
          {hits.length === 0 ? (
            <p className="p-3 text-meta text-text-faint">
              {loading ? "Searching…" : searched ? "No matching events." : "Enter a term to search."}
            </p>
          ) : (
            hits.map((hit) => (
              <button
                key={`${hit.sessionId}:${hit.seq}`}
                type="button"
                onClick={() => {
                  onOpenSession?.(hit.sessionId);
                  onOpenChange(false);
                }}
                className="interactive flex w-full flex-col gap-0.5 border-b border-border-base px-3 py-2 text-left last:border-b-0 hover:bg-bg-layer-01"
              >
                <span className="flex flex-wrap items-center gap-2 text-caption text-text-faint">
                  <span className="truncate text-meta text-text-base">{hit.title || hit.sessionId}</span>
                  <span className="font-mono">{hit.type}</span>
                  <span>#{hit.seq}</span>
                  <span className="ml-auto">{formatDateTime(hit.at)}</span>
                </span>
                <span className="whitespace-pre-wrap break-words font-mono text-caption leading-5 text-text-muted select-text">
                  {hit.snippet}
                </span>
              </button>
            ))
          )}
        </div>

        {hits.length > 0 && (
          <p className="mt-2 shrink-0 text-caption text-text-faint">
            {hits.length} match{hits.length === 1 ? "" : "es"} · click a result to open its session
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
