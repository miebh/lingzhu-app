import type { KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SettingsField, SettingsRow, SettingsSection } from "./primitives";
import type { CoreSettingsScope } from "./types";

interface Props {
  scope: CoreSettingsScope;
  configPath: string;
}

const commitOnEnter = (commit: () => void) => (event: KeyboardEvent<HTMLInputElement>) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  commit();
};

/** Execution limits and the shared config file. Providers live on their own page. */
export function AdvancedSection({ scope, configPath }: Props) {
  const draft = scope.draft;

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection title="Execution" description="Each save restarts the cores this app owns.">
        <SettingsRow title="Max steps" description="Model calls per turn.">
          <Input
            inputMode="numeric"
            value={draft.maxSteps}
            aria-label="Max steps"
            onChange={(event) => scope.update({ maxSteps: event.target.value })}
            onBlur={scope.commit}
            onKeyDown={commitOnEnter(scope.commit)}
            className="w-24 select-text text-right"
          />
        </SettingsRow>
        <SettingsRow title="Compact keep" description="Recent tokens kept verbatim when compacting.">
          <Input
            inputMode="numeric"
            value={draft.compactKeep}
            aria-label="Compact keep"
            onChange={(event) => scope.update({ compactKeep: event.target.value })}
            onBlur={scope.commit}
            onKeyDown={commitOnEnter(scope.commit)}
            className="w-32 select-text text-right"
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Instructions">
        <SettingsField label="System prompt" hint="Appended after the built-in prompt and project AGENTS.md.">
          <Textarea
            value={draft.systemPrompt}
            aria-label="System prompt"
            placeholder="Extra instructions for every session…"
            onChange={(event) => scope.update({ systemPrompt: event.target.value })}
            onBlur={scope.commit}
            className="max-h-40 min-h-20 select-text"
          />
        </SettingsField>
      </SettingsSection>

      <SettingsSection title="Files">
        <SettingsRow title="Core config" description="Shared by every workspace. Unknown fields are preserved.">
          <span
            className="max-w-72 truncate font-mono text-meta text-text-muted select-text"
            title={configPath}
          >
            {configPath}
          </span>
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
