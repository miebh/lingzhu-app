import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { Clipboard, Download, Save } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../../lib/api";
import {
  batchExportName,
  batchMarkdownName,
  combineMarkdown,
  serializeBundles,
  type BatchExportItem,
  type MarkdownPart,
} from "../../lib/batchExport";
import { messageOf } from "../../lib/errors";
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
export function BatchExportDialog(props: Props) {
  const tr = useT();
  const [entries, setEntries] = createSignal<Loaded[]>([]);
  const [selected, setSelected] = createSignal<string>();
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [copied, setCopied] = createSignal("");
  const [saved, setSaved] = createSignal("");
  const [savingMarkdown, setSavingMarkdown] = createSignal(false);

  const load = async () => {
    const items = props.items;
    if (!props.open || items.length === 0) return;
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

  createEffect(() => {
    if (props.open) {
      void props.items;
      void load();
    } else {
      setEntries([]);
      setSelected(undefined);
      setError("");
      setCopied("");
      setSaved("");
      setSavingMarkdown(false);
    }
  });

  const current = createMemo(() => entries().find((entry) => entry.item.id === selected() && entry.bundle));

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(""), 1500);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const readyBundles = () => entries().flatMap((entry) => (entry.bundle ? [entry.bundle] : []));

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
    const ready = entries().filter((entry) => entry.bundle);
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
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="wide" height="body" class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle class="flex items-center gap-2">
              <Download class="size-4 text-text-faint" />
              {tr("dialogExportSessions")}
            </DialogTitle>
            <DialogDescription class="truncate">
              {entries().filter((entry) => entry.bundle).length}/{props.items.length} bundles ready
            </DialogDescription>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading()}
              onClick={() => void copyAll()}
            >
              <Clipboard />
              {copied() === "all" ? tr("copied") : tr("copyAll")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading() || entries().every((entry) => !entry.bundle)}
              onClick={() => void saveAll()}
            >
              <Save />
              {tr("dialogSaveJson")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading() || savingMarkdown() || entries().every((entry) => !entry.bundle)}
              onClick={() => void saveMarkdown()}
            >
              <Save />
              {savingMarkdown() ? tr("saving") : tr("dialogSaveMd")}
            </Button>
            <RefreshButton loading={loading()} onRefresh={() => void load()} />
          </div>
        </div>

        <ErrorBanner error={error()} />
        <Show when={saved()}>
          {(path) => (
            <div class="mt-3 shrink-0 rounded-md border border-border-base bg-bg-layer-01 px-3 py-2 text-meta text-text-muted select-text">
              Saved {path()}
            </div>
          )}
        </Show>

        <div class="mt-4 flex min-h-0 flex-1 gap-3">
          <div class="w-64 shrink-0 overflow-auto rounded-md border border-border-base bg-bg-layer-01 py-1">
            <Show
              when={entries().length > 0}
              fallback={
                <p class="px-2 py-1 text-meta text-text-faint">
                  {loading() ? tr("collectingBundles") : tr("noSessionsSelected")}
                </p>
              }
            >
              <For each={entries()}>
                {(entry) => (
                  <button
                    type="button"
                    onClick={() => entry.bundle && setSelected(entry.item.id)}
                    class={`interactive flex w-full flex-col gap-0.5 px-2 py-1.5 text-left text-meta ${
                      selected() === entry.item.id
                        ? "bg-bg-layer-02 text-text-base"
                        : "text-text-muted hover:text-text-base"
                    } ${entry.error ? "opacity-70" : ""}`}
                  >
                    <span class="w-full truncate">
                      {entry.bundle?.title || entry.item.id}
                    </span>
                    <span class="w-full truncate text-caption text-text-faint">
                      {entry.error
                        ? `failed: ${entry.error}`
                        : `${entry.bundle?.events.length ?? 0} events`}
                    </span>
                  </button>
                )}
              </For>
            </Show>
          </div>

          <div class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border-base bg-bg-base">
            <Show
              when={current()}
              fallback={
                <p class="p-3 text-meta text-text-faint">
                  {loading() ? tr("collectingBundles") : tr("selectSessionBundle")}
                </p>
              }
            >
              {(entry) => (
                <>
                  <div class="flex shrink-0 items-center gap-2 border-b border-border-base px-3 py-1.5 text-caption text-text-faint">
                    <span class="min-w-0 flex-1 truncate font-mono">
                      {entry().bundle?.id} · {entry().bundle?.events.length} events
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() =>
                        entry().bundle && void copy(entry().item.id, JSON.stringify(entry().bundle, null, 2))
                      }
                    >
                      <Clipboard />
                      {copied() === entry().item.id ? tr("copied") : tr("copyJson")}
                    </Button>
                  </div>
                  <textarea
                    readOnly
                    value={entry().bundle ? JSON.stringify(entry().bundle, null, 2) : ""}
                    aria-label={tr("batchExportSessionBundle")}
                    class="min-h-0 flex-1 resize-none bg-bg-base p-3 font-mono text-caption leading-5 text-text-muted outline-none select-text"
                  />
                </>
              )}
            </Show>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
