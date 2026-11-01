import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { SettingsField, SettingsRow, SettingsSection, SettingsSelect } from "./primitives";
import type { PreferencesScope } from "./types";

interface Props {
  preferences: PreferencesScope;
}

/** Client-only look and motion. Nothing here restarts a core. */
export function AppearanceSection({ preferences }: Props) {
  const prefs = preferences.preferences;
  const [font, setFont] = useState(prefs.appearance.fontFamily);

  // The stored value wins when another section or window changes it.
  useEffect(() => {
    setFont(prefs.appearance.fontFamily);
  }, [prefs.appearance.fontFamily]);

  const saveFont = () => {
    const value = font.trim();
    if (value === prefs.appearance.fontFamily) return;
    preferences.save({ ...prefs, appearance: { ...prefs.appearance, fontFamily: value } });
  };

  const save = (patch: Partial<typeof prefs.appearance>) => {
    preferences.save({ ...prefs, appearance: { ...prefs.appearance, ...patch } });
  };

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection title="Type" description="The UI face follows the system when left blank.">
        <SettingsField label="UI font family" hint="Any font family available to the system, for example Inter or SF Pro Text.">
          <Input
            value={font}
            aria-label="UI font family"
            placeholder="System default"
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setFont(event.target.value)}
            onBlur={saveFont}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveFont();
              }
            }}
            className="select-text"
          />
        </SettingsField>
      </SettingsSection>

      <SettingsSection title="Layout">
        <SettingsRow title="Density" description="Compact tightens section spacing; control heights stay fixed.">
          <SettingsSelect
            label="Density"
            value={prefs.appearance.density}
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ]}
            onChange={(value) => save({ density: value as typeof prefs.appearance.density })}
          />
        </SettingsRow>
        <SettingsRow title="Timeline width" description="The transcript and composer share this axis.">
          <SettingsSelect
            label="Timeline width"
            value={prefs.appearance.timelineWidth}
            options={[
              { value: "focused", label: "Focused" },
              { value: "comfortable", label: "Comfortable" },
              { value: "wide", label: "Wide" },
            ]}
            onChange={(value) => save({ timelineWidth: value as typeof prefs.appearance.timelineWidth })}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Motion">
        <SettingsRow title="Reduce motion" description="System follows the operating system preference.">
          <SettingsSelect
            label="Reduce motion"
            value={prefs.appearance.reduceMotion}
            options={[
              { value: "system", label: "System" },
              { value: "on", label: "Always on" },
              { value: "off", label: "Always off" },
            ]}
            onChange={(value) => save({ reduceMotion: value as typeof prefs.appearance.reduceMotion })}
          />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
