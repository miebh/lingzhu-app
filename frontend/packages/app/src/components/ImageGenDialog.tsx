import { useEffect, useState } from "react";
import { ExternalLink, ImagePlus, Save, Trash2 } from "@lingzhu/ui/icons";
import { Loader } from "@lingzhu/ui/loader";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { Textarea } from "@lingzhu/ui/textarea";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
import { imageExportName } from "../lib/imageExport";
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
export function ImageGenDialog({ open, workspace, name, onOpenChange }: Props) {
  const tr = useT();
  const [status, setStatus] = useState<ImageStatus>();
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("");
  const [result, setResult] = useState<GeneratedImage>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!open) {
      setPrompt("");
      setSize("");
      setResult(undefined);
      setError("");
      setStatus(undefined);
      setSaving(false);
      setNotice("");
      return;
    }
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
    return () => {
      alive = false;
    };
  }, [open, workspace]);

  const generate = async () => {
    if (!workspace) return;
    const text = prompt.trim();
    if (!text) {
      setError("Prompt is required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      setResult(await api.generateImage(workspace, text, size.trim()));
    } catch (err) {
      setResult(undefined);
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  const saveResult = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const path = await api.saveBase64File(
        imageExportName(result.prompt, result.extension),
        result.data,
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
    if (!result) return;
    try {
      const binary = atob(result.data);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const url = URL.createObjectURL(new Blob([bytes], { type: result.mediaType }));
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" height="body" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <ImagePlus className="size-4 text-text-faint" />
              {tr("dialogImageGeneration")}
            </DialogTitle>
            <DialogDescription className="truncate">{name || workspace}</DialogDescription>
          </div>
          {status && (
            <span
              className={`shrink-0 rounded-xs border border-border-base px-1.5 py-0.5 text-caption ${
                status.configured ? "text-state-fg-success" : "text-state-fg-warning"
              }`}
            >
              {status.model || "no model"} · {status.configured ? "configured" : "not configured"}
            </span>
          )}
        </div>

        {status?.configured === false && (
          <p className="mt-3 rounded-md border border-border-base bg-bg-layer-01 px-3 py-2 text-meta text-text-muted">
            Image generation is not configured. Set the image endpoint and API key in the config file.
          </p>
        )}
        <ErrorBanner error={error} />
        <NoticeBanner notice={notice} mono shrink />

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex shrink-0 items-center gap-2">
            <Input
              value={size}
              aria-label={tr("imageGenImageSize")}
              placeholder={tr("dialogImageSizePlaceholder")}
              onChange={(event) => setSize(event.target.value)}
              className="w-44 select-text font-mono"
            />
            <Button
              type="button"
              size="sm"
              className="ml-auto"
              disabled={loading || status?.configured === false}
              onClick={() => void generate()}
            >
              {loading ? <Loader /> : <ImagePlus />}
              {loading ? "Generating…" : "Generate"}
            </Button>
          </div>

          <Textarea
            value={prompt}
            aria-label={tr("imageGenImagePrompt")}
            placeholder={tr("imageGenDescribeTheImageToGenerate")}
            onChange={(event) => setPrompt(event.target.value)}
            className="min-h-20 shrink-0 select-text"
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border-base bg-bg-layer-01">
            {result ? (
              <>
                <div className="flex shrink-0 items-center gap-2 border-b border-border-base px-3 py-1.5 text-caption text-text-faint">
                  <span className="min-w-0 flex-1 truncate">
                    {result.mediaType} · {formatBytes(result.size)}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={saving}
                    onClick={() => void saveResult()}
                  >
                    <Save />
                    {saving ? "Saving…" : "Save file"}
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
                <div className="min-h-0 flex-1 overflow-auto bg-[repeating-conic-gradient(#0002_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-3">
                  <img
                    src={`data:${result.mediaType};base64,${result.data}`}
                    alt={result.prompt}
                    className="mx-auto max-h-full max-w-full object-contain"
                  />
                </div>
                {result.revisedPrompt && (
                  <p className="shrink-0 border-t border-border-base px-3 py-1.5 text-caption text-text-faint">
                    Revised prompt: {result.revisedPrompt}
                  </p>
                )}
              </>
            ) : (
              <p className="p-3 text-meta text-text-faint">
                {loading ? "Generating image…" : "Generated images appear here."}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
