import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { update } from "@lingzhu/ui/solid";
import { ExternalLink, FileText, Images, Save } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { mediaExportName, serializeMedia } from "../../lib/mediaExport";
import type { MediaItem } from "@lingzhu/ui/types";
import { formatDateTime, formatBytes } from "@lingzhu/ui/format";
import { RefreshButton, ErrorBanner } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  sessionID?: string;
  title?: string;
  onOpenChange: (open: boolean) => void;
}

function dataURL(item: MediaItem): string {
  return `data:${item.mime};base64,${item.data}`;
}

/** Read-only gallery of image and PDF attachments from tool results. */
export function MediaDialog(props: Props) {
  const tr = useT();
  const [items, setItems] = createSignal<MediaItem[]>([]);
  const [selected, setSelected] = createSignal<string>();
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [truncated, setTruncated] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [notice, setNotice] = createSignal("");

  const load = async () => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    setLoading(true);
    setError("");
    try {
      const list = await api.media(workspace, sessionID, 100);
      setItems(list.media);
      setTruncated(list.truncated);
      update(setSelected, selected, (current) =>
        current && list.media.some((item) => item.id === current) ? current : list.media[0]?.id,
      );
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    if (props.open) {
      void props.workspace;
      void props.sessionID;
      void load();
    } else {
      setItems([]);
      setSelected(undefined);
      setError("");
      setTruncated(false);
      setSaving(false);
      setNotice("");
    }
  });

  const saveIndex = async () => {
    const sessionID = props.sessionID;
    if (!sessionID || items().length === 0) return;
    setSaving(true);
    try {
      const path = await api.saveTextFile(
        mediaExportName(sessionID, items().length),
        serializeMedia({ sessionId: sessionID, items: items(), truncated: truncated() }),
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

  const current = createMemo(() => items().find((item) => item.id === selected()));

  const openExternal = (item: MediaItem) => {
    try {
      const binary = atob(item.data);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const url = URL.createObjectURL(new Blob([bytes], { type: item.mime }));
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="wide" height="body" class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle>{tr("mediaTitle")}</DialogTitle>
            <DialogDescription class="truncate">
              {props.title ? `${props.title} · ` : ""}
              {tr("dialogMediaHint")}
            </DialogDescription>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving() || items().length === 0}
              onClick={() => void saveIndex()}
            >
              <Save />
              {saving() ? tr("saving") : tr("saveIndex")}
            </Button>
            <RefreshButton loading={loading()} onRefresh={() => void load()} />
          </div>
        </div>

        <ErrorBanner error={error()} />
        <NoticeBanner notice={notice()} mono />

        <div class="mt-4 flex min-h-0 flex-1 gap-3">
          <div class="w-64 shrink-0 overflow-auto rounded-md border border-border-base bg-bg-layer-01 py-1">
            <Show
              when={items().length > 0}
              fallback={
                <p class="px-2 py-1 text-meta text-text-faint">
                  {loading() ? tr("loading") : tr("noMedia")}
                </p>
              }
            >
              <For each={items()}>
                {(item) => (
                  <button
                    type="button"
                    onClick={() => setSelected(item.id)}
                    class={`interactive flex w-full items-center gap-2 px-2 py-1.5 text-left text-meta ${
                      selected() === item.id
                        ? "bg-bg-layer-02 text-text-base"
                        : "text-text-muted hover:text-text-base"
                    }`}
                  >
                    {item.mime === "application/pdf" ? (
                      <FileText class="size-3.5 shrink-0 text-text-faint" />
                    ) : (
                      <Images class="size-3.5 shrink-0 text-text-faint" />
                    )}
                    <span class="min-w-0 flex-1">
                      <span class="block truncate">{item.name || item.id}</span>
                      <span class="block truncate text-caption text-text-faint">
                        {item.mime} · {formatBytes(item.size)}
                      </span>
                    </span>
                  </button>
                )}
              </For>
            </Show>
          </div>

          <div class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border-base bg-bg-base">
            <Show
              when={current()}
              fallback={<p class="p-3 text-meta text-text-faint">{tr("mediaSelectPreview")}</p>}
            >
              {(item) => (
                <>
                  <div class="flex shrink-0 items-center gap-2 border-b border-border-base px-3 py-1.5 text-caption text-text-faint">
                    <span class="min-w-0 flex-1 truncate font-mono">
                      {item().name || item().id}
                    </span>
                    <span class="shrink-0">
                      {item().mime} · {formatBytes(item().size)} · {formatDateTime(item().at)}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => openExternal(item())}
                    >
                      <ExternalLink />
                      Open
                    </Button>
                  </div>
                  <Show
                    when={item().mime.startsWith("image/")}
                    fallback={
                      <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                        <FileText class="size-10 text-text-faint" />
                        <p class="text-meta text-text-muted">
                          PDF attachment ({formatBytes(item().size)})
                        </p>
                        <Button type="button" variant="outline" size="sm" onClick={() => openExternal(item())}>
                          <ExternalLink />
                          {tr("dialogOpenPdf")}
                        </Button>
                      </div>
                    }
                  >
                    <div class="min-h-0 flex-1 overflow-auto bg-[repeating-conic-gradient(#0002_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-3">
                      <img
                        src={dataURL(item())}
                        alt={item().name || item().id}
                        class="mx-auto max-h-full max-w-full object-contain"
                      />
                    </div>
                  </Show>
                </>
              )}
            </Show>
          </div>
        </div>

        <Show when={truncated()}>
          <p class="mt-2 shrink-0 text-caption text-text-faint">
            {tr("dialogFirst100Attachments")}
          </p>
        </Show>
      </DialogContent>
    </Dialog>
  );
}
