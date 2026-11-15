import { Switch } from "@lingzhu/ui/switch";
import { SettingsRow, SettingsSelect } from "./primitives";
import { t } from "@lingzhu/ui/i18n";
import type { PreferencesScope } from "./types";

interface Props {
  preferences: PreferencesScope;
}

/** One experimental catalog card, ordered like the reference page. */
export function ExperimentalSection({ preferences }: Props) {
  const prefs = preferences.preferences;
  const save = (patch: Partial<typeof prefs.appearance>) => {
    preferences.save({ ...prefs, appearance: { ...prefs.appearance, ...patch } });
  };
  const saveFlag = (key: "newIcons" | "foldUserMessages" | "newQuestionUI", value: boolean) => {
    preferences.save({ ...prefs, [key]: value });
  };

  return (
    <div className="overflow-hidden rounded-lg bg-bg-layer-01 px-5 shadow-[inset_0_0_0_0.5px_var(--color-border-muted)]">
      <SettingsRow
        title={t("organizeSidebar")}
        description={t("organizeSidebarDesc")}
      >
        <SettingsSelect
          label={t("organizeSidebar")}
          value={prefs.appearance.sidebarOrganize}
          options={[
            { value: "list", label: t("oneList") },
            { value: "projects", label: t("projects") },
          ]}
          onChange={(value) => save({ sidebarOrganize: value as typeof prefs.appearance.sidebarOrganize })}
        />
      </SettingsRow>
      <SettingsRow title={t("newIcons")} description={t("newIconsDesc")}>
        <Switch
          aria-label={t("newIcons")}
          checked={prefs.newIcons}
          onCheckedChange={(checked) => saveFlag("newIcons", checked)}
        />
      </SettingsRow>
      <SettingsRow title={t("foldLongMessages")} description={t("foldLongMessagesDesc")}>
        <Switch
          aria-label={t("foldLongMessages")}
          checked={prefs.foldUserMessages}
          onCheckedChange={(checked) => saveFlag("foldUserMessages", checked)}
        />
      </SettingsRow>
      <SettingsRow title={t("newQuestionUI")} description={t("newQuestionUIDesc")}>
        <Switch
          aria-label={t("newQuestionUI")}
          checked={prefs.newQuestionUI}
          onCheckedChange={(checked) => saveFlag("newQuestionUI", checked)}
        />
      </SettingsRow>
    </div>
  );
}
