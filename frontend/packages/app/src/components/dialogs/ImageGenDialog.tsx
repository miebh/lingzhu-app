import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import { ExternalLink, ImagePlus, Save, Trash2 } from "@lingzhu/ui/icons";
import { Loader } from "@lingzhu/ui/loader";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { Textarea } from "@lingzhu/ui/textarea";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import { imageExportName } from "../../lib/imageExport";
import type { GeneratedImage, ImageStatus } from "@lingzhu/ui/types";
import { formatBytes } from "@lingzhu/ui/format";
import { ErrorBanner } from "@lingzhu/ui/detail";
import { NoticeBanner } from "@lingzhu/ui/detail";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  workspace?: string;
  name?: string;
  onOpenChange: (open: boolean) => void;
}

/** Generates one image from a prompt and previews the inline result. */
export function ImageGenDialog(props: Props) {
  const tr = useT();
  const [status, setStatus] = createSignal<ImageStatus>();
  const [prompt, setPrompt] = createSignal("");
  const [size, setSize] = createSignal("");
  const [result, setResult] = createSignal<GeneratedImage>();
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [notice, setNotice] = createSignal("");

  createEffect(() => {
    if (!props.open) {
      setPrompt("");
      setSize("");
      setResult(undefined);
      setError("");
      setStatus(undefined);
      setSaving(false);
      setNotice("");
      return;
    }
    const workspace = props.workspace;
    if (!workspace) return;
    let alive = true;
    api
      .imageStatus(workspace)
      .then((value) => {
        if (!alive) return;
        setStatus(value);
        setSize(value.size || "");
      })
      .catch(() => undefined);
    onCleanup(() => {
      alive = false;
    });
  });

  const generate = async () => {
    if (!props.workspace) return;
    const text = prompt().trim();
    if (!text) {
      setError("Prompt is required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      setResult(await api.generateImage(props.workspace, text, size().trim()));
    } catch (err) {
      setResult(undefined);
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  const saveResult = async () => {
    const current = result();
    if (!current) return;
    setSaving(true);
    try {
      const path = await api.saveBase64File(
        imageExportName(current.prompt, current.extension),
        current.data,
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

  const openResult = () => {
    const current = result();
    if (!current) return;
    try {
      const binary = atob(current.data);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const url = URL.createObjectURL(new Blob([bytes], { type: current.mediaType }));
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
            <DialogTitle class="flex items-center gap-2">
              <ImagePlus class="size-4 text-text-faint" />
              {tr("dialogImageGeneration")}
            </DialogTitle>
            <DialogDescription class="truncate">{props.name || props.workspace}</DialogDescription>
          </div>
          <Show when={status()}>
            {(current) => (
              <span
                class={`shrink-0 rounded-xs border border-border-base px-1.5 py-0.5 text-caption ${
                  current().configured ? "text-state-fg-success" : "text-state-fg-warning"
                }`}
              >
                {current().model || tr("noModel")} · {current().configured ? tr("configured") : tr("notConfigured")}
              </span>
            )}
          </Show>
        </div>

        <Show when={status()?.configured === false}>
          <p class="mt-3 rounded-md border border-border-base bg-bg-layer-01 px-3 py-2 text-meta text-text-muted">
            Image generation is not configured. Set the image endpoint and API key in the config file.
          </p>
        </Show>
        <ErrorBanner error={error()} />
        <NoticeBanner notice={notice()} mono shrink />

        <div class="mt-4 flex min-h-0 flex-1 flex-col gap-2">
          <div class="flex shrink-0 items-center gap-2">
            <Input
              value={size()}
              aria-label={tr("imageGenImageSize")}
              placeholder={tr("dialogImageSizePlaceholder")}
              onInput={(event) => setSize(event.currentTarget.value)}
              class="w-44 select-text font-mono"
            />
            <Button
              type="button"
              size="sm"
              class="ml-auto"
              disabled={loading() || status()?.configured === false}
              onClick={() => void generate()}
            >
              {loading() ? <Loader /> : <ImagePlus />}
              {loading() ? tr("generating") : tr("generate")}
            </Button>
          </div>

          <Textarea
            value={prompt()}
            aria-label={tr("imageGenImagePrompt")}
            placeholder={tr("imageGenDescribeTheImageToGenerate")}
            onInput={(event) => setPrompt(event.currentTarget.value)}
            class="min-h-20 shrink-0 select-text"
          />

          <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border-base bg-bg-layer-01">
            <Show
              when={result()}
              fallback={
                <p class="p-3 text-meta text-text-faint">
                  {loading() ? tr("generatingImage") : tr("generatedImages")}
                </p>
              }
            >
              {(current) => (
                <>
                  <div class="flex shrink-0 items-center gap-2 border-b border-border-base px-3 py-1.5 text-caption text-text-faint">
                    <span class="min-w-0 flex-1 truncate">
                      {current().mediaType} · {formatBytes(current().size)}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={saving()}
                      onClick={() => void saveResult()}
                    >
                      <Save />
                      {saving() ? tr("saving") : tr("dialogSaveFile")}
                    </Button>
                    <Button type="button" variant="outline" size="xs" onClick={openResult}>
                      <ExternalLink />
                      Open
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      aria-label={tr("imageGenClearImage")}
                      onClick={() => setResult(undefined)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <div class="min-h-0 flex-1 overflow-auto bg-[repeating-conic-gradient(#0002_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-3">
                    <img
                      src={`data:${current().mediaType};base64,${current().data}`}
                      alt={current().prompt}
                      class="mx-auto max-h-full max-w-full object-contain"
                    />
                  </div>
                  <Show when={current().revisedPrompt}>
                    {(revised) => (
                      <p class="shrink-0 border-t border-border-base px-3 py-1.5 text-caption text-text-faint">
                        Revised prompt: {revised()}
                      </p>
                    )}
                  </Show>
                </>
              )}
            </Show>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
