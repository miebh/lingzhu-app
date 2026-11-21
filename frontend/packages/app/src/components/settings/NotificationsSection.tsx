import { For } from "solid-js";
import { Switch } from "@lingzhu/ui/switch";
import { SettingsRow, SettingsSection, SettingsSelect } from "./primitives";
import { t } from "@lingzhu/ui/i18n";
import type { PreferencesScope } from "./types";

interface Props {
  preferences: PreferencesScope;
}

const SOUNDS = [
  { value: "none", labelKey: "soundNone" },
  { value: "soft", labelKey: "soundSoft" },
  { value: "bright", labelKey: "soundBright" },
  { value: "low", labelKey: "soundLow" },
  { value: "chime", labelKey: "soundChime" },
] as const;

const CHANNELS = [
  { key: "agent" as const, titleKey: "agent", notificationKey: "notificationAgentDesc", soundKey: "soundAgentDesc" },
  { key: "permissions" as const, titleKey: "permissions", notificationKey: "notificationPermissionsDesc", soundKey: "soundPermissionsDesc" },
  { key: "questions" as const, titleKey: "questions", notificationKey: "notificationQuestionsDesc", soundKey: "soundQuestionsDesc" },
  { key: "errors" as const, titleKey: "errors", notificationKey: "notificationErrorsDesc", soundKey: "soundErrorsDesc" },
] as const;

/** Desktop notifications and sound pickers, grouped like the reference page. */
export function NotificationsSection(props: Props) {
  const prefs = () => props.preferences.preferences;
  const notifications = () => prefs().notifications;
  const sounds = () => prefs().sounds;

  const save = (patch: Partial<ReturnType<typeof notifications>>) => {
    props.preferences.save({ ...prefs(), notifications: { ...notifications(), ...patch } });
  };

  const saveSound = (patch: Partial<ReturnType<typeof sounds>>) => {
    props.preferences.save({ ...prefs(), sounds: { ...sounds(), ...patch } });
  };

  const selectSound = (key: (typeof CHANNELS)[number]["key"], value: string) => {
    if (value === "none") {
      saveSound({ [key]: false });
      return;
    }
    saveSound({ [key]: true, tones: { ...sounds().tones, [key]: value } });
  };

  return (
    <div class="flex flex-col gap-8">
      <SettingsSection title={t("desktopNotifications")}>
        <For each={CHANNELS}>
          {(channel) => (
            <SettingsRow title={t(channel.titleKey)} description={t(channel.notificationKey)}>
              <Switch
                aria-label={t("notifyName", { name: t(channel.titleKey) })}
                checked={notifications()[channel.key]}
                onCheckedChange={(checked) => save({ [channel.key]: checked })}
              />
            </SettingsRow>
          )}
        </For>
      </SettingsSection>

      <SettingsSection title={t("soundEffects")}>
        <For each={CHANNELS}>
          {(channel) => (
            <SettingsRow title={t(channel.titleKey)} description={t(channel.soundKey)}>
              <SettingsSelect
                label={t("soundFor", { name: t(channel.titleKey) })}
                value={sounds()[channel.key] ? sounds().tones[channel.key] ?? "soft" : "none"}
                options={SOUNDS.map((sound) => ({ value: sound.value, label: t(sound.labelKey) }))}
                onChange={(value) => selectSound(channel.key, value)}
              />
            </SettingsRow>
          )}
        </For>
        <SettingsRow title={t("interfaceSounds")} description={t("interfaceSoundsDesc")}>
          <Switch
            aria-label={t("interfaceSounds")}
            checked={sounds().interface}
            onCheckedChange={(checked) => saveSound({ interface: checked })}
          />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
