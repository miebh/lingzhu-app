import { ChevronDown } from "@lingzhu/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@lingzhu/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@lingzhu/ui/tooltip";
import { Keybind } from "@lingzhu/ui/keybind";
import { formatKeybind } from "../../lib/slash";
import type { AgentProfile } from "@lingzhu/ui/types";
import { useT } from "@lingzhu/ui/i18n";

/** Compact agent selector beside the model chip, mirroring the reference composer. */
export function AgentPicker({
  agents,
  value,
  onChange,
}: {
  agents: AgentProfile[];
  value?: string;
  onChange: (agentID: string) => void;
}) {
  const tr = useT();
  const current = agents.find((agent) => agent.id === value) ?? agents[0];
  if (agents.length === 0) return null;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={tr("agentPickerSelectAgent")}
                className="interactive flex h-7 max-w-[220px] min-w-0 shrink-0 items-center justify-start gap-1.5 rounded-md px-[11px] text-body font-[440] text-text-muted hover:text-text-base data-[state=open]:bg-[linear-gradient(var(--overlay-pressed),var(--overlay-pressed))] data-[state=open]:text-text-base"
              >
                <span className="min-w-0 truncate capitalize">{current?.name || value || "Agent"}</span>
                <ChevronDown className="-ms-0.5 -me-1 size-4 shrink-0" />
              </button>
            </DropdownMenuTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          <span className="flex items-center gap-1.5">
            {tr("dialogChooseAgent")}
            <Keybind keys={(formatKeybind("mod+.") ?? "").split("+")} />
          </span>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="top" align="start" className="min-w-0">
        <DropdownMenuRadioGroup value={current?.id ?? ""} onValueChange={onChange}>
          {agents.map((agent) => (
            <DropdownMenuRadioItem key={agent.id} value={agent.id} className="items-start gap-6">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="min-w-0 truncate capitalize">{agent.name}</span>
                {agent.description ? (
                  <span className="line-clamp-2 text-meta leading-4 text-text-faint">{agent.description}</span>
                ) : null}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
