import { useEffect, useState } from "react";
import { Copy, FileText } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { useT } from "@lingzhu/ui/i18n";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Read-only view of the app's raw configuration file. */
export function ConfigFileDialog({ open, onOpenChange }: Props) {
  const tr = useT();
  const [path, setPath] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!open) {
      setPath("");
      setContent("");
      setError("");
      setNotice("");
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    void api
      .readConfigFile()
      .then((file) => {
        if (!live) return;
        setPath(file.path);
        setContent(file.content);
        setError("");
      })
      .catch((cause) => {
        if (live) setError(messageOf(cause));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setNotice(tr("copiedToClipboard"));
      window.setTimeout(() => setNotice(""), 1600);
    } catch (cause) {
      setNotice(messageOf(cause));
    }
  };

  const reveal = async () => {
    if (!path) return;
    try {
      await api.revealPath(path);
    } catch (cause) {
      setNotice(messageOf(cause));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" height="body" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-4 text-text-faint" />
              {tr("configFileTitle")}
            </DialogTitle>
            <DialogDescription className="truncate font-mono">{path}</DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={!content} onClick={() => void copy()}>
              <Copy />
              {tr("copyAction")}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={!path} onClick={() => void reveal()}>
              {tr("openInFileManager")}
            </Button>
          </div>
        </div>

        {error && <p className="mt-3 text-caption text-state-fg-danger">{error}</p>}
        {notice && <p className="mt-2 text-caption text-text-muted">{notice}</p>}

        <pre className="mt-3 min-h-24 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-md bg-bg-layer-01 p-3 font-mono text-caption leading-5 text-text-base select-text">
          {loading ? "Loading…" : content || tr("configFileEmpty")}
        </pre>
      </DialogContent>
    </Dialog>
  );
}
