import { createMemo, createSignal, For, Show, type JSX } from "solid-js";
import { update } from "@lingzhu/ui/solid";
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
export function TimelineSection(props: Props) {
  const tr = useT();
  const prefs = () => props.preferences.preferences;
  const levels = timelinePresets.map((item) => item.id);
  const preset = createMemo(() => timelinePreset(prefs().appearance.timelineDetail));
  const presetIndex = createMemo(() => levels.indexOf(preset() as (typeof levels)[number]));
  const detailIndex = createMemo(() => {
    const index = presetIndex();
    return index >= 0 ? index : 2;
  });
  const detailId = createMemo(() => (levels[detailIndex()] ?? "compact") as keyof typeof DETAIL_LABELS);
  const presetLabel = createMemo(() => (presetIndex() >= 0 ? t(DETAIL_LABELS[detailId()]) : "Custom"));
  const [advancedOpen, setAdvancedOpen] = createSignal(!preset());
  const visiblePlacements: Partial<Record<TimelineCategory, TimelinePlacement>> = {};

  const save = (patch: Partial<ReturnType<typeof prefs>["appearance"]>) => {
    const current = prefs();
    props.preferences.save({ ...current, appearance: { ...current.appearance, ...patch } });
  };

  const updateCategory = (category: TimelineCategory, next: TimelineDetail[TimelineCategory]) => {
    const value = timelineDetail(prefs().appearance.timelineDetail);
    save({ timelineDetail: { ...value, [category]: next } as TimelineDetail });
  };

  return (
    <SettingsSection title={t("timelineTitle")} description={t("timelineDesc")}>
      <div class="timeline-detail-control border-b-[0.5px] border-border-base py-5">
        <div class="timeline-detail-scale">
          <div
            class="timeline-detail-track"
            style={
              {
                "--timeline-detail-progress": `${(detailIndex() / (levels.length - 1)) * 100}%`,
              } as JSX.CSSProperties
            }
            aria-hidden="true"
          >
            <For each={levels}>
              {(level, index) => (
                <span
                  data-selected={index() <= detailIndex() ? "true" : undefined}
                  style={{ left: `${(index() / (levels.length - 1)) * 100}%` }}
                />
              )}
            </For>
          </div>
          <input
            type="range"
            min={0}
            max={levels.length - 1}
            step={1}
            value={detailIndex()}
            aria-label={t("timelineDetail")}
            aria-valuetext={presetLabel()}
            onInput={(event) => {
              const next = levels[Number(event.currentTarget.value)];
              save({ timelineDetail: timelineDetail(next) });
            }}
          />
        </div>
        <p class="timeline-detail-summary">
          <span>{presetLabel()}</span> · {t(DETAIL_DESCRIPTIONS[detailId()])}
        </p>
        <button
          type="button"
          class="timeline-detail-advanced"
          aria-expanded={advancedOpen()}
          onClick={() => update(setAdvancedOpen, advancedOpen, (value) => !value)}
        >
          <span>{t("advanced")}</span>
          <ChevronDown class={cn("size-4 text-text-faint transition-transform", !advancedOpen() && "-rotate-90")} />
        </button>
        <Show when={advancedOpen()}>
          <div data-slot="timeline-detail-categories" role="group" aria-label={tr("advancedPlacement")}>
            <div data-slot="timeline-detail-columns">
              <span aria-hidden="true" />
              <span>{t("groupColumn")}</span>
              <span>{t("collapseColumn")}</span>
            </div>
            <div data-slot="timeline-detail-list">
              <For each={ADVANCED}>
                {(category) => {
                  const value = () => timelineDetail(prefs().appearance.timelineDetail)[category.id];
                  const hidden = () => value().placement === "hidden";
                  return (
                    <div data-slot="timeline-detail-category" data-hidden={hidden() ? "" : undefined}>
                      <div data-slot="timeline-detail-activity">
                        <button
                          type="button"
                          data-action="timeline-detail-visibility"
                          data-variant="ghost-muted"
                          aria-pressed={!hidden()}
                          aria-label={t(hidden() ? "showCategory" : "hideCategory", {
                            name: t(category.label as never),
                          })}
                          onClick={() => {
                            if (!hidden()) visiblePlacements[category.id] = value().placement;
                            const placement = hidden()
                              ? visiblePlacements[category.id] ?? "grouped"
                              : "hidden";
                            updateCategory(category.id, {
                              ...value(),
                              placement,
                            });
                          }}
                        >
                          <Show when={hidden()} fallback={<Eye class="size-4" />}>
                            <EyeOff class="size-4" />
                          </Show>
                        </button>
                        <label>{t(category.label as never)}</label>
                      </div>
                      <div data-slot="timeline-detail-placement">
                        <span data-slot="timeline-detail-field-label">{t("groupColumn")}</span>
                        <Show
                          when={!hidden()}
                          fallback={<span data-slot="timeline-detail-unavailable" aria-hidden="true" />}
                        >
                          <Switch
                            aria-label={t("groupCategory", { name: t(category.label as never) })}
                            checked={value().placement === "grouped"}
                            onCheckedChange={(checked) =>
                              updateCategory(category.id, {
                                ...value(),
                                placement: checked ? "grouped" : "separate",
                              })
                            }
                          />
                        </Show>
                      </div>
                      <div data-slot="timeline-detail-expansion">
                        <Show when={category.expansion && "details" in value()}>
                          <span data-slot="timeline-detail-field-label">{t("collapseColumn")}</span>
                          <Show
                            when={!hidden()}
                            fallback={<span data-slot="timeline-detail-unavailable" aria-hidden="true" />}
                          >
                            <Switch
                              aria-label={t("collapseCategory", { name: t(category.label as never) })}
                              checked={"details" in value() && (value() as { details?: string }).details === "collapsed"}
                              onCheckedChange={(checked) =>
                                updateCategory(category.id, {
                                  ...value(),
                                  details: checked ? "collapsed" : "expanded",
                                } as TimelineDetail[TimelineCategory])
                              }
                            />
                          </Show>
                        </Show>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>
        </Show>
      </div>
      <SettingsRow title={t("timelineWidth")} description={t("timelineWidthDesc")}>
        <SettingsSelect
          label={t("timelineWidth")}
          value={prefs().appearance.timelineWidth}
          options={[
            { value: "focused", label: t("widthFocused") },
            { value: "comfortable", label: t("widthComfortable") },
            { value: "wide", label: t("widthWide") },
          ]}
          onChange={(value) =>
            save({ timelineWidth: value as "focused" | "comfortable" | "wide" })
          }
        />
      </SettingsRow>
      <SettingsRow title={t("showTurnDiffs")} description={t("showTurnDiffsDesc")}>
        <Switch
          aria-label={t("showTurnDiffs")}
          checked={prefs().showTurnDiffs}
          onCheckedChange={(checked) => props.preferences.save({ ...prefs(), showTurnDiffs: checked })}
        />
      </SettingsRow>
      <SettingsRow title={t("backgroundActivity")} description={t("backgroundActivityDesc")}>
        <SettingsSelect
          label={t("backgroundActivity")}
          value={prefs().backgroundActivity}
          options={[
            { value: "off", label: t("hidden") },
            { value: "left", label: t("left") },
            { value: "center", label: t("center") },
            { value: "right", label: t("right") },
          ]}
          onChange={(value) =>
            props.preferences.save({
              ...prefs(),
              backgroundActivity: value as "off" | "left" | "center" | "right",
            })
          }
        />
      </SettingsRow>
    </SettingsSection>
  );
}
