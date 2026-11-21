import { For, Show, createEffect, createSignal } from "solid-js";
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
export function SearchDialog(props: Props) {
  const tr = useT();
  const [query, setQuery] = createSignal("");
  const [hits, setHits] = createSignal<SearchHit[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [searched, setSearched] = createSignal(false);
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [notice, setNotice] = createSignal("");

  createEffect(() => {
    if (!props.open) {
      setQuery("");
      setHits([]);
      setLoading(false);
      setSearched(false);
      setError("");
      setSaving(false);
      setNotice("");
    }
  });

  const search = async () => {
    if (!props.workspace) return;
    const term = query().trim();
    if (!term) {
      setError("Enter a search term.");
      return;
    }
    setLoading(true);
    try {
      setHits(await api.searchEvents(props.workspace, term, 50));
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
    if (!props.workspace || hits().length === 0) return;
    setSaving(true);
    try {
      const path = await api.saveTextFile(
        searchEventsExportName(query().trim() || "event-search", hits().length),
        serializeSearchEvents({ workspace: props.workspace, query: query().trim(), hits: hits() }),
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
        <div class="min-w-0">
          <DialogTitle class="flex items-center gap-2">
            <Search class="size-4 text-text-faint" />
            {tr("searchEvents")}
          </DialogTitle>
          <DialogDescription class="truncate">{props.name || props.workspace}</DialogDescription>
        </div>

        <div class="mt-4 flex shrink-0 items-center gap-2">
          <Input
            autofocus
            value={query()}
            aria-label={tr("searchSearchEvents")}
            placeholder={tr("searchSearchAllSessionEvents")}
            onInput={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void search();
              }
            }}
            class="select-text"
          />
          <Button type="button" size="sm" disabled={loading()} onClick={() => void search()}>
            <Search />
            {loading() ? "Searching…" : "Search"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving() || hits().length === 0}
            onClick={() => void saveHits()}
          >
            <Save />
            {saving() ? "Saving…" : "Save file"}
          </Button>
        </div>

        <ErrorBanner error={error()} />
        <NoticeBanner notice={notice()} mono shrink />

        <div class="mt-3 min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
          <Show
            when={hits().length > 0}
            fallback={
              <p class="p-3 text-meta text-text-faint">
                {loading() ? "Searching…" : searched() ? "No matching events." : "Enter a term to search."}
              </p>
            }
          >
            <For each={hits()}>
              {(hit) => (
                <button
                  type="button"
                  onClick={() => {
                    props.onOpenSession?.(hit.sessionId);
                    props.onOpenChange(false);
                  }}
                  class="interactive flex w-full flex-col gap-0.5 border-b border-border-base px-3 py-2 text-left last:border-b-0 hover:bg-bg-layer-01"
                >
                  <span class="flex flex-wrap items-center gap-2 text-caption text-text-faint">
                    <span class="truncate text-meta text-text-base">{hit.title || hit.sessionId}</span>
                    <span class="font-mono">{hit.type}</span>
                    <span>#{hit.seq}</span>
                    <span class="ml-auto">{formatDateTime(hit.at)}</span>
                  </span>
                  <span class="whitespace-pre-wrap break-words font-mono text-caption leading-5 text-text-muted select-text">
                    {hit.snippet}
                  </span>
                </button>
              )}
            </For>
          </Show>
        </div>

        <Show when={hits().length > 0}>
          <p class="mt-2 shrink-0 text-caption text-text-faint">
            {hits().length} match{hits().length === 1 ? "" : "es"} · click a result to open its session
          </p>
        </Show>
      </DialogContent>
    </Dialog>
  );
}
