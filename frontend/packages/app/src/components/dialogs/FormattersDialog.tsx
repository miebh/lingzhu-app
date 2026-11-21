import { For, Show, createEffect, createSignal } from "solid-js";
import { Save, Wand2 } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { formattersExportName, serializeFormatters } from "../../lib/formattersExport";
import type { FormatterInfo } from "@lingzhu/ui/types";
import { RefreshButton, ErrorBanner } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  name?: string;
  onOpenChange: (open: boolean) => void;
}

/** Read-only list of formatters resolved for one workspace. */
export function FormattersDialog(props: Props) {
  const tr = useT();
  const [items, setItems] = createSignal<FormatterInfo[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [notice, setNotice] = createSignal("");

  const load = async () => {
    if (!props.workspace) return;
    setLoading(true);
    setError("");
    try {
      setItems(await api.formatters(props.workspace));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    if (props.open) {
      void props.workspace;
      void load();
    } else {
      setItems([]);
      setError("");
      setSaving(false);
      setNotice("");
    }
  });

  const saveList = async () => {
    if (!props.workspace || items().length === 0) return;
    setSaving(true);
    try {
      const path = await api.saveTextFile(
        formattersExportName(props.workspace),
        serializeFormatters({ workspace: props.workspace, formatters: items() }),
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
              <Wand2 class="size-4 text-text-faint" />
              {tr("formattersTitle")}
            </DialogTitle>
            <DialogDescription class="truncate">{props.name || props.workspace}</DialogDescription>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving() || items().length === 0}
              onClick={() => void saveList()}
            >
              <Save />
              {saving() ? tr("saving") : tr("dialogSaveFile")}
            </Button>
            <RefreshButton loading={loading()} onRefresh={() => void load()} />
          </div>
        </div>

        <ErrorBanner error={error()} class="mt-3" />
        <NoticeBanner notice={notice()} mono />

        <div class="mt-4 min-h-0 flex-1 overflow-auto rounded-md border border-border-base">
          <Show
            when={items().length > 0}
            fallback={
              <p class="p-3 text-meta text-text-faint">
                {loading() ? tr("loading") : tr("noFormatters")}
              </p>
            }
          >
            <For each={items()}>
              {(item) => (
                <div class="border-b border-border-base px-3 py-2 last:border-b-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-body text-text-base">{item.name}</span>
                    <span class="rounded-xs border border-border-base px-1 text-caption text-text-faint">
                      {item.source}
                    </span>
                    <span class="text-caption text-text-faint">
                      {item.extensions.map((extension) => `.${extension}`).join(" ")}
                    </span>
                  </div>
                  <p class="mt-1 truncate font-mono text-caption text-text-muted" title={item.command.join(" ")}>
                    {item.command.join(" ")}
                  </p>
                </div>
              )}
            </For>
          </Show>
        </div>

        <p class="mt-2 text-caption text-text-faint">
          Use the Files panel's Format action to run the matching formatter on one file.
        </p>
      </DialogContent>
    </Dialog>
  );
}
