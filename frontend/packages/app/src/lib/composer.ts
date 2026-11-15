/** Pure submission state shared by the composer UI and its tests. */
export type ComposerSubmitMode = "stop" | "send" | "blocked";

export function composerSubmitMode(input: {
  running: boolean;
  empty: boolean;
  sending: boolean;
  attaching: boolean;
  attachmentsBlocked: boolean;
  disabled: boolean;
}): ComposerSubmitMode {
  if (input.running && input.empty) return "stop";
  if (input.disabled || input.empty || input.sending || input.attaching || input.attachmentsBlocked) {
    return "blocked";
  }
  return "send";
}

/** The command name being typed after a leading slash, or null. */
export function slashQuery(text: string): string | null {
  if (!text.startsWith("/")) return null;
  const rest = text.slice(1);
  if (!/\s/.test(rest)) return rest.toLowerCase();
  return null;
}

export function matchesComposerCommand(
  command: { name: string; description?: string; plugin?: string },
  query: string,
): boolean {
  if (!query) return true;
  return (
    command.name.toLowerCase().includes(query) ||
    (command.description ?? "").toLowerCase().includes(query) ||
    (command.plugin ?? "").toLowerCase().includes(query)
  );
}

/** Clamps a selection into a possibly empty command list. */
export function composerActiveIndex(selected: number, length: number): number {
  return Math.min(selected, Math.max(length - 1, 0));
}

/** Wraps arrow-key movement over the filtered command list. */
export function moveComposerSelection(selected: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (selected + delta + length) % length;
}

