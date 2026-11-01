import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsSection } from "./primitives";
import type { CoreSettingsScope } from "./types";
import type { ConfigRule } from "../../lib/types";

const EFFECTS: { value: ConfigRule["effect"]; label: string; tone: string }[] = [
  { value: "allow", label: "Allow", tone: "text-state-fg-success" },
  { value: "ask", label: "Ask", tone: "text-text-base" },
  { value: "deny", label: "Deny", tone: "text-state-fg-danger" },
];

/** Ordered tool rules. Text commits on blur; effects and deletion commit at once. */
export function PermissionsSection({ scope }: { scope: CoreSettingsScope }) {
  const rules = scope.draft.permission;

  const updateRule = (index: number, patch: Partial<ConfigRule>) => {
    scope.update({
      permission: rules.map((rule, at) => (at === index ? { ...rule, ...patch } : rule)),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection
        title="Rules"
        description="The last matching rule wins; without a match the tool asks first. Changes restart the cores this app owns."
      >
        <div className="flex flex-col gap-2 py-3">
          <div className="flex items-center gap-2 px-0.5 text-caption text-text-faint">
            <span className="w-24 shrink-0">Action</span>
            <span className="min-w-0 flex-1">Resource</span>
            <span className="w-32 shrink-0">Effect</span>
            <span className="w-control-xs shrink-0" />
          </div>

          {rules.length === 0 && (
            <p className="rounded-md border border-border-base px-3 py-2 text-meta text-text-faint">
              No rules yet — every tool asks for permission.
            </p>
          )}

          {rules.map((rule, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                size="sm"
                value={rule.action}
                aria-label={`Rule ${index + 1} action`}
                placeholder="bash"
                onChange={(event) => updateRule(index, { action: event.target.value })}
                onBlur={scope.commit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    scope.commit();
                  }
                }}
                className="w-24 shrink-0 select-text"
              />
              <Input
                size="sm"
                value={rule.resource}
                aria-label={`Rule ${index + 1} resource`}
                placeholder="*"
                onChange={(event) => updateRule(index, { resource: event.target.value })}
                onBlur={scope.commit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    scope.commit();
                  }
                }}
                className="min-w-0 flex-1 select-text"
              />
              <EffectPicker
                value={rule.effect}
                onChange={(effect) => scope.updateAndCommit({ permission: replaceEffect(rules, index, effect) })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove rule ${index + 1}`}
                onClick={() => scope.updateAndCommit({ permission: rules.filter((_, at) => at !== index) })}
                className="text-text-faint hover:text-text-base"
              >
                <X />
              </Button>
            </div>
          ))}

          <div className="flex justify-end pt-1">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() =>
                scope.update({ permission: [...rules, { action: "", resource: "", effect: "ask" }] })
              }
              className="text-text-muted hover:text-text-base"
            >
              <Plus />
              Add rule
            </Button>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}

function replaceEffect(rules: ConfigRule[], index: number, effect: ConfigRule["effect"]): ConfigRule[] {
  return rules.map((rule, at) => (at === index ? { ...rule, effect } : rule));
}

function EffectPicker({
  value,
  onChange,
}: {
  value: ConfigRule["effect"];
  onChange: (value: ConfigRule["effect"]) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Effect"
      className="flex h-control-sm w-32 shrink-0 items-center rounded-md border border-border-base p-0.5"
    >
      {EFFECTS.map((effect) => {
        const selected = value === effect.value;
        return (
          <button
            key={effect.value}
            type="button"
            data-selected={selected ? "true" : undefined}
            aria-pressed={selected}
            onClick={() => onChange(effect.value)}
            className={`interactive h-full flex-1 rounded-xs text-caption ${
              selected ? effect.tone : "text-text-faint hover:text-text-muted"
            }`}
          >
            {effect.label}
          </button>
        );
      })}
    </div>
  );
}
