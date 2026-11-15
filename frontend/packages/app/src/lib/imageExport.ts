import { exportSlug, exportStamp } from "./exportFile";

/** Builds a timestamped, filesystem-safe image name from the prompt. */
export function imageExportName(prompt: string, extension: string, date = new Date()): string {
  const ext = extension.trim() || ".png";
  return `${exportSlug(prompt, "image")}-${exportStamp(date)}${ext.startsWith(".") ? ext : `.${ext}`}`;
}
