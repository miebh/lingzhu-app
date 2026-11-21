import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
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
export function WebSearchDialog(props: Props) {
  const tr = useT();
  const [status, setStatus] = createSignal<WebSearchStatus>();
  const [query, setQuery] = createSignal("");
  const [results, setResults] = createSignal<SearchResult[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [searched, setSearched] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [notice, setNotice] = createSignal("");

  createEffect(() => {
    if (!props.open) {
      setQuery("");
      setResults([]);
      setError("");
      setSearched(false);
      setStatus(undefined);
      setSaving(false);
      setNotice("");
      return;
    }
    const workspace = props.workspace;
    if (!workspace) return;
    let alive = true;
    api
      .webSearchStatus(workspace)
      .then((value) => {
        if (alive) setStatus(value);
      })
      .catch(() => undefined);
    onCleanup(() => {
      alive = false;
    });
  });

  const search = async () => {
    if (!props.workspace) return;
    const term = query().trim();
    if (!term) {
      setError("Enter a search query.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      setResults(await api.webSearch(props.workspace, term));
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
    const workspace = props.workspace;
    if (!workspace || results().length === 0) return;
    setSaving(true);
    try {
      const path = await api.saveTextFile(
        webSearchExportName(query().trim() || "websearch", results().length),
        serializeWebSearch({
          workspace,
          provider: status()?.provider ?? "",
          query: query().trim(),
          results: results(),
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
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="wide" height="body" class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle class="flex items-center gap-2">
              <Globe class="size-4 text-text-faint" />
              {tr("paletteWebSearch")}
            </DialogTitle>
            <DialogDescription class="truncate">{props.name || props.workspace}</DialogDescription>
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
            <Show when={status()}>
              {(current) => (
                <span
                  class={`shrink-0 rounded-xs border border-border-base px-1.5 py-0.5 text-caption ${
                    current().configured ? "text-state-fg-success" : "text-state-fg-warning"
                  }`}
                >
                  {current().provider || tr("noProvider")} · {current().configured ? tr("configured") : tr("notConfigured")}
                </span>
              )}
            </Show>
          </div>
        </div>

        <div class="mt-4 flex shrink-0 items-center gap-2">
          <Input
            autofocus
            value={query()}
            aria-label={tr("webSearchSearchQuery")}
            placeholder={tr("webSearchSearchTheWeb")}
            onInput={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void search();
              }
            }}
            class="select-text"
          />
          <Button
            type="button"
            size="sm"
            disabled={loading() || status()?.configured === false}
            onClick={() => void search()}
          >
            <Search />
            {loading() ? tr("searching") : tr("search")}
          </Button>
        </div>

        <Show when={status()?.configured === false}>
          <p class="mt-3 rounded-md border border-border-base bg-bg-layer-01 px-3 py-2 text-meta text-text-muted">
            Web search is not configured. Set the provider and API key in the config file.
          </p>
        </Show>

        <ErrorBanner error={error()} />
        <NoticeBanner notice={notice()} mono shrink />

        <div class="mt-3 min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
          <Show
            when={results().length > 0}
            fallback={
              <p class="p-3 text-meta text-text-faint">
                {loading() ? tr("searching") : searched() ? tr("noResultsShort") : tr("enterQuerySearch")}
              </p>
            }
          >
            <For each={results()}>
              {(result) => (
                <div class="border-b border-border-base px-3 py-2 last:border-b-0">
                  <div class="flex items-start gap-2">
                    <div class="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => window.open(result.url, "_blank", "noopener,noreferrer")}
                        class="interactive block max-w-full truncate text-left text-body text-text-base hover:underline"
                      >
                        {result.title || result.url}
                      </button>
                      <p class="truncate font-mono text-caption text-text-faint">{result.url}</p>
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
                  <Show when={result.content}>
                    <p class="mt-1 whitespace-pre-wrap break-words text-meta leading-5 text-text-muted select-text">
                      {result.content}
                    </p>
                  </Show>
                  <Show when={result.published}>
                    <p class="mt-1 text-caption text-text-faint">{result.published}</p>
                  </Show>
                </div>
              )}
            </For>
          </Show>
        </div>

        <Show when={results().length > 0}>
          <p class="mt-2 shrink-0 text-caption text-text-faint">{results().length} results</p>
        </Show>
      </DialogContent>
    </Dialog>
  );
}
