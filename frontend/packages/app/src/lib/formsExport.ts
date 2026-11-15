import { exportJson, exportedAt, exportName } from "./exportFile";

import type { FormRecord } from "@lingzhu/ui/types";

/** Builds a timestamped, filesystem-safe name for a forms export. */
export function formsExportName(sessionID: string, count: number, date = new Date()): string {
  return exportName(sessionID, "forms", { count, fallback: "session", date });
}

/** Serializes forms with fields, status, replies and timestamps. */
export function serializeForms(input: {
  sessionId: string;
  forms: FormRecord[];
  date?: Date;
}): string {
  return exportJson({
    sessionId: input.sessionId,
    exportedAt: exportedAt(input.date),
    count: input.forms.length,
    forms: input.forms.map((form) => ({
    id: form.id,
    sessionId: form.sessionID,
    title: form.title,
    status: form.status,
    askedAt: form.askedAt,
    answeredAt: form.answeredAt ?? null,
    cancelled: form.cancelled ?? false,
    fields: form.fields,
    values: form.values ?? null,
    })),
  });
}
