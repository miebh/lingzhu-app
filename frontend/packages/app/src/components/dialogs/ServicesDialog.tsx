import { Show, createEffect, createSignal } from "solid-js";
import { Image, Save, Search, Server } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { serializeServices, servicesExportName } from "../../lib/servicesExport";
import type { ImageStatus, WebSearchStatus } from "@lingzhu/ui/types";
import { RefreshButton, ErrorBanner, DetailRow } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";
import { t, useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  name?: string;
  onOpenChange: (open: boolean) => void;
}

function Badge(props: { configured: boolean }) {
  return (
    <span
      class={`rounded-xs border border-border-base px-1.5 py-0.5 text-caption ${
        props.configured ? "text-state-fg-success" : "text-state-fg-warning"
      }`}
    >
      {props.configured ? t("configured") : t("notConfigured")}
    </span>
  );
}

/** Read-only status of web search and image generation for this workspace. */
export function ServicesDialog(props: Props) {
  const tr = useT();
  const [search, setSearch] = createSignal<WebSearchStatus>();
  const [image, setImage] = createSignal<ImageStatus>();
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [notice, setNotice] = createSignal("");

  const load = async () => {
    const workspace = props.workspace;
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

  createEffect(() => {
    if (props.open) {
      void props.workspace;
      void load();
    } else {
      setSearch(undefined);
      setImage(undefined);
      setError("");
      setSaving(false);
      setNotice("");
    }
  });

  const saveStatus = async () => {
    const workspace = props.workspace;
    if (!workspace || (!search() && !image())) return;
    setSaving(true);
    try {
      const path = await api.saveTextFile(
        servicesExportName(),
        serializeServices({ workspace, webSearch: search(), image: image() }),
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
      <DialogContent size="wide" class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle class="flex items-center gap-2">
              <Server class="size-4 text-text-faint" />
              {tr("servicesTitle")}
            </DialogTitle>
            <DialogDescription class="truncate">{props.name || props.workspace}</DialogDescription>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving() || (!search() && !image())}
              onClick={() => void saveStatus()}
            >
              <Save />
              {saving() ? tr("saving") : tr("dialogSaveFile")}
            </Button>
            <RefreshButton loading={loading()} onRefresh={() => void load()} />
          </div>
        </div>

        <ErrorBanner error={error()} class="mt-3" />
        <NoticeBanner notice={notice()} mono />

        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <section class="rounded-md border border-border-base">
            <div class="flex items-center gap-2 border-b border-border-base px-3 py-2 text-body text-text-base">
              <Search class="size-4 text-text-faint" />
              {tr("paletteWebSearch")}
              <Show when={search()}>
                {(status) => (
                  <span class="ml-auto">
                    <Badge configured={status().configured} />
                  </span>
                )}
              </Show>
            </div>
            <Show
              when={search()}
              fallback={<p class="p-3 text-meta text-text-faint">{loading() ? tr("loading") : tr("noStatus")}</p>}
            >
              {(status) => (
                <>
                  <DetailRow label={tr("providerLabel")} value={status().provider} />
                  <DetailRow label={tr("endpoint")} value={status().endpoint} />
                  <DetailRow label={tr("maxResults")} value={String(status().maxResults)} />
                </>
              )}
            </Show>
          </section>

          <section class="rounded-md border border-border-base">
            <div class="flex items-center gap-2 border-b border-border-base px-3 py-2 text-body text-text-base">
              <Image class="size-4 text-text-faint" />
              {tr("dialogImageGeneration")}
              <Show when={image()}>
                {(status) => (
                  <span class="ml-auto">
                    <Badge configured={status().configured} />
                  </span>
                )}
              </Show>
            </div>
            <Show
              when={image()}
              fallback={<p class="p-3 text-meta text-text-faint">{loading() ? tr("loading") : tr("noStatus")}</p>}
            >
              {(status) => (
                <>
                  <DetailRow label={tr("providerLabel")} value={status().provider} />
                  <DetailRow label={tr("endpoint")} value={status().endpoint} />
                  <DetailRow label={tr("modelLabel")} value={status().model} />
                  <DetailRow label={tr("size")} value={status().size} />
                </>
              )}
            </Show>
          </section>
        </div>

        <p class="mt-3 text-caption text-text-faint">
          Status hides API keys; configure providers in the config file or settings.
        </p>
      </DialogContent>
    </Dialog>
  );
}
