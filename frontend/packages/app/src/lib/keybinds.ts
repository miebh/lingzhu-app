/** One rebindable global command. The default uses the reference shell's bindings. */
export interface KeybindAction {
  id: string;
  label: string;
  group: string;
  defaultKeybind: string;
  /** Only show the row when the action is available in this build. */
  optional?: boolean;
}

export const KEYBIND_ACTIONS: KeybindAction[] = [
  { id: "tab.new", label: "New session", group: "Session", defaultKeybind: "mod+t" },
  { id: "tab.reopen", label: "Reopen closed tab", group: "Session", defaultKeybind: "mod+shift+t" },
  { id: "tab.close", label: "Close tab", group: "Session", defaultKeybind: "mod+w" },
  { id: "tab.next", label: "Next tab", group: "Session", defaultKeybind: "ctrl+tab" },
  { id: "tab.previous", label: "Previous tab", group: "Session", defaultKeybind: "ctrl+shift+tab" },
  { id: "panel.review", label: "Toggle review panel", group: "Session", defaultKeybind: "mod+shift+r" },
  { id: "sidebar.toggle", label: "Toggle sidebar", group: "General", defaultKeybind: "mod+shift+b" },
  { id: "home.toggle", label: "Home", group: "General", defaultKeybind: "mod+b" },
  { id: "palette", label: "Command palette", group: "General", defaultKeybind: "mod+k" },
  { id: "settings.open", label: "Settings", group: "General", defaultKeybind: "mod+," },
  { id: "input.focus", label: "Focus input", group: "General", defaultKeybind: "ctrl+l" },
  { id: "permissions.auto", label: "Auto-accept permissions", group: "General", defaultKeybind: "mod+shift+a" },
  { id: "message.previous", label: "Previous message", group: "Navigation", defaultKeybind: "mod+alt+[" },
  { id: "message.next", label: "Next message", group: "Navigation", defaultKeybind: "mod+alt+]" },
  { id: "model.choose", label: "Choose model", group: "Model and agent", defaultKeybind: "mod+'" },
  { id: "agent.next", label: "Next agent", group: "Model and agent", defaultKeybind: "mod+." },
  { id: "prompt.attach", label: "Add files and images", group: "Prompt", defaultKeybind: "mod+u" },
];

export interface KeybindParts {
  mod: boolean;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

const MODIFIERS = new Set(["shift", "control", "alt", "meta"]);

function isMacPlatform(): boolean {
  return typeof navigator !== "undefined" && /(Mac|iPod|iPhone|iPad)/.test(navigator.platform);
}

function parseKeybind(value: string): KeybindParts | undefined {
  const parts = value.toLowerCase().split("+").filter(Boolean);
  const key = parts.pop();
  if (!key || MODIFIERS.has(key)) return undefined;
  const parsed: KeybindParts = { mod: false, ctrl: false, meta: false, alt: false, shift: false, key };
  for (const part of parts) {
    if (part === "mod") parsed.mod = true;
    else if (part === "ctrl" || part === "control") parsed.ctrl = true;
    else if (part === "meta" || part === "cmd" || part === "command") parsed.meta = true;
    else if (part === "alt" || part === "option") parsed.alt = true;
    else if (part === "shift") parsed.shift = true;
    else return undefined;
  }
  if (parsed.ctrl || parsed.meta) {
    // A platform's own modifier also satisfies "mod", so ctrl+l and mod+l
    // stay reachable when the stored binding names the literal modifier.
    if (!isMacPlatform() && parsed.ctrl) parsed.mod = true;
    if (isMacPlatform() && parsed.meta) parsed.mod = true;
  }
  return parsed;
}

/** Whether a keydown event is the stored binding. Modifiers must match exactly. */
export function matchesKeybind(event: KeyboardEvent, value: string | undefined): boolean {
  if (!value) return false;
  const parts = parseKeybind(value);
  if (!parts) return false;
  const mac = isMacPlatform();
  const mod = mac ? event.metaKey : event.ctrlKey;
  if (parts.mod !== mod) return false;
  if (parts.ctrl && !mac) {
    // "mod" already covers the platform's control key on Windows and Linux.
  } else if (parts.ctrl !== (mac ? event.ctrlKey : false)) {
    return false;
  }
  if (parts.meta && mac) {
    // "mod" already covers the platform's command key on macOS.
  } else if (parts.meta !== (mac ? false : event.metaKey)) {
    return false;
  }
  if (parts.alt !== event.altKey || parts.shift !== event.shiftKey) return false;
  return event.key.toLowerCase() === parts.key;
}

/** Records the keydown as a stored binding, or undefined for a bare modifier. */
export function keybindFromEvent(event: KeyboardEvent): string | undefined {
  if (MODIFIERS.has(event.key.toLowerCase())) return undefined;
  const mac = isMacPlatform();
  const parts: string[] = [];
  if (mac ? event.metaKey : event.ctrlKey) parts.push("mod");
  if (mac && event.ctrlKey) parts.push("ctrl");
  if (!mac && event.metaKey) parts.push("meta");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  parts.push(event.key.toLowerCase());
  return parts.join("+");
}

/** Stored overrides win; every other action keeps its default. */
export function effectiveKeybinds(overrides: Record<string, string> | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const action of KEYBIND_ACTIONS) {
    result[action.id] = overrides?.[action.id] || action.defaultKeybind;
  }
  return result;
}
