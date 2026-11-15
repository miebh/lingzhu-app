/** Small text helpers shared by list- and label-rendering components. */

/** Uppercases the first character, leaving the rest untouched. */
export function capitalize(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

/** Splits comma- or newline-separated text into trimmed, non-empty items. */
export function splitList(text: string | undefined): string[] {
  return (text ?? "")
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}
