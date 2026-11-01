import { useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Check, ChevronDown, LoaderCircle, Square, SquareSlash } from "lucide-react";
import { ContextMeter } from "./ContextMeter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProviderSettings, UsageTotals, WorkspaceSelection } from "../lib/types";

interface Props {
  running: boolean;
  disabled: boolean;
  tokens: number;
  window: number;
  usage?: UsageTotals;
  providers: ProviderSettings[];
  provider: string;
  model: string;
  workspaceDefault?: WorkspaceSelection;
  onSelectModel: (providerID: string, modelID: string) => void;
  onToggleWorkspaceDefault: () => void;
  onSend: (text: string) => void;
  onStop: () => void;
}

/**
 * The session composer: an elevated card with
 * no border, a 13px draft surface that grows to a 180px scrollport, and one 44px
 * control row holding the attach control, the context meter and the submit key.
 */
export function Composer({
  running,
  disabled,
  tokens,
  window,
  usage,
  providers,
  provider,
  model,
  workspaceDefault,
  onSelectModel,
  onToggleWorkspaceDefault,
  onSend,
  onStop,
}: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  // The draft surface grows with its content; the card's scrollport caps it.
  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [text]);

  const empty = text.trim() === "";
  const canSubmit = !disabled && !running && !empty && !sending;

  const submit = () => {
    if (!canSubmit) return;
    const value = text.trim();
    setSending(true);
    setText("");
    onSend(value);
    // The bindings resolve after the host accepts the prompt; release the gate
    // on the next tick so a fast host does not flash the spinner.
    setTimeout(() => setSending(false), 0);
  };

  return (
    <div className="w-full shrink-0 bg-bg-base pb-3">
      <div className="mx-auto w-full px-3 md:max-w-session">
        <div className="relative z-10 flex flex-col">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
            className="group/composer relative w-full overflow-clip rounded-xl bg-bg-base shadow-elevation-raised"
          >
            <div className="relative">
              <div className="max-h-[180px] overflow-y-auto no-scrollbar">
                <textarea
                  ref={area}
                  value={text}
                  rows={1}
                  disabled={disabled}
                  aria-label="Message"
                  placeholder={
                    disabled ? "Core is not connected" : "Message or ask lingzhu to do something…"
                  }
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      submit();
                    }
                  }}
                  className="block w-full resize-none overflow-hidden bg-transparent px-4 pt-4 pb-2 text-[13px] font-[440] leading-5 text-text-base outline-none placeholder:text-text-faint disabled:opacity-50"
                />
              </div>
            </div>

            <div className="flex h-11 shrink-0 items-center px-2">
              <div className="flex shrink-0 items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Add files or run commands"
                      className="interactive grid size-7 shrink-0 place-items-center rounded-md text-text-muted hover:text-text-base"
                    >
                      <SquareSlash className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Add files or run commands</TooltipContent>
                </Tooltip>
              </div>

              <div className="ms-1 flex shrink-0 items-center">
                <ModelPicker
                  providers={providers}
                  provider={provider}
                  model={model}
                  workspaceDefault={workspaceDefault}
                  onSelect={onSelectModel}
                  onToggleWorkspaceDefault={onToggleWorkspaceDefault}
                />
              </div>

              <div className="ms-1 me-3 flex h-full min-w-0 flex-1 items-center overflow-x-auto no-scrollbar">
                <div className="flex h-full w-max min-w-full items-center gap-1">
                  <ContextMeter tokens={tokens} window={window} usage={usage} inline />
                </div>
              </div>

              <div className="flex shrink-0 items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      disabled={running ? false : !canSubmit}
                      aria-label={running ? "Stop" : "Send"}
                      aria-busy={sending && !running}
                      onClick={(event) => {
                        event.preventDefault();
                        if (running) onStop();
                        else submit();
                      }}
                      className={`interactive-inverse grid size-7 shrink-0 place-items-center rounded-md p-[6px] ${
                        running
                          ? "bg-bg-inverse text-text-inverse"
                          : "bg-bg-inverse text-text-inverse disabled:cursor-not-allowed disabled:opacity-40"
                      }`}
                    >
                      {sending && !running ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : running ? (
                        <Square className="size-3.5" />
                      ) : (
                        <ArrowUp className="size-4" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{running ? "Stop" : "Send"}</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * Session-level model switch. Providers without a key are listed but cannot be
 * selected; the label follows the resolved session selection.
 */
function ModelPicker({
  providers,
  provider,
  model,
  workspaceDefault,
  onSelect,
  onToggleWorkspaceDefault,
}: {
  providers: ProviderSettings[];
  provider: string;
  model: string;
  workspaceDefault?: WorkspaceSelection;
  onSelect: (providerID: string, modelID: string) => void;
  onToggleWorkspaceDefault: () => void;
}) {
  const selectedProvider = providers.find((item) => item.id === provider);
  const selectedModel = selectedProvider?.models.find((item) => item.id === model);
  const label = selectedModel?.name || selectedModel?.id || model || "Default model";
  const isWorkspaceDefault = workspaceDefault?.provider === provider && workspaceDefault?.model === model;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Select model"
          title={selectedProvider ? `${selectedProvider.name} / ${label}` : label}
          className="interactive flex h-control-xs max-w-44 min-w-0 items-center gap-1 rounded-md px-2 text-meta text-text-muted hover:text-text-base"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="max-h-80 min-w-56 overflow-y-auto">
        {providers.length === 0 && <DropdownMenuItem disabled>No provider configured</DropdownMenuItem>}
        {providers.map((item, index) => (
          <div key={item.id}>
            {index > 0 && <DropdownMenuSeparator />}
            <div className="flex items-center gap-2 px-2 py-1 text-caption text-text-faint">
              <span className="truncate">{item.name}</span>
              {!item.ready && <span className="shrink-0 text-state-fg-warning">No API key</span>}
            </div>
            {item.models.filter((model) => model.enabled !== false).map((entry) => {
              const selected = item.id === provider && entry.id === model;
              return (
                <DropdownMenuItem
                  key={`${item.id}:${entry.id}`}
                  disabled={!item.ready}
                  onSelect={() => onSelect(item.id, entry.id)}
                >
                  <span className="min-w-0 flex-1 truncate">{entry.name || entry.id}</span>
                  {selected && <Check className="size-3.5 shrink-0 text-text-accent" />}
                </DropdownMenuItem>
              );
            })}
            {item.models.length === 0 && <DropdownMenuItem disabled>No models</DropdownMenuItem>}
          </div>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onToggleWorkspaceDefault}>
          <span className="min-w-0 flex-1 truncate">
            {isWorkspaceDefault ? "Clear workspace default" : "Set as workspace default"}
          </span>
          {isWorkspaceDefault && <Check className="size-3.5 shrink-0 text-text-accent" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
