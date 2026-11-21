import { Switch } from "@lingzhu/ui/switch";
import { SettingsRow, SettingsSection, SettingsSelect } from "./primitives";
import { TimelineSection } from "./TimelineSection";
import { t } from "@lingzhu/ui/i18n";
import type { PreferencesScope } from "./types";

interface Props {
  preferences: PreferencesScope;
}

/** Startup, color scheme, language, permissions and the tool shell. */
export function GeneralSection(props: Props) {
  const prefs = () => props.preferences.preferences;

  const saveAppearance = (patch: Partial<ReturnType<typeof prefs>["appearance"]>) => {
    const current = prefs();
    props.preferences.save({ ...current, appearance: { ...current.appearance, ...patch } });
  };

  return (
    <div class="flex flex-col gap-8">
      <SettingsSection title={t("general")} description={t("settingsGeneralDesc")}>
        <SettingsRow title={t("colorScheme")} description={t("colorSchemeDesc")}>
          <SettingsSelect
            label={t("colorScheme")}
            value={prefs().appearance.theme}
            options={[
              { value: "system", label: t("system") },
              { value: "dark", label: t("darkOption") },
              { value: "light", label: t("lightOption") },
            ]}
            onChange={(value) => saveAppearance({ theme: value as "system" | "dark" | "light" })}
          />
        </SettingsRow>
        <SettingsRow title={t("languageLabel")} description={t("languageDesc")}>
          <SettingsSelect
            label={t("languageLabel")}
            value={prefs().appearance.language}
            options={[
              { value: "en", label: t("english") },
              { value: "zh", label: t("chinese") },
            ]}
            onChange={(value) => saveAppearance({ language: value as "en" | "zh" })}
          />
        </SettingsRow>
        <SettingsRow title={t("defaultEnvironment")} description={t("defaultEnvironmentDesc")}>
          <SettingsSelect
            label={t("defaultEnvironment")}
            value={prefs().workspaceDestination}
            options={[
              { value: "last-used", label: t("lastUsedPerProject") },
              { value: "local", label: t("localDirectory") },
              { value: "new", label: "None" },
            ]}
            onChange={(value) =>
              props.preferences.save({
                ...prefs(),
                workspaceDestination: value as "last-used" | "local" | "new",
              })
            }
          />
        </SettingsRow>
        <SettingsRow title={t("autoApprove")} description={t("autoApproveDesc")}>
          <Switch
            aria-label={t("autoApprove")}
            checked={prefs().autoApprove}
            onCheckedChange={(checked) => props.preferences.save({ ...prefs(), autoApprove: checked })}
          />
        </SettingsRow>
        <SettingsRow title={t("showAgent")} description={t("showAgentDesc")}>
          <Switch
            aria-label={t("showAgent")}
            checked={prefs().showAgent}
            onCheckedChange={(checked) => props.preferences.save({ ...prefs(), showAgent: checked })}
          />
        </SettingsRow>
        <SettingsRow title={t("showMessageAgent")} description={t("showMessageAgentDesc")}>
          <Switch
            aria-label={t("showMessageAgent")}
            checked={prefs().showMessageAgent}
            onCheckedChange={(checked) => props.preferences.save({ ...prefs(), showMessageAgent: checked })}
          />
        </SettingsRow>
        <SettingsRow title={t("followUpBehavior")} description={t("followUpBehaviorDesc")}>
          <SettingsSelect
            label={t("followUpBehavior")}
            value={prefs().followUpBehavior}
            options={[
              { value: "steer", label: t("steerOption") },
              { value: "queue", label: t("queueOption") },
            ]}
            onChange={(value) =>
              props.preferences.save({
                ...prefs(),
                followUpBehavior: value as "steer" | "queue",
              })
            }
          />
        </SettingsRow>
        <SettingsRow title={t("pinchZoom")} description={t("pinchZoomDesc")}>
          <Switch
            aria-label={t("pinchZoom")}
            checked={prefs().pinchZoom}
            onCheckedChange={(checked) => props.preferences.save({ ...prefs(), pinchZoom: checked })}
          />
        </SettingsRow>
        <SettingsRow title={t("spellcheck")} description={t("spellcheckDesc")}>
          <Switch
            aria-label={t("spellcheck")}
            checked={prefs().spellcheck}
            onCheckedChange={(checked) => props.preferences.save({ ...prefs(), spellcheck: checked })}
          />
        </SettingsRow>
      </SettingsSection>

      <TimelineSection preferences={props.preferences} />
    </div>
  );
}
