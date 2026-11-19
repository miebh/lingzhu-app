/**
 * Format Code Mode output for display. A JSON result is indented, while
 * trailing "Warnings:" and "Logs:" sections stay separate so the UI can style
 * them as logs instead of treating the whole payload as JSON.
 */
export function formatExecuteOutput(output: string) {
  const end = output.search(/\n\n(Warnings|Logs):\n/);
  const result = end === -1 ? output : output.slice(0, end);
  const rest = end === -1 ? undefined : output.slice(end).trim();
  const json = indentedJson(result);
  return {
    json,
    rest,
    text: rest === undefined ? (json ?? result) : `${json ?? result}\n\n${rest}`,
  };
}

function indentedJson(text: string): string | undefined {
  if (!text.startsWith("{") && !text.startsWith("[")) return undefined;
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return undefined;
  }
}
