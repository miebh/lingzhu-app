import { Switch } from "@lingzhu/ui/switch";
import { SettingsRow, SettingsSection, SettingsSelect } from "./primitives";
import { TimelineSection } from "./TimelineSection";
import { t } from "@lingzhu/ui/i18n";
import type { PreferencesScope } from "./types";

interface Props {
  preferences: PreferencesScope;
}

const LAYOUTS = [
  { id: "horizontal", label: "topTabs" },
  { id: "vertical", label: "sideTabs" },
  { id: "inbox", label: "inboxLayout" },
] as const;

/** Startup, language, layout, permissions and the tool shell, ordered like the reference. */
export function GeneralSection({ preferences }: Props) {
  const prefs = preferences.preferences;

  const saveAppearance = (patch: Partial<typeof prefs.appearance>) => {
    preferences.save({ ...prefs, appearance: { ...prefs.appearance, ...patch } });
  };

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection title={t("general")} description={t("settingsGeneralDesc")}>
        <SettingsRow
          title={t("interfaceLayout")}
          description={t("interfaceLayoutDesc")}
          align="start"
        >
          <fieldset className="interface-mode" aria-label={t("interfaceLayout")}>
            {LAYOUTS.map((mode) => (
              <label
                key={mode.id}
                data-checked={prefs.appearance.tabLayout === mode.id ? "true" : undefined}
                className="interface-mode-option"
              >
                <input
                  type="radio"
                  name="interface-layout"
                  value={mode.id}
                  checked={prefs.appearance.tabLayout === mode.id}
                  onChange={() => saveAppearance({ tabLayout: mode.id })}
                />
                <span data-mode={mode.id} className="interface-mode-sketch" aria-hidden="true">
                  {mode.id === "horizontal" ? (
                    <span className="interface-mode-strip">
                      {[0, 1, 2].map((index) => (
                        <span key={index} data-active={index === 0 ? "true" : undefined} className="interface-mode-tab" />
                      ))}
                    </span>
                  ) : mode.id === "inbox" ? (
                    <span className="interface-mode-rail">
                      {(["approval", "working", "done", "ready"] as const).map((status) => (
                        <span key={status} data-inbox="true" data-active={status === "approval" ? "true" : undefined} className="interface-mode-tab">
                          <i data-status={status} />
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="interface-mode-rail">
                      {[0, 1, 2, 3].map((index) => (
                        <span key={index} data-active={index === 0 ? "true" : undefined} className="interface-mode-tab" />
                      ))}
                    </span>
                  )}
                  <span className="interface-mode-page">
                    <span className="interface-mode-line" />
                    <span className="interface-mode-line" />
                    <span className="interface-mode-composer" />
                  </span>
                </span>
                <span className="interface-mode-name">{t(mode.label)}</span>
              </label>
            ))}
          </fieldset>
        </SettingsRow>
        <SettingsRow title={t("languageLabel")} description={t("languageDesc")}>
          <SettingsSelect
            label={t("languageLabel")}
            value={prefs.appearance.language}
            options={[
              { value: "en", label: t("english") },
              { value: "zh", label: t("chinese") },
            ]}
            onChange={(value) => saveAppearance({ language: value as typeof prefs.appearance.language })}
          />
        </SettingsRow>
        <SettingsRow
          title={t("defaultEnvironment")}
          description={t("defaultEnvironmentDesc")}
        >
          <SettingsSelect
            label={t("defaultEnvironment")}
            value={prefs.workspaceDestination}
            options={[
              { value: "last-used", label: t("lastUsedPerProject") },
              { value: "local", label: t("localDirectory") },
              { value: "new", label: "None" },
            ]}
            onChange={(value) =>
              preferences.save({ ...prefs, workspaceDestination: value as typeof prefs.workspaceDestination })
            }
          />
        </SettingsRow>
        <SettingsRow
          title={t("autoApprove")}
          description={t("autoApproveDesc")}
        >
          <Switch
            aria-label={t("autoApprove")}
            checked={prefs.autoApprove}
            onCheckedChange={(checked) => preferences.save({ ...prefs, autoApprove: checked })}
          />
        </SettingsRow>
        <SettingsRow title={t("showAgent")} description={t("showAgentDesc")}>
          <Switch
            aria-label={t("showAgent")}
            checked={prefs.showAgent}
            onCheckedChange={(checked) => preferences.save({ ...prefs, showAgent: checked })}
          />
        </SettingsRow>
        <SettingsRow title={t("showMessageAgent")} description={t("showMessageAgentDesc")}>
          <Switch
            aria-label={t("showMessageAgent")}
            checked={prefs.showMessageAgent}
            onCheckedChange={(checked) => preferences.save({ ...prefs, showMessageAgent: checked })}
          />
        </SettingsRow>
        <SettingsRow
          title={t("followUpBehavior")}
          description={t("followUpBehaviorDesc")}
        >
          <SettingsSelect
            label={t("followUpBehavior")}
            value={prefs.followUpBehavior}
            options={[
              { value: "steer", label: t("steerOption") },
              { value: "queue", label: t("queueOption") },
            ]}
            onChange={(value) =>
              preferences.save({ ...prefs, followUpBehavior: value as typeof prefs.followUpBehavior })
            }
          />
        </SettingsRow>
        <SettingsRow title={t("pinchZoom")} description={t("pinchZoomDesc")}>
          <Switch
            aria-label={t("pinchZoom")}
            checked={prefs.pinchZoom}
            onCheckedChange={(checked) => preferences.save({ ...prefs, pinchZoom: checked })}
          />
        </SettingsRow>
        <SettingsRow title={t("spellcheck")} description={t("spellcheckDesc")}>
          <Switch
            aria-label={t("spellcheck")}
            checked={prefs.spellcheck}
            onCheckedChange={(checked) => preferences.save({ ...prefs, spellcheck: checked })}
          />
        </SettingsRow>
      </SettingsSection>

      <TimelineSection preferences={preferences} />
    </div>
  );
}
