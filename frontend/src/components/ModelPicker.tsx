import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ModelSettings, ProviderSettings } from "../lib/types";

interface Props {
  providers: ProviderSettings[];
  provider: string;
  model: string;
  onSelect: (providerID: string, modelID: string) => void;
  onManageModels: () => void;
  onAddProvider: () => void;
}

interface Option {
  key: string;
  provider: ProviderSettings;
  model: ModelSettings;
}

const optionKey = (providerID: string, modelID: string) => `${providerID}\u0000${modelID}`;

function matches(provider: ProviderSettings, model: ModelSettings, term: string) {
  if (!term) return true;
  return (
    provider.name.toLowerCase().includes(term) ||
    provider.id.toLowerCase().includes(term) ||
    model.name.toLowerCase().includes(term) ||
    model.id.toLowerCase().includes(term)
  );
}

/**
 * The model chip opens a searchable command-style dialog. Picking a model also
 * remembers it app-wide for new sessions.
 */
export function ModelPicker({ providers, provider, model, onSelect, onManageModels, onAddProvider }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState<string>();
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  const selectedProvider = providers.find((item) => item.id === provider);
  const selectedModel = selectedProvider?.models.find((item) => item.id === model);
  const label = selectedModel?.name || selectedModel?.id || model || "Default model";

  const groups = useMemo(() => {
    const term = query.trim().toLowerCase();
    return providers
      .map((item) => ({
        provider: item,
        models: item.models.filter((entry) => entry.enabled !== false && matches(item, entry, term)),
      }))
      .filter((group) => group.models.length > 0);
  }, [providers, query]);

  const selectable = useMemo(
    () =>
      groups.flatMap((group) =>
        group.provider.ready
          ? group.models.map((entry) => ({
              key: optionKey(group.provider.id, entry.id),
              provider: group.provider,
              model: entry,
            }))
          : [],
      ),
    [groups],
  );

  // Keep the highlight valid while the filter narrows the list.
  const currentKey = selectable.some((option) => option.key === activeKey) ? activeKey : selectable[0]?.key;

  useEffect(() => {
    if (!open || !currentKey) return;
    rowRefs.current.get(currentKey)?.scrollIntoView({ block: "nearest" });
  }, [currentKey, open]);

  const move = (delta: number) => {
    if (selectable.length === 0) return;
    const index = selectable.findIndex((option) => option.key === currentKey);
    const next = index < 0 ? 0 : (index + delta + selectable.length) % selectable.length;
    setActiveKey(selectable[next].key);
  };

  const choose = (option: Option) => {
    onSelect(option.provider.id, option.model.id);
    setOpen(false);
  };

  const submit = () => {
    const option = selectable.find((item) => item.key === currentKey);
    if (option) choose(option);
  };

  const changeOpen = (next: boolean) => {
    if (next) {
      const current = selectable.find(
        (option) => option.provider.id === provider && option.model.id === model,
      );
      setActiveKey(current?.key ?? selectable[0]?.key);
    } else {
      setQuery("");
    }
    setOpen(next);
  };

  // Close the picker before opening another dialog.
  const runAction = (action: () => void) => {
    changeOpen(false);
    action();
  };

  return (
    <>
      <button
        type="button"
        aria-label="Select model"
        aria-haspopup="dialog"
        title={selectedProvider ? `${selectedProvider.name} / ${label}` : label}
        onClick={() => changeOpen(true)}
        className="interactive flex h-control-xs max-w-44 min-w-0 items-center gap-1 rounded-md px-2 text-meta text-text-muted hover:text-text-base"
      >
        {selectedProvider && (
          <>
            <span className="min-w-0 shrink-[2] truncate text-text-faint">{selectedProvider.name}</span>
            <span className="shrink-0 text-text-faint">/</span>
          </>
        )}
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown className="size-3 shrink-0" />
      </button>

      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent
          size="model"
          height="body"
          className="flex flex-col gap-0 overflow-hidden border-0 bg-bg-base p-0 shadow-elevation-raised"
        >
          <DialogTitle className="sr-only">Select model</DialogTitle>
          <DialogDescription className="sr-only">
            Search the configured providers and pick the model for this session.
          </DialogDescription>
          <div className="flex shrink-0 flex-col gap-1.5 border-b-[0.5px] border-border-weak p-1.5">
            <div className="flex items-center gap-1">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-1.5 size-3.5 -translate-y-1/2 text-text-muted" />
                <Input
                  autoFocus
                  size="sm"
                  value={query}
                  aria-label="Search models"
                  placeholder="Search models"
                  className="min-w-0 w-full border-0 bg-transparent pl-6 focus:outline-none focus-visible:outline-none"
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      move(1);
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      move(-1);
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      submit();
                    }
                  }}
                />
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Connect provider"
                    onClick={() => runAction(onAddProvider)}
                    className="shrink-0 text-text-faint hover:text-text-base"
                  >
                    <Plus className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Connect provider</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Manage models"
                    onClick={() => runAction(onManageModels)}
                    className="shrink-0 text-text-faint hover:text-text-base"
                  >
                    <SlidersHorizontal className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Manage models</TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div role="listbox" aria-label="Models" className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-1.5 pt-3 pb-1.5">
            {groups.length === 0 && (
              <div className="grid min-h-32 place-items-center text-meta text-text-faint">
                {query.trim() ? "No matching models" : "No models available"}
              </div>
            )}
            {groups.map((group) => (
              <div key={group.provider.id} className="contents">
                <div className="sticky top-0 z-[1] flex h-control-md items-center gap-1.5 bg-bg-base ps-8 pe-2 text-meta text-text-faint">
                  <span className="truncate">{group.provider.name}</span>
                  {!group.provider.ready && (
                    <span className="shrink-0 text-state-fg-warning">No API key</span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  {group.models.map((entry) => {
                    const key = optionKey(group.provider.id, entry.id);
                    const selected = group.provider.id === provider && entry.id === model;
                    const active = key === currentKey;
                    return (
                      <button
                        key={key}
                        ref={(node) => {
                          if (node) rowRefs.current.set(key, node);
                          else rowRefs.current.delete(key);
                        }}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        disabled={!group.provider.ready}
                        data-active={active ? "true" : undefined}
                        data-state={active ? "hover" : undefined}
                        onMouseMove={() => setActiveKey(key)}
                        onClick={() => choose({ key, provider: group.provider, model: entry })}
                        className="interactive flex h-control-sm w-full min-w-0 items-center gap-1.5 rounded-md ps-1.5 pe-1 text-left text-body text-text-base disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="grid size-4 shrink-0 place-items-center">
                          {selected && <Check className="size-3.5 text-text-base" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{entry.name || entry.id}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="h-1" aria-hidden="true" />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
