import { useRef, useState, type CSSProperties } from "react";
import { ChevronDown, Eye, EyeOff } from "@lingzhu/ui/icons";
import { Switch } from "@lingzhu/ui/switch";
import { cn } from "@lingzhu/ui/utils";
import { SettingsRow, SettingsSection, SettingsSelect } from "./primitives";
import type { PreferencesScope } from "./types";
import { timelineDetail, timelinePreset, timelinePresets } from "@lingzhu/session-ui/timeline-detail";
import type { TimelineCategory, TimelineDetail, TimelinePlacement } from "@lingzhu/ui/types";

interface Props {
  preferences: PreferencesScope;
}

import { t, useT } from "@lingzhu/ui/i18n";

const DETAIL_LABELS = {
  everything: "timelineEverything",
  detailed: "timelineDetailed",
  compact: "timelineCompact",
  quiet: "timelineQuiet",
  "text-only": "timelineTextOnly",
} as const;

const DETAIL_DESCRIPTIONS = {
  everything: "timelineEverythingDesc",
  detailed: "timelineDetailedDesc",
  compact: "timelineCompactDesc",
  quiet: "timelineQuietDesc",
  "text-only": "timelineTextOnlyDesc",
} as const;

const ADVANCED: { id: TimelineCategory; label: string; expansion: boolean }[] = [
  { id: "shell", label: "categoryShell", expansion: true },
  { id: "edit", label: "categoryEdits", expansion: true },
  { id: "thinking", label: "categoryThinking", expansion: true },
  { id: "subagents", label: "categorySubagents", expansion: false },
  { id: "notices", label: "categoryNotices", expansion: false },
  { id: "tools", label: "categoryOtherTools", expansion: false },
  { id: "commentary", label: "categoryCommentary", expansion: false },
];

/** Timeline detail and width, matching the reference's Timeline section. */
export function TimelineSection({ preferences }: Props) {
  const tr = useT();
  const prefs = preferences.preferences;
  const preset = timelinePreset(prefs.appearance.timelineDetail);
  const levels = timelinePresets.map((item) => item.id);
  const presetIndex = levels.indexOf(preset as (typeof levels)[number]);
  const detailIndex = presetIndex >= 0 ? presetIndex : 2;
  const detailId = (levels[detailIndex] ?? "compact") as keyof typeof DETAIL_LABELS;
  const presetLabel = presetIndex >= 0 ? t(DETAIL_LABELS[detailId]) : "Custom";
  const [advancedOpen, setAdvancedOpen] = useState(!preset);
  const visiblePlacements = useRef<Partial<Record<TimelineCategory, TimelinePlacement>>>({});

  const save = (patch: Partial<typeof prefs.appearance>) => {
    preferences.save({ ...prefs, appearance: { ...prefs.appearance, ...patch } });
  };

  const updateCategory = (category: TimelineCategory, next: TimelineDetail[TimelineCategory]) => {
    const value = timelineDetail(prefs.appearance.timelineDetail);
    save({ timelineDetail: { ...value, [category]: next } as TimelineDetail });
  };

  return (
    <SettingsSection title={t("timelineTitle")} description={t("timelineDesc")}>
      <div className="timeline-detail-control border-b-[0.5px] border-border-base py-5">
          <div className="timeline-detail-scale">
            <div
              className="timeline-detail-track"
              style={
                {
                  "--timeline-detail-progress": `${(detailIndex / (levels.length - 1)) * 100}%`,
                } as CSSProperties
              }
              aria-hidden="true"
            >
              {levels.map((level, index) => (
                <span
                  key={level}
                  data-selected={index <= detailIndex ? "true" : undefined}
                  style={{ left: `${(index / (levels.length - 1)) * 100}%` }}
                />
              ))}
            </div>
            <input
              type="range"
              min={0}
              max={levels.length - 1}
              step={1}
              value={detailIndex}
              aria-label={t("timelineDetail")}
              aria-valuetext={presetLabel}
              onChange={(event) => {
                const next = levels[Number(event.target.value)];
                save({ timelineDetail: timelineDetail(next) });
              }}
            />
          </div>
          <p className="timeline-detail-summary">
            <span>{presetLabel}</span> · {t(DETAIL_DESCRIPTIONS[detailId])}
          </p>
          <button
            type="button"
            className="timeline-detail-advanced"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((value) => !value)}
          >
            <span>{t("advanced")}</span>
            <ChevronDown className={cn("size-4 text-text-faint transition-transform", !advancedOpen && "-rotate-90")} />
          </button>
          {advancedOpen && (
            <div data-slot="timeline-detail-categories" role="group" aria-label={tr("advancedPlacement")}>
              <div data-slot="timeline-detail-columns">
                <span aria-hidden="true" />
                <span>{t("groupColumn")}</span>
                <span>{t("collapseColumn")}</span>
              </div>
              <div data-slot="timeline-detail-list">
                {ADVANCED.map((category) => {
                  const value = timelineDetail(prefs.appearance.timelineDetail)[category.id];
                  const hidden = value.placement === "hidden";
                  return (
                    <div key={category.id} data-slot="timeline-detail-category" data-hidden={hidden ? "" : undefined}>
                      <div data-slot="timeline-detail-activity">
                        <button
                          type="button"
                          data-action="timeline-detail-visibility"
                          data-variant="ghost-muted"
                          aria-pressed={!hidden}
                          aria-label={t(hidden ? "showCategory" : "hideCategory", { name: t(category.label as any) })}
                          onClick={() => {
                            if (!hidden) visiblePlacements.current[category.id] = value.placement;
                            updateCategory(category.id, {
                              ...value,
                              placement: hidden ? visiblePlacements.current[category.id] ?? "grouped" : "hidden",
                            });
                          }}
                        >
                          {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                        <label>{t(category.label as any)}</label>
                      </div>
                      <div data-slot="timeline-detail-placement">
                        <span data-slot="timeline-detail-field-label">{t("groupColumn")}</span>
                        {hidden ? (
                          <span data-slot="timeline-detail-unavailable" aria-hidden="true" />
                        ) : (
                          <Switch
                            aria-label={t("groupCategory", { name: t(category.label as any) })}
                            checked={value.placement === "grouped"}
                            onCheckedChange={(checked) =>
                              updateCategory(category.id, { ...value, placement: checked ? "grouped" : "separate" })
                            }
                          />
                        )}
                      </div>
                      <div data-slot="timeline-detail-expansion">
                        {category.expansion && "details" in value ? (
                          <>
                            <span data-slot="timeline-detail-field-label">{t("collapseColumn")}</span>
                            {hidden ? (
                              <span data-slot="timeline-detail-unavailable" aria-hidden="true" />
                            ) : (
                              <Switch
                                aria-label={t("collapseCategory", { name: t(category.label as any) })}
                                checked={value.details === "collapsed"}
                                onCheckedChange={(checked) =>
                                  updateCategory(category.id, {
                                    ...value,
                                    details: checked ? "collapsed" : "expanded",
                                  })
                                }
                              />
                            )}
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      <SettingsRow title={t("timelineWidth")} description={t("timelineWidthDesc")}>
        <SettingsSelect
          label={t("timelineWidth")}
          value={prefs.appearance.timelineWidth}
          options={[
            { value: "focused", label: t("widthFocused") },
            { value: "comfortable", label: t("widthComfortable") },
            { value: "wide", label: t("widthWide") },
          ]}
          onChange={(value) => save({ timelineWidth: value as typeof prefs.appearance.timelineWidth })}
        />
      </SettingsRow>
      <SettingsRow title={t("showTurnDiffs")} description={t("showTurnDiffsDesc")}>
        <Switch
          aria-label={t("showTurnDiffs")}
          checked={prefs.showTurnDiffs}
          onCheckedChange={(checked) => preferences.save({ ...prefs, showTurnDiffs: checked })}
        />
      </SettingsRow>
      <SettingsRow title={t("backgroundActivity")} description={t("backgroundActivityDesc")}>
        <SettingsSelect
          label={t("backgroundActivity")}
          value={prefs.backgroundActivity}
          options={[
            { value: "off", label: t("hidden") },
            { value: "left", label: t("left") },
            { value: "center", label: t("center") },
            { value: "right", label: t("right") },
          ]}
          onChange={(value) =>
            preferences.save({ ...prefs, backgroundActivity: value as typeof prefs.backgroundActivity })
          }
        />
      </SettingsRow>
    </SettingsSection>
  );
}
