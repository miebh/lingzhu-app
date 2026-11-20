import { useEffect, useRef, useState } from "react";
import { FileSearch, Save, Search } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { referenceExportName, serializeReferences } from "../../lib/referenceExport";
import type { FileContent, Reference } from "@lingzhu/ui/types";
import { ErrorBanner } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  sessionID?: string;
  title?: string;
  onOpenChange: (open: boolean) => void;
}

/** Searches workspace files for a literal term and previews each hit. */
export function ReferenceDialog({ open, workspace, sessionID, title, onOpenChange }: Props) {
  const tr = useT();
  const [query, setQuery] = useState("");
  const [path, setPath] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [results, setResults] = useState<Reference[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [selected, setSelected] = useState<Reference>();
  const [preview, setPreview] = useState<FileContent>();
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const activeLine = useRef<HTMLDivElement | null>(null);

  const search = async () => {
    if (!workspace || !sessionID) return;
    const term = query.trim();
    if (!term) {
      setError("Enter a term to search.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const found = await api.references(workspace, sessionID, term, path.trim(), 200, caseSensitive);
      setResults(found.references);
      setTruncated(found.truncated);
      setSelected(found.references[0]);
      setPreview(undefined);
    } catch (err) {
      setError(messageOf(err));
      setResults([]);
      setTruncated(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selected || !workspace) {
      setPreview(undefined);
      return;
    }
    let alive = true;
    setPreviewLoading(true);
    api
      .fileContent(workspace, selected.path)
      .then((content) => {
        if (alive) setPreview(content);
      })
      .catch((err) => {
        if (alive) setError(messageOf(err));
      })
      .finally(() => {
        if (alive) setPreviewLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, workspace]);

  useEffect(() => {
    if (activeLine.current) {
      activeLine.current.scrollIntoView({ block: "center" });
    }
  }, [preview, selected]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setPath("");
      setCaseSensitive(false);
      setResults([]);
      setTruncated(false);
      setSelected(undefined);
      setPreview(undefined);
      setError("");
      setSaving(false);
      setNotice("");
    }
  }, [open]);

  const saveResults = async () => {
    if (!sessionID || results.length === 0) return;
    setSaving(true);
    try {
      const savedPath = await api.saveTextFile(
        referenceExportName(query.trim() || "references", results.length),
        serializeReferences({
          sessionId: sessionID,
          query: query.trim(),
          path: path.trim(),
          caseSensitive,
          results,
          truncated,
        }),
      );
      if (savedPath) {
        setNotice(`Saved ${savedPath}`);
        setError("");
      }
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  const lines = preview ? preview.content.split("\n") : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" height="body" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle>References</DialogTitle>
            <DialogDescription className="truncate">
              {title ? `${title} · ` : ""}
              {tr("dialogReferenceHint")}
            </DialogDescription>
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
            <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void search()}>
              <Search className={loading ? "motion-safe:animate-pulse" : undefined} />
              Search
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Input
            autoFocus
            value={query}
            aria-label={tr("referenceReferenceTerm")}
            placeholder={tr("referenceSymbolOrText")}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void search();
              }
            }}
            className="min-w-40 flex-1 select-text"
          />
          <Input
            value={path}
            aria-label={tr("referenceSearchDirectory")}
            placeholder={tr("referenceDirectoryOptional")}
            onChange={(event) => setPath(event.target.value)}
            className="w-44 select-text font-mono"
          />
          <label className="flex items-center gap-1.5 text-meta text-text-muted">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(event) => setCaseSensitive(event.target.checked)}
            />
            {tr("dialogCaseSensitive")}
          </label>
        </div>

        <ErrorBanner error={error} />
        <NoticeBanner notice={notice} mono shrink />

        <div className="mt-3 flex min-h-0 flex-1 gap-3">
          <div className="w-72 shrink-0 overflow-auto rounded-md border border-border-base bg-bg-layer-01 py-1">
            {results.length === 0 ? (
              <p className="px-2 py-1 text-meta text-text-faint">
                {loading ? "Searching…" : "No matches yet."}
              </p>
            ) : (
              results.map((item, index) => (
                <button
                  key={`${item.path}:${item.line}:${item.column}:${index}`}
                  type="button"
                  onClick={() => setSelected(item)}
                  className={`interactive flex w-full flex-col gap-0.5 px-2 py-1.5 text-left text-meta ${
                    selected === item
                      ? "bg-bg-layer-02 text-text-base"
                      : "text-text-muted hover:text-text-base"
                  }`}
                >
                  <span className="w-full truncate font-mono text-caption">
                    {item.path}:{item.line}:{item.column}
                  </span>
                  <span className="w-full truncate">{item.text.trim()}</span>
                </button>
              ))
            )}
            {truncated && (
              <p className="px-2 py-1 text-caption text-text-faint">
                {tr("dialogFirst200Matches")}
              </p>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border-base bg-bg-base">
            {selected ? (
              <>
                <div className="flex shrink-0 items-center gap-2 border-b border-border-base px-3 py-1.5 text-caption text-text-faint">
                  <FileSearch className="size-3.5" />
                  <span className="min-w-0 flex-1 truncate font-mono">
                    {selected.path}:{selected.line}:{selected.column}
                  </span>
                  {preview?.truncated && <span className="shrink-0">preview truncated</span>}
                </div>
                <div className="min-h-0 flex-1 overflow-auto py-2 font-mono text-meta leading-5">
                  {previewLoading && <p className="px-3 text-text-faint">Loading file…</p>}
                  {preview &&
                    lines.map((line, index) => {
                      const number = index + 1;
                      const active = number === selected.line;
                      return (
                        <div
                          key={number}
                          ref={active ? activeLine : undefined}
                          className={`flex whitespace-pre ${
                            active ? "bg-bg-layer-03 text-text-base" : "text-text-muted"
                          }`}
                        >
                          <span className="w-12 shrink-0 select-none pr-2 text-right text-caption text-text-faint tabular-nums">
                            {number}
                          </span>
                          <span className="min-w-0 select-text">{line || " "}</span>
                        </div>
                      );
                    })}
                  {preview && lines.length === 0 && (
                    <p className="px-3 text-text-faint">(empty file)</p>
                  )}
                </div>
              </>
            ) : (
              <p className="p-3 text-meta text-text-faint">
                {tr("dialogReferenceEmpty")}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
