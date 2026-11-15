import type { ScheduleWhen } from "@lingzhu/ui/types";

/** Human label for a stored schedule trigger. */
export function scheduleWhenLabel(when: ScheduleWhen): string {
  switch (when.type) {
    case "in":
      return `in ${when.in ?? ""}`;
    case "every":
      return `every ${when.every ?? ""}`;
    case "at":
      return `at ${when.at ?? ""}`;
    default:
      return when.type;
  }
}
