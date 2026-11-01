import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { SettingsField, SettingsRow, SettingsSection, SettingsSelect } from "./primitives";
import type { CoreSettingsScope, PreferencesScope } from "./types";
import type { WorkspaceInfo } from "../../lib/types";

interface Props {
  preferences: PreferencesScope;
  scope: CoreSettingsScope;
  workspaces: WorkspaceInfo[];
}

/** Startup behavior, the app-level permission shortcut, and the tool shell. */
export function GeneralSection({ preferences, scope, workspaces }: Props) {
  const prefs = preferences.preferences;
  const draft = scope.draft;

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection title="Startup" description="Where the app lands when it launches.">
        <SettingsRow
          title="Default workspace"
          description="Automatic reopens the last connected workspace; otherwise pick one explicitly."
        >
          <SettingsSelect
            label="Default workspace"
            value={prefs.defaultWorkspace}
            options={[
              { value: "", label: "Automatic" },
              ...workspaces.map((workspace) => ({ value: workspace.path, label: workspace.name })),
            ]}
            onChange={(value) => preferences.save({ ...prefs, defaultWorkspace: value })}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Permissions"
        description="Applies to this client only; the core still judges every tool call."
      >
        <SettingsRow
          title="Auto-approve tool requests"
          description="Answer every permission prompt with once. Saved rules are untouched, and a denied resource stays denied."
        >
          <Switch
            aria-label="Auto-approve tool requests"
            checked={prefs.autoApprove}
            onCheckedChange={(checked) => preferences.save({ ...prefs, autoApprove: checked })}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Terminal" description="Shared shell used by the built-in bash tool.">
        <SettingsField label="Shell command" hint="Arguments separated by spaces. Leave blank for the platform default.">
          <Input
            value={draft.shell}
            aria-label="Shell command"
            placeholder="powershell -NoProfile -NonInteractive -Command"
            onChange={(event) => scope.update({ shell: event.target.value })}
            onBlur={scope.commit}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              scope.commit();
            }}
            className="select-text font-mono"
          />
        </SettingsField>
      </SettingsSection>
    </div>
  );
}
