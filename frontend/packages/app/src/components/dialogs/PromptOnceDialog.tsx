import { useEffect, useState } from "react";
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
export function PromptOnceDialog({ open, workspace, sessionID, title, onOpenChange }: Props) {
  const tr = useT();
  const [text, setText] = useState("");
  const [models, setModels] = useState<CoreModel[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [agent, setAgent] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
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
      setAgent((current) => current || catalog.default);
      const fallback = defaultModel ?? modelList.find((entry) => entry.default) ?? modelList[0];
      if (fallback) {
        setProvider((current) => current || fallback.providerId);
        setModel((current) => current || fallback.id);
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace]);

  const providers = Array.from(new Set(models.map((entry) => entry.providerId)));
  const providerModels = models.filter((entry) => entry.providerId === provider);

  const submit = async () => {
    if (!workspace || !sessionID) return;
    const value = text.trim();
    if (!value) {
      setError("Prompt text is required.");
      return;
    }
    setBusy(true);
    try {
      await api.sendOnce(workspace, sessionID, value, provider, model, agent);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-text-faint" />
              {tr("dialogPromptOnce")}
            </DialogTitle>
            <DialogDescription className="truncate">{title || sessionID}</DialogDescription>
          </div>
          <RefreshButton loading={loading} onRefresh={() => void load()} />
        </div>

        <ErrorBanner error={error} className="mt-3" />
        <NoticeBanner notice={notice} />

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-caption text-text-faint">
            Provider
            <select
              value={provider}
              aria-label={tr("promptOncePromptProvider")}
              onChange={(event) => {
                const next = event.target.value;
                setProvider(next);
                const first = models.find((entry) => entry.providerId === next);
                setModel(first?.id ?? "");
              }}
              className="h-control-md rounded-md border border-border-base bg-bg-base px-2 text-body text-text-base outline-none"
            >
              {providers.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-caption text-text-faint">
            Model
            <select
              value={model}
              aria-label={tr("promptOncePromptModel")}
              onChange={(event) => setModel(event.target.value)}
              className="h-control-md rounded-md border border-border-base bg-bg-base px-2 text-body text-text-base outline-none"
            >
              {providerModels.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name || entry.id}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-caption text-text-faint">
            Agent
            <select
              value={agent}
              aria-label={tr("promptOncePromptAgent")}
              onChange={(event) => setAgent(event.target.value)}
              className="h-control-md rounded-md border border-border-base bg-bg-base px-2 text-body text-text-base outline-none"
            >
              {agents.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name || entry.id}
                </option>
              ))}
            </select>
          </label>
        </div>

        <Textarea
          value={text}
          aria-label={tr("promptOncePromptText")}
          placeholder={tr("promptOncePromptToSendWithTheseOneOffOverrides")}
          onChange={(event) => setText(event.target.value)}
          className="mt-3 min-h-28 select-text"
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-caption text-text-faint">
            The session keeps its current provider/model/agent after this turn. A running session is rejected.
          </p>
          <Button type="button" size="sm" disabled={busy} onClick={() => void submit()}>
            <Play />
            {busy ? "Starting…" : "Run once"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
