import { useEffect, useState } from "react";
import { ExternalLink, Globe, Save, Search } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { serializeWebSearch, webSearchExportName } from "../../lib/webSearchExport";
import type { SearchResult, WebSearchStatus } from "@lingzhu/ui/types";
import { ErrorBanner } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  name?: string;
  onOpenChange: (open: boolean) => void;
}

/** Manual web search backed by the workspace's configured provider. */
export function WebSearchDialog({ open, workspace, name, onOpenChange }: Props) {
  const tr = useT();
  const [status, setStatus] = useState<WebSearchStatus>();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setError("");
      setSearched(false);
      setStatus(undefined);
      setSaving(false);
      setNotice("");
      return;
    }
    if (!workspace) return;
    let alive = true;
    api
      .webSearchStatus(workspace)
      .then((value) => {
        if (alive) setStatus(value);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open, workspace]);

  const search = async () => {
    if (!workspace) return;
    const term = query.trim();
    if (!term) {
      setError("Enter a search query.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      setResults(await api.webSearch(workspace, term));
      setSearched(true);
    } catch (err) {
      setResults([]);
      setSearched(true);
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  const saveResults = async () => {
    if (!workspace || results.length === 0) return;
    setSaving(true);
    try {
      const path = await api.saveTextFile(
        webSearchExportName(query.trim() || "websearch", results.length),
        serializeWebSearch({
          workspace,
          provider: status?.provider ?? "",
          query: query.trim(),
          results,
        }),
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
              <Globe className="size-4 text-text-faint" />
              {tr("paletteWebSearch")}
            </DialogTitle>
            <DialogDescription className="truncate">{name || workspace}</DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving || results.length === 0}
              onClick={() => void saveResults()}
            >
              <Save />
              {saving ? "Saving…" : "Save file"}
            </Button>
            {status && (
              <span
                className={`shrink-0 rounded-xs border border-border-base px-1.5 py-0.5 text-caption ${
                  status.configured ? "text-state-fg-success" : "text-state-fg-warning"
                }`}
              >
                {status.provider || "no provider"} · {status.configured ? "configured" : "not configured"}
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 flex shrink-0 items-center gap-2">
          <Input
            autoFocus
            value={query}
            aria-label={tr("webSearchSearchQuery")}
            placeholder={tr("webSearchSearchTheWeb")}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void search();
              }
            }}
            className="select-text"
          />
          <Button type="button" size="sm" disabled={loading || status?.configured === false} onClick={() => void search()}>
            <Search />
            {loading ? "Searching…" : "Search"}
          </Button>
        </div>

        {status?.configured === false && (
          <p className="mt-3 rounded-md border border-border-base bg-bg-layer-01 px-3 py-2 text-meta text-text-muted">
            Web search is not configured. Set the provider and API key in the config file.
          </p>
        )}

        <ErrorBanner error={error} />
        <NoticeBanner notice={notice} mono shrink />

        <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
          {results.length === 0 ? (
            <p className="p-3 text-meta text-text-faint">
              {loading ? "Searching…" : searched ? "No results." : "Enter a query to search."}
            </p>
          ) : (
            results.map((result, index) => (
              <div
                key={`${result.url}:${index}`}
                className="border-b border-border-base px-3 py-2 last:border-b-0"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => window.open(result.url, "_blank", "noopener,noreferrer")}
                      className="interactive block max-w-full truncate text-left text-body text-text-base hover:underline"
                    >
                      {result.title || result.url}
                    </button>
                    <p className="truncate font-mono text-caption text-text-faint">{result.url}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-xs"
                    aria-label={`Open ${result.url}`}
                    onClick={() => window.open(result.url, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink />
                  </Button>
                </div>
                {result.content && (
                  <p className="mt-1 whitespace-pre-wrap break-words text-meta leading-5 text-text-muted select-text">
                    {result.content}
                  </p>
                )}
                {result.published && (
                  <p className="mt-1 text-caption text-text-faint">{result.published}</p>
                )}
              </div>
            ))
          )}
        </div>

        {results.length > 0 && (
          <p className="mt-2 shrink-0 text-caption text-text-faint">{results.length} results</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
