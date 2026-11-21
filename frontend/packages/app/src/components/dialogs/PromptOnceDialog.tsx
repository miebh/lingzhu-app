import { For, createEffect, createMemo, createSignal } from "solid-js";
import { update } from "@lingzhu/ui/solid";
import { Play, Sparkles } from "@lingzhu/ui/icons";
import { Button } from "@lingzhu/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@lingzhu/ui/dialog";
import { Textarea } from "@lingzhu/ui/textarea";
import { api } from "../../lib/api";
import { messageOf } from "../../lib/errors";
import type { AgentProfile, CoreModel } from "@lingzhu/ui/types";
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

/** Starts one turn with provider/model/agent overrides without persisting them. */
export function PromptOnceDialog(props: Props) {
  const tr = useT();
  const [text, setText] = createSignal("");
  const [models, setModels] = createSignal<CoreModel[]>([]);
  const [agents, setAgents] = createSignal<AgentProfile[]>([]);
  const [provider, setProvider] = createSignal("");
  const [model, setModel] = createSignal("");
  const [agent, setAgent] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");

  const load = async () => {
    const workspace = props.workspace;
    if (!workspace) return;
    setLoading(true);
    try {
      const [catalog, modelList, defaultModel] = await Promise.all([
        api.agents(workspace),
        api.coreModels(workspace),
        api.coreDefaultModel(workspace),
      ]);
      setAgents(catalog.agents);
      setModels(modelList);
      update(setAgent, agent, (current) => current || catalog.default);
      const fallback = defaultModel ?? modelList.find((entry) => entry.default) ?? modelList[0];
      if (fallback) {
        update(setProvider, provider, (current) => current || fallback.providerId);
        update(setModel, model, (current) => current || fallback.id);
      }
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
      setText("");
      setModels([]);
      setAgents([]);
      setProvider("");
      setModel("");
      setAgent("");
      setError("");
      setNotice("");
      setBusy(false);
    }
  });

  const providers = createMemo(() => Array.from(new Set(models().map((entry) => entry.providerId))));
  const providerModels = createMemo(() => models().filter((entry) => entry.providerId === provider()));

  const submit = async () => {
    const workspace = props.workspace;
    const sessionID = props.sessionID;
    if (!workspace || !sessionID) return;
    const value = text().trim();
    if (!value) {
      setError("Prompt text is required.");
      return;
    }
    setBusy(true);
    try {
      await api.sendOnce(workspace, sessionID, value, provider(), model(), agent());
      setText("");
      setError("");
      setNotice("Prompt started with one-off overrides");
    } catch (err) {
      setNotice("");
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="flex flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <DialogTitle class="flex items-center gap-2">
              <Sparkles class="size-4 text-text-faint" />
              {tr("dialogPromptOnce")}
            </DialogTitle>
            <DialogDescription class="truncate">{props.title || props.sessionID}</DialogDescription>
          </div>
          <RefreshButton loading={loading()} onRefresh={() => void load()} />
        </div>

        <ErrorBanner error={error()} class="mt-3" />
        <NoticeBanner notice={notice()} />

        <div class="mt-4 grid gap-2 sm:grid-cols-3">
          <label class="flex flex-col gap-1 text-caption text-text-faint">
            Provider
            <select
              value={provider()}
              aria-label={tr("promptOncePromptProvider")}
              onChange={(event) => {
                const next = event.currentTarget.value;
                setProvider(next);
                const first = models().find((entry) => entry.providerId === next);
                setModel(first?.id ?? "");
              }}
              class="h-control-md rounded-md border border-border-base bg-bg-base px-2 text-body text-text-base outline-none"
            >
              <For each={providers()}>
                {(id) => <option value={id}>{id}</option>}
              </For>
            </select>
          </label>
          <label class="flex flex-col gap-1 text-caption text-text-faint">
            Model
            <select
              value={model()}
              aria-label={tr("promptOncePromptModel")}
              onChange={(event) => setModel(event.currentTarget.value)}
              class="h-control-md rounded-md border border-border-base bg-bg-base px-2 text-body text-text-base outline-none"
            >
              <For each={providerModels()}>
                {(entry) => <option value={entry.id}>{entry.name || entry.id}</option>}
              </For>
            </select>
          </label>
          <label class="flex flex-col gap-1 text-caption text-text-faint">
            Agent
            <select
              value={agent()}
              aria-label={tr("promptOncePromptAgent")}
              onChange={(event) => setAgent(event.currentTarget.value)}
              class="h-control-md rounded-md border border-border-base bg-bg-base px-2 text-body text-text-base outline-none"
            >
              <For each={agents()}>
                {(entry) => <option value={entry.id}>{entry.name || entry.id}</option>}
              </For>
            </select>
          </label>
        </div>

        <Textarea
          value={text()}
          aria-label={tr("promptOncePromptText")}
          placeholder={tr("promptOncePromptToSendWithTheseOneOffOverrides")}
          onInput={(event) => setText(event.currentTarget.value)}
          class="mt-3 min-h-28 select-text"
        />

        <div class="mt-2 flex items-center justify-between gap-2">
          <p class="text-caption text-text-faint">
            The session keeps its current provider/model/agent after this turn. A running session is rejected.
          </p>
          <Button type="button" size="sm" disabled={busy()} onClick={() => void submit()}>
            <Play />
            {busy() ? tr("startingNow") : tr("runOnce")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
