import { useEffect, useState } from "react";
import { Command, Play } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Input } from "@lingzhu/ui/input";
import { Textarea } from "@lingzhu/ui/textarea";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import type { CommandInput, SlashCommand } from "@lingzhu/ui/types";
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

/** Runs one slash command as a session turn with optional arguments and text. */
export function RunCommandDialog({ open, workspace, sessionID, title, onOpenChange }: Props) {
  const tr = useT();
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [name, setName] = useState("");
  const [argumentsValue, setArgumentsValue] = useState("");
  const [text, setText] = useState("");
  const [delivery, setDelivery] = useState<"steer" | "queue">("steer");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    if (!workspace) return;
    setLoading(true);
    try {
      const next = await api.commands(workspace);
      setCommands(next);
      setName((current) => current || next[0]?.name || "");
      setError("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void load();
    } else {
      setCommands([]);
      setName("");
      setArgumentsValue("");
      setText("");
      setDelivery("steer");
      setError("");
      setNotice("");
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace]);

  const run = async () => {
    if (!workspace || !sessionID) return;
    const id = name.trim().replace(/^\//, "");
    if (!id) {
      setError("Command name is required.");
      return;
    }
    setBusy(true);
    try {
      const input: CommandInput = {
        name: id,
        arguments: argumentsValue.trim(),
        text: text.trim(),
        delivery,
      };
      await api.runCommand(workspace, sessionID, input);
      setNotice(`Command /${id} sent`);
      setError("");
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="wide" height="body" className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <Command className="size-4 text-text-faint" />
              {tr("runCommandTitle")}
            </DialogTitle>
            <DialogDescription className="truncate">
              {title ? `${title} · ` : ""}
              {commands.length} command{commands.length === 1 ? "" : "s"}
            </DialogDescription>
          </div>
          <RefreshButton loading={loading} onRefresh={() => void load()} />
        </div>

        <ErrorBanner error={error} />
        <NoticeBanner notice={notice} shrink />

        <div className="mt-4 grid min-h-0 flex-1 gap-3 md:grid-cols-2">
          <div className="min-h-0 overflow-auto rounded-md border border-border-base">
            {commands.length === 0 ? (
              <p className="p-3 text-meta text-text-faint">
                {loading ? "Loading…" : "No commands available."}
              </p>
            ) : (
              commands.map((command) => (
                <button
                  key={`${command.plugin}:${command.name}`}
                  type="button"
                  data-active={name === command.name ? "" : undefined}
                  onClick={() => setName(command.name)}
                  className="command-suggestion-row"
                >
                  <span className="command-suggestion-label">/{command.name}</span>
                  <span className="command-suggestion-description">{command.description}</span>
                </button>
              ))
            )}
          </div>

          <div className="flex min-h-0 min-w-0 flex-col gap-2">
            <label className="flex flex-col gap-1 text-caption text-text-faint">
              {tr("runCommandCommandName")}
              <Input
                value={name}
                aria-label={tr("runCommandCommandName")}
                placeholder={tr("dialogCommandExample")}
                onChange={(event) => setName(event.target.value)}
                className="select-text font-mono"
              />
            </label>
            <label className="flex flex-col gap-1 text-caption text-text-faint">
              Arguments (optional)
              <Input
                value={argumentsValue}
                aria-label={tr("runCommandCommandArguments")}
                placeholder={tr("runCommandArgumentsPassedToTheCommand")}
                onChange={(event) => setArgumentsValue(event.target.value)}
                className="select-text font-mono"
              />
            </label>
            <label className="flex min-h-0 flex-1 flex-col gap-1 text-caption text-text-faint">
              Extra text (optional)
              <Textarea
                value={text}
                aria-label={tr("runCommandCommandExtraText")}
                placeholder={tr("runCommandAppendedAfterTheExpandedCommandPrompt")}
                onChange={(event) => setText(event.target.value)}
                className="min-h-20 flex-1 select-text"
              />
            </label>
            <label className="flex items-center gap-2 text-caption text-text-faint">
              Delivery
              <select
                value={delivery}
                aria-label={tr("runCommandCommandDelivery")}
                onChange={(event) => setDelivery(event.target.value === "queue" ? "queue" : "steer")}
                className="h-control-md rounded-md border border-border-base bg-bg-base px-2 text-meta text-text-base outline-none"
              >
                <option value="steer">Steer</option>
                <option value="queue">Queue</option>
              </select>
              <Button type="button" size="sm" className="ml-auto" disabled={busy} onClick={() => void run()}>
                <Play />
                {busy ? "Sending…" : "Run"}
              </Button>
            </label>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
