import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
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
export function ReferenceDialog(props: Props) {
  const tr = useT();
  const [query, setQuery] = createSignal("");
  const [path, setPath] = createSignal("");
  const [caseSensitive, setCaseSensitive] = createSignal(false);
  const [results, setResults] = createSignal<Reference[]>([]);
  const [truncated, setTruncated] = createSignal(false);
  const [selected, setSelected] = createSignal<Reference>();
  const [preview, setPreview] = createSignal<FileContent>();
  const [loading, setLoading] = createSignal(false);
  const [previewLoading, setPreviewLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  let activeLine: HTMLDivElement | null = null;

  const search = async () => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    const term = query().trim();
    if (!term) {
      setError(tr("enterSearchTerm"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const found = await api.references(workspace, sessionID, term, path().trim(), 200, caseSensitive());
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

  createEffect(() => {
    const workspace = props.workspace;
    const current = selected();
    if (!current || !workspace) {
      setPreview(undefined);
      return;
    }
    let alive = true;
    setPreviewLoading(true);
    api
      .fileContent(workspace, current.path)
      .then((content) => {
        if (alive) setPreview(content);
      })
      .catch((err) => {
        if (alive) setError(messageOf(err));
      })
      .finally(() => {
        if (alive) setPreviewLoading(false);
      });
    onCleanup(() => {
      alive = false;
    });
  });

  createEffect(() => {
    preview();
    selected();
    if (activeLine) {
      activeLine.scrollIntoView({ block: "center" });
    }
  });

  createEffect(() => {
    if (!props.open) {
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
  });

  const saveResults = async () => {
    const sessionID = props.sessionID;
    if (!sessionID || results().length === 0) return;
    setSaving(true);
    try {
      const savedPath = await api.saveTextFile(
        referenceExportName(query().trim() || "references", results().length),
        serializeReferences({
          sessionId: sessionID,
          query: query().trim(),
          path: path().trim(),
          caseSensitive: caseSensitive(),
          results: results(),
          truncated: truncated(),
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

  const lines = () => (preview() ? preview()!.content.split("\n") : []);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="wide" height="body" class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle>{tr("referencesTitle")}</DialogTitle>
            <DialogDescription class="truncate">
              {props.title ? `${props.title} · ` : ""}
              {tr("dialogReferenceHint")}
            </DialogDescription>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving() || results().length === 0}
              onClick={() => void saveResults()}
            >
              <Save />
              {saving() ? tr("saving") : tr("dialogSaveFile")}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={loading()} onClick={() => void search()}>
              <Search class={loading() ? "motion-safe:animate-pulse" : undefined} />
              Search
            </Button>
          </div>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <Input
            autofocus
            value={query()}
            aria-label={tr("referenceReferenceTerm")}
            placeholder={tr("referenceSymbolOrText")}
            onInput={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void search();
              }
            }}
            class="min-w-40 flex-1 select-text"
          />
          <Input
            value={path()}
            aria-label={tr("referenceSearchDirectory")}
            placeholder={tr("referenceDirectoryOptional")}
            onInput={(event) => setPath(event.currentTarget.value)}
            class="w-44 select-text font-mono"
          />
          <label class="flex items-center gap-1.5 text-meta text-text-muted">
            <input
              type="checkbox"
              checked={caseSensitive()}
              onChange={(event) => setCaseSensitive(event.currentTarget.checked)}
            />
            {tr("dialogCaseSensitive")}
          </label>
        </div>

        <ErrorBanner error={error()} />
        <NoticeBanner notice={notice()} mono shrink />

        <div class="mt-3 flex min-h-0 flex-1 gap-3">
          <div class="w-72 shrink-0 overflow-auto rounded-md border border-border-base bg-bg-layer-01 py-1">
            <Show
              when={results().length > 0}
              fallback={
                <p class="px-2 py-1 text-meta text-text-faint">
                  {loading() ? tr("searching") : tr("noMatchesYet")}
                </p>
              }
            >
              <For each={results()}>
                {(item) => (
                  <button
                    type="button"
                    onClick={() => setSelected(item)}
                    class={`interactive flex w-full flex-col gap-0.5 px-2 py-1.5 text-left text-meta ${
                      selected() === item
                        ? "bg-bg-layer-02 text-text-base"
                        : "text-text-muted hover:text-text-base"
                    }`}
                  >
                    <span class="w-full truncate font-mono text-caption">
                      {item.path}:{item.line}:{item.column}
                    </span>
                    <span class="w-full truncate">{item.text.trim()}</span>
                  </button>
                )}
              </For>
            </Show>
            <Show when={truncated()}>
              <p class="px-2 py-1 text-caption text-text-faint">
                {tr("dialogFirst200Matches")}
              </p>
            </Show>
          </div>

          <div class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border-base bg-bg-base">
            <Show
              when={selected()}
              fallback={
                <p class="p-3 text-meta text-text-faint">
                  {tr("dialogReferenceEmpty")}
                </p>
              }
            >
              {(current) => (
                <>
                  <div class="flex shrink-0 items-center gap-2 border-b border-border-base px-3 py-1.5 text-caption text-text-faint">
                    <FileSearch class="size-3.5" />
                    <span class="min-w-0 flex-1 truncate font-mono">
                      {current().path}:{current().line}:{current().column}
                    </span>
                    <Show when={preview()?.truncated}>
                      <span class="shrink-0">{tr("referencePreviewTruncated")}</span>
                    </Show>
                  </div>
                  <div class="min-h-0 flex-1 overflow-auto py-2 font-mono text-meta leading-5">
                    <Show when={previewLoading()}>
                      <p class="px-3 text-text-faint">{tr("referenceLoadingFile")}</p>
                    </Show>
                    <Show when={preview()}>
                      {(file) => (
                        <For each={file().content.split("\n")}>
                          {(line, index) => {
                            const number = () => index() + 1;
                            const active = () => number() === current().line;
                            return (
                              <div
                                ref={active() ? (node) => (activeLine = node) : undefined}
                                class={`flex whitespace-pre ${
                                  active() ? "bg-bg-layer-03 text-text-base" : "text-text-muted"
                                }`}
                              >
                                <span class="w-12 shrink-0 select-none pr-2 text-right text-caption text-text-faint tabular-nums">
                                  {number()}
                                </span>
                                <span class="min-w-0 select-text">{line || " "}</span>
                              </div>
                            );
                          }}
                        </For>
                      )}
                    </Show>
                    <Show when={preview() && lines().length === 0}>
                      <p class="px-3 text-text-faint">(empty file)</p>
                    </Show>
                  </div>
                </>
              )}
            </Show>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
