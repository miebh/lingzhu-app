import { useEffect, useState } from "react";
import { Input } from "@lingzhu/ui/input";
import { SettingsRow, SettingsSelect } from "./primitives";
import { t } from "@lingzhu/ui/i18n";
import type { PreferencesScope } from "./types";

interface Props {
  preferences: PreferencesScope;
}

type FontKey = "fontFamily" | "codeFont" | "terminalFont";

/** Client-only look and motion in one catalog card, like the reference Appearance page. */
export function AppearanceSection({ preferences }: Props) {
  const prefs = preferences.preferences;
  const [fonts, setFonts] = useState<Record<FontKey, string>>({
    fontFamily: prefs.appearance.fontFamily,
    codeFont: prefs.appearance.codeFont,
    terminalFont: prefs.appearance.terminalFont,
  });

  // The stored value wins when another section or window changes it.
  useEffect(() => {
    setFonts({
      fontFamily: prefs.appearance.fontFamily,
      codeFont: prefs.appearance.codeFont,
      terminalFont: prefs.appearance.terminalFont,
    });
  }, [prefs.appearance.fontFamily, prefs.appearance.codeFont, prefs.appearance.terminalFont]);

  const saveFont = (key: FontKey) => {
    const value = fonts[key].trim();
    if (value === prefs.appearance[key]) return;
    preferences.save({ ...prefs, appearance: { ...prefs.appearance, [key]: value } });
  };

  const save = (patch: Partial<typeof prefs.appearance>) => {
    preferences.save({ ...prefs, appearance: { ...prefs.appearance, ...patch } });
  };

  const fontRow = (key: FontKey, title: string, description: string, placeholder: string) => (
    <SettingsRow title={title} description={description}>
      <div className="w-full sm:w-[220px]">
        <Input
          value={fonts[key]}
          aria-label={title}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setFonts((current) => ({ ...current, [key]: event.target.value }))}
          onBlur={() => saveFont(key)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              saveFont(key);
            }
          }}
          className="select-text"
        />
      </div>
    </SettingsRow>
  );

  return (
    <div className="overflow-hidden rounded-lg bg-bg-layer-01 px-5 shadow-[inset_0_0_0_0.5px_var(--color-border-muted)]">
      <SettingsRow title={t("colorScheme")} description={t("colorSchemeDesc")}>
        <SettingsSelect
          label={t("colorScheme")}
          value={prefs.appearance.theme}
          options={[
            { value: "system", label: t("system") },
            { value: "dark", label: t("darkOption") },
            { value: "light", label: t("lightOption") },
          ]}
          onChange={(value) => save({ theme: value as typeof prefs.appearance.theme })}
        />
      </SettingsRow>
      <SettingsRow title={t("theme")} description={t("themeDesc")}>
        <SettingsSelect
          label={t("theme")}
          value={prefs.appearance.themeName}
          options={[
            { value: "lingzhu", label: t("themeDefault") },
            { value: "contrast", label: t("themeContrast") },
          ]}
          onChange={(value) => save({ themeName: value })}
        />
      </SettingsRow>

      {fontRow("fontFamily", t("uiFont"), t("uiFontDesc"), t("fontPlaceholder"))}
      {fontRow("codeFont", t("codeFont"), t("codeFontDesc"), "IBM Plex Mono")}
      {fontRow("terminalFont", t("terminalFont"), t("terminalFontDesc"), "IBM Plex Mono")}

      <SettingsRow title={t("zoom")} description={t("zoomDesc")}>
        <SettingsSelect
          label={t("zoom")}
          value={String(prefs.appearance.zoom)}
          options={[
            { value: "80", label: "80%" },
            { value: "90", label: "90%" },
            { value: "100", label: "100%" },
            { value: "110", label: "110%" },
            { value: "125", label: "125%" },
            { value: "150", label: "150%" },
          ]}
          onChange={(value) => save({ zoom: Number(value) })}
        />
      </SettingsRow>
      <SettingsRow title={t("reduceMotion")} description={t("reduceMotionDesc")}>
        <SettingsSelect
          label={t("reduceMotion")}
          value={prefs.appearance.reduceMotion}
          options={[
            { value: "system", label: t("system") },
            { value: "on", label: t("onOption") },
            { value: "off", label: t("offOption") },
          ]}
          onChange={(value) => save({ reduceMotion: value as typeof prefs.appearance.reduceMotion })}
        />
      </SettingsRow>
    </div>
  );
}
