import { Switch } from "@lingzhu/ui/switch";
import { SettingsRow, SettingsSelect } from "./primitives";
import { t } from "@lingzhu/ui/i18n";
import type { PreferencesScope } from "./types";

interface Props {
  preferences: PreferencesScope;
}

/** One experimental catalog card, ordered like the reference page. */
export function ExperimentalSection(props: Props) {
  const prefs = () => props.preferences.preferences;
  const save = (patch: Partial<ReturnType<typeof prefs>["appearance"]>) => {
    const current = prefs();
    props.preferences.save({ ...current, appearance: { ...current.appearance, ...patch } });
  };
  const saveFlag = (key: "newIcons" | "foldUserMessages" | "newQuestionUI", value: boolean) => {
    props.preferences.save({ ...prefs(), [key]: value });
  };

  return (
    <div class="overflow-hidden rounded-lg bg-bg-layer-01 px-5 shadow-[inset_0_0_0_0.5px_var(--color-border-muted)]">
      <SettingsRow title={t("organizeSidebar")} description={t("organizeSidebarDesc")}>
        <SettingsSelect
          label={t("organizeSidebar")}
          value={prefs().appearance.sidebarOrganize}
          options={[
            { value: "list", label: t("oneList") },
            { value: "projects", label: t("projects") },
          ]}
          onChange={(value) =>
            save({ sidebarOrganize: value as "list" | "projects" })
          }
        />
      </SettingsRow>
      <SettingsRow title={t("newIcons")} description={t("newIconsDesc")}>
        <Switch
          aria-label={t("newIcons")}
          checked={prefs().newIcons}
          onCheckedChange={(checked) => saveFlag("newIcons", checked)}
        />
      </SettingsRow>
      <SettingsRow title={t("foldLongMessages")} description={t("foldLongMessagesDesc")}>
        <Switch
          aria-label={t("foldLongMessages")}
          checked={prefs().foldUserMessages}
          onCheckedChange={(checked) => saveFlag("foldUserMessages", checked)}
        />
      </SettingsRow>
      <SettingsRow title={t("newQuestionUI")} description={t("newQuestionUIDesc")}>
        <Switch
          aria-label={t("newQuestionUI")}
          checked={prefs().newQuestionUI}
          onCheckedChange={(checked) => saveFlag("newQuestionUI", checked)}
        />
      </SettingsRow>
    </div>
  );
}
