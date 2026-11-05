import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Plus, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "../../lib/api";
import type { MagpieGateway, ProviderPreset } from "../../lib/types";
import { ProviderDialog } from "./ProviderDialog";
import { ProviderLogo } from "./ProviderLogo";
import type { ProviderDraft } from "./types";

interface Props {
  open: boolean;
  existingIDs: string[];
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (provider: ProviderDraft) => void;
}

/**
 * Provider picker that mirrors the reference connect flow: choose a preset (or
 * a custom endpoint), then enter the key in the provider dialog.
 */
export function ConnectProviderDialog({ open, existingIDs, busy = false, onOpenChange, onSave }: Props) {
  const [presets, setPresets] = useState<ProviderPreset[]>();
  const [magpie, setMagpie] = useState<MagpieGateway>();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ProviderDraft>();

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setPresets(undefined);
    setMagpie(undefined);
    setQuery("");
    setSelected(undefined);
    Promise.all([api.presets(), api.magpie().catch(() => undefined)])
      .then(([value, gateway]) => {
        if (!alive) return;
        setMagpie(gateway);
        // A running gateway knows its real port; the preset's stored one may
        // predate a settings change.
        setPresets(
          gateway?.available
            ? value.map((preset) => (preset.id === "magpie" ? { ...preset, baseUrl: gateway.url } : preset))
            : value,
        );
      })
      .catch(() => {
        if (alive) setPresets([]);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  const available = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (presets ?? []).filter(
      (preset) =>
        !term ||
        preset.name.toLowerCase().includes(term) ||
        preset.id.toLowerCase().includes(term) ||
        preset.baseUrl.toLowerCase().includes(term) ||
        preset.apiKeyEnv.toLowerCase().includes(term),
    );
  }, [presets, query]);

  const close = () => onOpenChange(false);

  const chooseCustom = () =>
    setSelected({
      id: "",
      name: "",
      baseUrl: "",
      apiKey: "",
      apiKeyEnv: "",
      apiKeySet: false,
      clearKey: false,
      ready: false,
      models: [],
    });

  const choosePreset = (preset: ProviderPreset) =>
    setSelected({
      id: preset.id,
      name: preset.name,
      baseUrl: preset.baseUrl,
      apiKey: preset.defaultApiKey ?? "",
      apiKeyEnv: preset.apiKeyEnv,
      apiKeySet: false,
      clearKey: false,
      ready: false,
      dynamicModels: preset.dynamicModels,
      models: (preset.models ?? []).map((model) => ({
        id: model.id,
        name: model.name,
        contextWindow: String(model.contextWindow),
        enabled: true,
      })),
    });

  const save = (provider: ProviderDraft) => {
    setSelected(undefined);
    onSave(provider);
    close();
  };

  return (
    <>
      <Dialog open={open && selected === undefined} onOpenChange={onOpenChange}>
        <DialogContent
          size="manage"
          height="connect"
          className="flex flex-col gap-0 overflow-hidden border-0 bg-bg-base p-0 shadow-elevation-raised"
        >
          <div className="flex shrink-0 items-start gap-3 px-3 pt-2 pb-1.5">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <DialogTitle className="text-body font-[440]">Connect provider</DialogTitle>
              <DialogDescription className="mt-0">
                Choose an OpenAI-compatible endpoint, then paste its key.
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Close"
              onClick={close}
              className="text-text-faint hover:text-text-base"
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="shrink-0 border-b-[0.5px] border-border-weak px-1.5 pb-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-1.5 size-3.5 -translate-y-1/2 text-text-muted" />
              <Input
                autoFocus
                size="sm"
                value={query}
                aria-label="Search providers"
                placeholder="Search providers"
                onChange={(event) => setQuery(event.target.value)}
                className="border-0 bg-transparent pl-6"
              />
            </div>
          </div>

          <div role="group" aria-label="Providers" className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
            <button
              type="button"
              onClick={chooseCustom}
              title="Any OpenAI-compatible base URL"
              className="interactive flex h-control-md w-full min-w-0 items-center gap-2 rounded-md px-2 text-left"
            >
              <span className="grid size-4 shrink-0 place-items-center text-text-muted">
                <Plus className="size-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-body text-text-base">Custom endpoint</span>
              <span className="hidden shrink-0 text-caption text-text-faint sm:block">Any base URL</span>
              <ChevronRight className="size-3.5 shrink-0 text-text-faint" />
            </button>

            <div className="mt-2 flex h-control-sm items-center px-2 text-meta text-text-faint">Providers</div>

            {presets === undefined && (
              <div className="grid min-h-32 place-items-center text-meta text-text-faint">Loading providers…</div>
            )}
            {presets !== undefined && available.length === 0 && (
              <div className="grid min-h-32 place-items-center text-meta text-text-faint">
                {query.trim() ? "No matching providers" : "No presets available"}
              </div>
            )}
            {available.map((preset) => {
              const connected = existingIDs.includes(preset.id);
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={connected}
                  title={preset.baseUrl}
                  onClick={() => choosePreset(preset)}
                  className="interactive flex h-control-md w-full min-w-0 items-center gap-2 rounded-md px-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ProviderLogo
                    id={preset.id}
                    name={preset.name}
                    className="size-4 shrink-0 text-text-muted"
                  />
                  <span className="min-w-0 flex-1 truncate text-body text-text-base">{preset.name}</span>
                  <span className="hidden shrink-0 text-caption text-text-faint sm:block">
                    {preset.dynamicModels
                      ? magpie?.available
                        ? `Gateway ${magpie.version || "running"}`
                        : "Discover models"
                      : `${preset.models?.length ?? 0} models`}
                  </span>
                  {connected ? (
                    <Badge variant="secondary">Connected</Badge>
                  ) : (
                    <ChevronRight className="size-3.5 shrink-0 text-text-faint" />
                  )}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {selected && (
        <ProviderDialog
          open
          initial={selected}
          existingIDs={existingIDs}
          busy={busy}
          advanced={selected.id === ""}
          presentation="connect"
          onOpenChange={(next) => {
            if (!next) setSelected(undefined);
          }}
          onSave={save}
        />
      )}
    </>
  );
}
