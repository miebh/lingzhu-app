import { For, Show, createEffect, createSignal } from "solid-js";
import { update } from "@lingzhu/ui/solid";
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
export function RunCommandDialog(props: Props) {
  const tr = useT();
  const [commands, setCommands] = createSignal<SlashCommand[]>([]);
  const [name, setName] = createSignal("");
  const [argumentsValue, setArgumentsValue] = createSignal("");
  const [text, setText] = createSignal("");
  const [delivery, setDelivery] = createSignal<"steer" | "queue">("steer");
  const [loading, setLoading] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");

  const load = async () => {
    const workspace = props.workspace;
    if (!workspace) return;
    setLoading(true);
    try {
      const next = await api.commands(workspace);
      setCommands(next);
      update(setName, name, (current) => current || next[0]?.name || "");
      setError("");
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
      setCommands([]);
      setName("");
      setArgumentsValue("");
      setText("");
      setDelivery("steer");
      setError("");
      setNotice("");
      setBusy(false);
    }
  });

  const run = async () => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    const id = name().trim().replace(/^\//, "");
    if (!id) {
      setError("Command name is required.");
      return;
    }
    setBusy(true);
    try {
      const input: CommandInput = {
        name: id,
        arguments: argumentsValue().trim(),
        text: text().trim(),
        delivery: delivery(),
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
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent size="wide" height="body" class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle class="flex items-center gap-2">
              <Command class="size-4 text-text-faint" />
              {tr("runCommandTitle")}
            </DialogTitle>
            <DialogDescription class="truncate">
              {props.title ? `${props.title} · ` : ""}
              {commands().length} command{commands().length === 1 ? "" : "s"}
            </DialogDescription>
          </div>
          <RefreshButton loading={loading()} onRefresh={() => void load()} />
        </div>

        <ErrorBanner error={error()} />
        <NoticeBanner notice={notice()} shrink />

        <div class="mt-4 grid min-h-0 flex-1 gap-3 md:grid-cols-2">
          <div class="min-h-0 overflow-auto rounded-md border border-border-base">
            <Show
              when={commands().length > 0}
              fallback={
                <p class="p-3 text-meta text-text-faint">
                  {loading() ? "Loading…" : "No commands available."}
                </p>
              }
            >
              <For each={commands()}>
                {(command) => (
                  <button
                    type="button"
                    data-active={name() === command.name ? "" : undefined}
                    onClick={() => setName(command.name)}
                    class="command-suggestion-row"
                  >
                    <span class="command-suggestion-label">/{command.name}</span>
                    <span class="command-suggestion-description">{command.description}</span>
                  </button>
                )}
              </For>
            </Show>
          </div>

          <div class="flex min-h-0 min-w-0 flex-col gap-2">
            <label class="flex flex-col gap-1 text-caption text-text-faint">
              {tr("runCommandCommandName")}
              <Input
                value={name()}
                aria-label={tr("runCommandCommandName")}
                placeholder={tr("dialogCommandExample")}
                onInput={(event) => setName(event.currentTarget.value)}
                class="select-text font-mono"
              />
            </label>
            <label class="flex flex-col gap-1 text-caption text-text-faint">
              Arguments (optional)
              <Input
                value={argumentsValue()}
                aria-label={tr("runCommandCommandArguments")}
                placeholder={tr("runCommandArgumentsPassedToTheCommand")}
                onInput={(event) => setArgumentsValue(event.currentTarget.value)}
                class="select-text font-mono"
              />
            </label>
            <label class="flex min-h-0 flex-1 flex-col gap-1 text-caption text-text-faint">
              Extra text (optional)
              <Textarea
                value={text()}
                aria-label={tr("runCommandCommandExtraText")}
                placeholder={tr("runCommandAppendedAfterTheExpandedCommandPrompt")}
                onInput={(event) => setText(event.currentTarget.value)}
                class="min-h-20 flex-1 select-text"
              />
            </label>
            <label class="flex items-center gap-2 text-caption text-text-faint">
              Delivery
              <select
                value={delivery()}
                aria-label={tr("runCommandCommandDelivery")}
                onChange={(event) =>
                  setDelivery(event.currentTarget.value === "queue" ? "queue" : "steer")
                }
                class="h-control-md rounded-md border border-border-base bg-bg-base px-2 text-meta text-text-base outline-none"
              >
                <option value="steer">Steer</option>
                <option value="queue">Queue</option>
              </select>
              <Button type="button" size="sm" class="ml-auto" disabled={busy()} onClick={() => void run()}>
                <Play />
                {busy() ? "Sending…" : "Run"}
              </Button>
            </label>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
