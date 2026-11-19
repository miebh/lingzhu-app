import { useEffect, useState } from "react";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Textarea } from "@lingzhu/ui/textarea";
import { ErrorBanner } from "@lingzhu/ui/detail";
import { api } from "../lib/api";
import { messageOf } from "../lib/errors";
import { useT } from "@lingzhu/ui/i18n";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/** Edits the raw MCP server map, preserving fields the UI does not model. */
export function MCPConfigDialog({ open, onOpenChange, onSaved }: Props) {
  const tr = useT();
  const [text, setText] = useState("{}");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void api
      .mcpConfig()
      .then((servers) => {
        setText(JSON.stringify({ servers }, null, 2));
        setError("");
      })
      .catch((err) => setError(messageOf(err)))
      .finally(() => setLoading(false));
  }, [open]);

  const save = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError("MCP config must be valid JSON.");
      return;
    }
    const candidate =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>).servers ?? parsed
        : undefined;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      setError("MCP config must be an object keyed by server name.");
      return;
    }
    setBusy(true);
    try {
      await api.saveMCPConfig(candidate as Record<string, unknown>);
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" height="body" className="flex flex-col">
        <DialogTitle>{tr("mcpConfigTitle")}</DialogTitle>
        <DialogDescription>{tr("mcpConfigDescription")}</DialogDescription>
        <ErrorBanner error={error} />
        <Textarea
          value={text}
          aria-label={tr("mcpConfigTitle")}
          onChange={(event) => setText(event.target.value)}
          spellCheck={false}
          className="mt-3 min-h-80 flex-1 select-text font-mono text-caption"
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {tr("cancel")}
          </Button>
          <Button type="button" size="sm" disabled={busy || loading} onClick={() => void save()}>
            {busy ? tr("manageModelsSaving") : tr("save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
