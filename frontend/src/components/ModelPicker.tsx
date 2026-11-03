import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ModelSettings, ProviderSettings } from "../lib/types";

interface Props {
  providers: ProviderSettings[];
  provider: string;
  model: string;
  onSelect: (providerID: string, modelID: string) => void;
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
export function ModelPicker({ providers, provider, model, onSelect }: Props) {
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
        <DialogContent size="wide" className="flex flex-col gap-3 overflow-hidden p-3">
          <DialogTitle className="sr-only">Select model</DialogTitle>
          <DialogDescription className="sr-only">
            Search the configured providers and pick the model for this session.
          </DialogDescription>
          <Input
            autoFocus
            value={query}
            aria-label="Search models"
            placeholder="Search models"
            className="focus:outline-none focus-visible:outline-none"
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
          <div role="listbox" aria-label="Models" className="min-h-0 flex-1 overflow-y-auto">
            {groups.length === 0 && (
              <div className="px-2 py-6 text-center text-meta text-text-faint">
                {query.trim() ? "No matching models" : "No models available"}
              </div>
            )}
            {groups.map((group) => (
              <div key={group.provider.id} className="pb-1 last:pb-0">
                <div className="flex items-center gap-2 px-2 py-1 text-caption text-text-faint">
                  <span className="truncate">{group.provider.name}</span>
                  {!group.provider.ready && (
                    <span className="shrink-0 text-state-fg-warning">No API key</span>
                  )}
                </div>
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
                      className="interactive flex h-control-md w-full min-w-0 items-center gap-2 rounded-xs px-2 text-left text-body text-text-base disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="grid size-4 shrink-0 place-items-center">
                        {selected && <Check className="size-3.5 text-text-accent" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{entry.name || entry.id}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
