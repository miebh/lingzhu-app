import type {
  TimelineDetail,
  TimelineDetailInput,
  TimelineDetailPreset,
  TimelinePlacement,
} from "@lingzhu/ui/types";

/** The desktop timeline presets, weakest to strongest. */
export const timelinePresets: { id: TimelineDetailPreset; value: TimelineDetail }[] = [
  {
    id: "text-only",
    value: {
      shell: { placement: "hidden", details: "collapsed" },
      edit: { placement: "hidden", details: "collapsed" },
      thinking: { placement: "hidden", details: "collapsed" },
      subagents: { placement: "hidden" },
      notices: { placement: "hidden" },
      tools: { placement: "hidden" },
      commentary: { placement: "separate" },
    },
  },
  {
    id: "quiet",
    value: {
      shell: { placement: "hidden", details: "collapsed" },
      edit: { placement: "grouped", details: "collapsed" },
      thinking: { placement: "hidden", details: "collapsed" },
      subagents: { placement: "separate" },
      notices: { placement: "hidden" },
      tools: { placement: "hidden" },
      commentary: { placement: "separate" },
    },
  },
  {
    id: "compact",
    value: {
      shell: { placement: "grouped", details: "collapsed" },
      edit: { placement: "grouped", details: "collapsed" },
      thinking: { placement: "grouped", details: "collapsed" },
      subagents: { placement: "separate" },
      notices: { placement: "grouped" },
      tools: { placement: "grouped" },
      commentary: { placement: "separate" },
    },
  },
  {
    id: "detailed",
    value: {
      shell: { placement: "separate", details: "expanded" },
      edit: { placement: "separate", details: "expanded" },
      thinking: { placement: "grouped", details: "collapsed" },
      subagents: { placement: "separate" },
      notices: { placement: "grouped" },
      tools: { placement: "grouped" },
      commentary: { placement: "separate" },
    },
  },
  {
    id: "everything",
    value: {
      shell: { placement: "separate", details: "expanded" },
      edit: { placement: "separate", details: "expanded" },
      thinking: { placement: "separate", details: "expanded" },
      subagents: { placement: "separate" },
      notices: { placement: "separate" },
      tools: { placement: "separate" },
      commentary: { placement: "separate" },
    },
  },
];

/** The preset shown before preferences load; matches the desktop default. */
export const defaultTimelineDetail = timelinePresets.find((preset) => preset.id === "compact")!.value;

export function timelinePreset(value: TimelineDetailInput | undefined): TimelineDetailPreset | undefined {
  if (!value || typeof value === "string") {
    // Legacy three-level names win over same-named presets.
    if (value === "compact") return "compact";
    if (value === "detailed") return "everything";
    if (value === "summary") return "compact";
    return value;
  }

  return timelinePresets.find((preset) =>
    Object.entries(preset.value).every(([category, expected]) => {
      const current = (value as unknown as Record<string, { placement: TimelinePlacement; details?: string }>)[category];
      if (!current) return false;
      if (current.placement !== expected.placement) return false;
      if (!("details" in expected)) return true;
      return current.details === expected.details;
    }),
  )?.id;
}

/**
 * Resolves every accepted detail shape to the full category map.
 *
 * The result is shared per input, never copied: callers treat it as read-only,
 * and a stable identity is what lets the memoized timeline rows skip a
 * re-render when only the streamed text changed.
 */
export function timelineDetail(value: TimelineDetailInput | undefined): TimelineDetail {
  if (!value) return PRESETS.get(defaultTimelineDetail) ?? clone(defaultTimelineDetail);
  if (typeof value === "string") {
    // Legacy three-level names win over same-named presets.
    if (value === "compact") return presetDetail("compact");
    if (value === "detailed") return presetDetail("everything");
    if (value === "summary") return presetDetail("compact");
    if (timelinePresets.some((item) => item.id === value)) return presetDetail(value as TimelineDetailPreset);
    return PRESETS.get(defaultTimelineDetail) ?? clone(defaultTimelineDetail);
  }

  const cached = OBJECTS.get(value);
  if (cached) return cached;
  const resolved: TimelineDetail = {
    shell: normalizeExpanded(value.shell, defaultTimelineDetail.shell),
    edit: normalizeExpanded(value.edit, defaultTimelineDetail.edit),
    thinking: normalizeExpanded(value.thinking, defaultTimelineDetail.thinking),
    subagents: normalizePlacement(value.subagents, defaultTimelineDetail.subagents),
    notices: normalizePlacement(value.notices, defaultTimelineDetail.notices),
    tools: normalizePlacement(value.tools, defaultTimelineDetail.tools),
    commentary: normalizePlacement(value.commentary, defaultTimelineDetail.commentary),
  };
  OBJECTS.set(value, resolved);
  return resolved;
}

const PRESETS = new Map<TimelineDetail, TimelineDetail>();
const OBJECTS = new WeakMap<object, TimelineDetail>();

function presetDetail(id: TimelineDetailPreset): TimelineDetail {
  const preset = timelinePresets.find((item) => item.id === id)!.value;
  const cached = PRESETS.get(preset);
  if (cached) return cached;
  const resolved = clone(preset);
  PRESETS.set(preset, resolved);
  return resolved;
}

function clone(value: TimelineDetail): TimelineDetail {
  return {
    shell: { ...value.shell },
    edit: { ...value.edit },
    thinking: { ...value.thinking },
    subagents: { ...value.subagents },
    notices: { ...value.notices },
    tools: { ...value.tools },
    commentary: { ...value.commentary },
  };
}

function normalizePlacement(
  value: { placement?: TimelinePlacement } | undefined,
  fallback: { placement: TimelinePlacement },
) {
  return {
    placement: isPlacement(value?.placement) ? value!.placement! : fallback.placement,
  };
}

function normalizeExpanded(
  value: { placement?: TimelinePlacement; details?: "collapsed" | "expanded" } | undefined,
  fallback: { placement: TimelinePlacement; details: "collapsed" | "expanded" },
) {
  return {
    placement: isPlacement(value?.placement) ? value!.placement! : fallback.placement,
    details: value?.details === "expanded" || value?.details === "collapsed" ? value.details : fallback.details,
  };
}

function isPlacement(value: unknown): value is TimelinePlacement {
  return value === "separate" || value === "grouped" || value === "hidden";
}
