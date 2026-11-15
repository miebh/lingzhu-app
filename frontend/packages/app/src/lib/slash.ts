import type { MessageKey } from "@lingzhu/ui/i18n";
import type { SlashCommand } from "@lingzhu/ui/types";

/** Translator the built-in commands use, so descriptions follow the UI language. */
export type SlashTranslate = (key: MessageKey) => string;

export interface SlashSessionTarget {
  workspace: string;
  sessionID: string;
  title: string;
}

export interface SlashActions {
  chooseModel: () => void;
  connectProvider: () => void;
  reload: () => void;
  cycleAgent: () => void;
  newSession: (path: string) => void;
  undo: (session: SlashSessionTarget) => void;
  redo: (session: SlashSessionTarget) => void;
  compact: (session: SlashSessionTarget) => void;
  fork: (session: SlashSessionTarget) => void;
  exportSession: (session: SlashSessionTarget) => void;
  openFile: (path: string) => void;
  mcp: (path: string) => void;
}

export interface SlashContext {
  path?: string;
  session?: {
    workspace: string;
    id: string;
    title?: string;
    hasMessages?: boolean;
  };
  /** False when the session has no revert state to undo. */
  canUndo?: boolean;
  canRedo?: boolean;
  agentCount?: number;
  actions: SlashActions;
}

/**
 * The built-in slash commands, in the same order and with the same triggers as
 * the desktop composer. Unavailable commands stay out of the list.
 */
export function builtinSlashCommands(
  { path, session, canUndo, canRedo, agentCount, actions }: SlashContext,
  tr: SlashTranslate,
): SlashCommand[] {
  const commands: SlashCommand[] = [
    {
      name: "model",
      description: tr("slashModel"),
      template: "",
      plugin: "builtin",
      keybind: "mod+'",
      run: () => actions.chooseModel(),
    },
    {
      name: "connect",
      description: tr("slashConnect"),
      template: "",
      plugin: "builtin",
      run: () => actions.connectProvider(),
    },
    {
      name: "reload",
      description: tr("slashReload"),
      template: "",
      plugin: "builtin",
      run: () => actions.reload(),
    },
  ];

  if ((agentCount ?? 0) > 1) {
    commands.push({
      name: "agent",
      description: tr("slashAgent"),
      template: "",
      plugin: "builtin",
      keybind: "mod+.",
      run: () => actions.cycleAgent(),
    });
  }

  if (path) {
    commands.push({
      name: "new",
      description: "",
      template: "",
      plugin: "builtin",
      run: () => actions.newSession(path),
    });
  }

  if (session && canUndo) {
    commands.push({
      name: "undo",
      description: tr("slashUndo"),
      template: "",
      plugin: "builtin",
      run: () => actions.undo(sessionTarget(session)),
    });
  }

  if (session && canRedo) {
    commands.push({
      name: "redo",
      description: tr("slashRedo"),
      template: "",
      plugin: "builtin",
      run: () => actions.redo(sessionTarget(session)),
    });
  }

  if (session?.hasMessages) {
    commands.push(
      {
        name: "compact",
        description: tr("slashCompact"),
        template: "",
        plugin: "builtin",
        run: () => actions.compact(sessionTarget(session)),
      },
      {
        name: "fork",
        description: tr("slashFork"),
        template: "",
        plugin: "builtin",
        run: () => actions.fork(sessionTarget(session)),
      },
    );
  }

  if (session) {
    commands.push({
      name: "export",
      description: tr("slashExport"),
      template: "",
      plugin: "builtin",
      run: () => actions.exportSession(sessionTarget(session)),
    });
    commands.push({
      name: "goal",
      description: tr("slashGoal"),
      template: "",
      plugin: "builtin",
    });
  }

  if (path) {
    commands.push(
      {
        name: "open",
        description: tr("slashOpen"),
        template: "",
        plugin: "builtin",
        keybind: "mod+p",
        run: () => actions.openFile(path),
      },
      {
        name: "mcp",
        description: tr("slashMcp"),
        template: "",
        plugin: "builtin",
        keybind: "mod+;",
        run: () => actions.mcp(path),
      },
    );
  }

  return commands;
}

function sessionTarget(session: { workspace: string; id: string; title?: string }): SlashSessionTarget {
  return {
    workspace: session.workspace,
    sessionID: session.id,
    title: session.title || session.id,
  };
}

/** The primary agent `delta` steps from `current`, wrapping at either end. */
export function cycleAgentID(agents: { id: string }[], current: string | undefined, delta: number): string | undefined {
  if (agents.length === 0) return undefined;
  const index = agents.findIndex((agent) => agent.id === current);
  if (index < 0) return agents[delta < 0 ? agents.length - 1 : 0]!.id;
  return agents[(index + delta + agents.length) % agents.length]!.id;
}

/** The next primary agent after `current`, wrapping at the end. */
export function nextAgentID(agents: { id: string }[], current?: string): string | undefined {
  return cycleAgentID(agents, current, 1);
}

/** Custom commands lead the list; a custom trigger shadows a built-in one. */
export function withBuiltinCommands(custom: SlashCommand[], builtins: SlashCommand[]): SlashCommand[] {
  const names = new Set(custom.map((command) => command.name));
  return [...custom, ...builtins.filter((command) => !names.has(command.name))];
}

/** Formats a stored keybind for display, using the platform's modifier key. */
export function formatKeybind(value?: string): string | undefined {
  if (!value) return undefined;
  const mac = typeof navigator !== "undefined" && /(Mac|iPod|iPhone|iPad)/.test(navigator.platform);
  return value
    .split("+")
    .map((part) => {
      if (part === "mod") return mac ? "⌘" : "Ctrl";
      if (part === "ctrl") return mac ? "⌃" : "Ctrl";
      if (part === "meta") return mac ? "⌘" : "Win";
      if (part === "shift") return "Shift";
      if (part === "alt") return mac ? "⌥" : "Alt";
      if (part === "option") return mac ? "⌥" : "Alt";
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join("+");
}
