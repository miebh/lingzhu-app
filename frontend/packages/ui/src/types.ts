export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface MessagePart {
  type: "reasoning" | "text";
  text: string;
  created?: string;
  completed?: string;
}

export interface PromptComment {
  id?: string;
  file: string;
  line?: number;
  body: string;
}

export interface PromptReference {
  name: string;
  mime?: string;
  path: string;
}

export interface Message {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
  diff?: string;
  /** UI-only tool result fields such as counts and nested Code Mode calls. */
  metadata?: Record<string, unknown>;
  /** Inline media carried by a user or tool message. */
  attachments?: MessageAttachment[];
  /** A command the user ran directly. */
  shell?: ShellRun;
  /** Hides a system notification from the transcript; source fields let
      history draw the same notice the live event showed. */
  synthetic?: boolean;
  syntheticSource?: string;
  syntheticDescription?: string;
  syntheticState?: string;
  /** UI-only provider reasoning attached to an assistant message. */
  reasoning?: string;
  reasoningCreated?: string;
  reasoningCompleted?: string;
  /** Ordered reasoning and commentary parts, newest turn last. */
  parts?: MessagePart[];
  /** Paths a synthetic notice mentioned, so history can redraw the row. */
  syntheticPaths?: string[];
  /** Instruction sections a synthetic update changed, so history can name them. */
  syntheticSources?: string[];
  syntheticId?: string;
  /** Compaction marks a checkpoint row that separates compacted history. */
  compaction?: boolean;
  compactionCovered?: number;
  compactionReason?: string;
  /** Tool result failure flag kept for history replay. */
  failed?: boolean;
  /** Tool result interrupted by the user; rendered as cancelled, not an error. */
  cancelled?: boolean;
  /** Durable time the message entered the conversation. */
  created?: string;
  /** Recorded on user turns for the footer meta. */
  agent?: string;
  provider?: string;
  model?: string;
  /** Comments and references sent with a user prompt. */
  comments?: PromptComment[];
  references?: PromptReference[];
  voice?: boolean;
  /** A transcript-only agent or model change row. */
  switch?: MessageSwitch;
  /** A transcript-only row explaining why a turn failed. */
  failure?: { message: string };
}

/** One inline attachment on a user or tool message. */
export interface MessageAttachment {
  name?: string;
  mime: string;
  data?: string;
  kind?: string;
  start?: number;
  end?: number;
}

/** A transcript-only row recording an agent or model change. */
export interface MessageSwitch {
  kind: string;
  agent?: string;
  previous?: string;
  provider?: string;
  model?: string;
  previousProvider?: string;
  previousModel?: string;
}

/** One command the user ran directly, with its exit state. */
export interface ShellRun {
  command?: string;
  output?: string;
  exit?: number;
  timedOut?: boolean;
  truncated?: boolean;
  /** A background command that has not finished yet. */
  running?: boolean;
}

/** One one-shot shell command in the core. */
export interface CoreShell {
  id: string;
  status: 'running' | 'exited' | 'timeout' | 'killed';
  command: string;
  cwd: string;
  shell: string;
  file: string;
  pid?: number;
  exit?: number;
  signal?: string;
  metadata: Record<string, unknown>;
  time: { started: number; completed?: number };
}

export interface CoreShellOutput {
  output: string;
  cursor: number;
  size: number;
  truncated: boolean;
}

export interface CoreShellCreate {
  command: string;
  cwd?: string;
  timeout?: number;
  metadata?: Record<string, unknown>;
}

/** One model advertised by a core provider. */
export interface CoreProviderModel {
  id: string;
  name: string;
  contextWindow: number;
}

/** One configured provider reported by the core; no key is included. */
export interface CoreProvider {
  id: string;
  name: string;
  baseUrl: string;
  ready: boolean;
  models: CoreProviderModel[];
}

/** One selectable model across all core providers. */
export interface CoreModel {
  id: string;
  name: string;
  providerId: string;
  contextWindow: number;
  default: boolean;
}

/** Sanitized effective core configuration. */
export interface CoreConfig {
  path?: string;
  workdir?: string;
  dataDir?: string;
  provider?: string;
  model?: string;
  defaultAgent?: string;
  maxSteps: number;
  shell?: string[];
  permission?: ConfigRule[];
  contextWindow?: number;
  compactKeep?: number;
}

/** Editable view of the shared core config; the API key is never returned. */
export interface AppSettings {
  configPath: string;
  provider: string;
  model: string;
  providers: ProviderSettings[];
  maxSteps: number;
  contextWindow: number;
  compactKeep: number;
  systemPrompt: string;
  shell: string[];
  permission: ConfigRule[];
}

export interface ProviderSettings {
  id: string;
  name: string;
  baseUrl: string;
  apiKeySet: boolean;
  apiKeyEnv: string;
  ready: boolean;
  /** The model list comes from the endpoint, so a client refreshes it. */
  dynamicModels?: boolean;
  blacklist: string[];
  whitelist: string[];
  models: ModelSettings[];
}

export interface ModelSettings {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens?: number;
  enabled: boolean;
  toolCall?: boolean;
  reasoning?: boolean;
  attachment?: boolean;
  cost?: ModelCost;
  modalities?: ModelModalities;
  options?: Record<string, unknown>;
  variants?: Record<string, Record<string, unknown>>;
}

export interface ModelCost {
  input?: number;
  output?: number;
  cache_read?: number;
  cache_write?: number;
}

export interface ModelModalities {
  input?: string[];
  output?: string[];
}

/** Picker visibility for one model; saved without restarting a core. */
export interface ModelVisibility {
  provider: string;
  model: string;
  enabled: boolean;
}

/** Settings payload; an empty apiKey keeps the stored key unless clearKey is set. */
export interface SettingsInput {
  provider: string;
  model: string;
  providers: ProviderInput[];
  maxSteps: number;
  contextWindow: number;
  compactKeep: number;
  systemPrompt: string;
  shell: string[];
  permission: ConfigRule[];
}

export interface ProviderInput {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  apiKeyEnv: string;
  clearKey: boolean;
  blacklist: string[];
  whitelist: string[];
  models: ModelInput[];
}

export interface ModelInput {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens?: number;
  enabled: boolean;
  toolCall?: boolean;
  reasoning?: boolean;
  attachment?: boolean;
  cost?: ModelCost;
  modalities?: ModelModalities;
  options?: Record<string, unknown>;
  variants?: Record<string, Record<string, unknown>>;
}

/** Built-in starting point for a mainstream provider. */
export interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyEnv: string;
  /** Key the endpoint accepts as-is, such as a local gateway's app id. */
  defaultApiKey?: string;
  /** The catalog changes per machine, so models come from GET /models. */
  dynamicModels?: boolean;
  models: PresetModel[];
}

/** The local magpie gateway and whether it is answering. */
export interface MagpieGateway {
  url: string;
  available: boolean;
  version: string;
}

export interface PresetModel {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens?: number;
  toolCall?: boolean;
  reasoning?: boolean;
  attachment?: boolean;
  cost?: ModelCost;
  modalities?: ModelModalities;
  variants?: Record<string, Record<string, unknown>>;
}

/** Local preferences; applied immediately and never restart a core. */
export interface AppPreferences {
  defaultWorkspace: string;
  /** Where a fresh app launch lands: the previous workspace, a local one, or none. */
  workspaceDestination: "last-used" | "local" | "new";
  autoApprove: boolean;
  /** Default delivery for a follow-up while a run is active. */
  followUpBehavior: "steer" | "queue";
  /** Show the agent picker in the composer. */
  showAgent: boolean;
  showMessageAgent: boolean;
  /** Underline misspelled words in the composer. */
  spellcheck: boolean;
  /** Fold long user messages behind Read more. */
  foldUserMessages: boolean;
  /** Show the per-turn changed-files summary. */
  showTurnDiffs: boolean;
  /** Position of the running background sessions indicator. */
  backgroundActivity: "off" | "left" | "center" | "right";
  /** Allow trackpad pinch and Ctrl-scroll to change the UI zoom. */
  pinchZoom: boolean;
  /** Preview the updated icon set. */
  newIcons: boolean;
  /** Preview the keyboard-first question dock. */
  newQuestionUI: boolean;
  sounds: SoundPreferences;
  /** The last model picked anywhere in the app; used by new sessions. */
  defaultModel: ModelSelection;
  /** Per-project display name overrides. */
  projectNames: Record<string, string>;
  /** Per-project auto-approve overrides. */
  projectAutoApprove: Record<string, boolean>;
  /** Per-project avatar icon artwork keys. */
  projectIcons: Record<string, string>;
  /** Per-project avatar color keys. */
  projectColors: Record<string, string>;
  /** Per-project command run when a new worktree opens. */
  projectWorktreeStartup: Record<string, string>;
  /** Named API-key credentials per provider. */
  providerAccounts: Record<string, { id: string; name: string; key: string }[]>;
  /** Active credential id per provider. */
  activeProviderAccounts: Record<string, string>;
  favoriteModels: ModelSelection[];
  recentModels: ModelSelection[];
  pinnedSessions: string[];
  appearance: AppearancePreferences;
  notifications: NotificationPreferences;
  /** Stored keybind overrides; unset actions keep their defaults. */
  keybinds: Record<string, string>;
}

/** Which session events raise a notification. */
export interface NotificationPreferences {
  agent: boolean;
  permissions: boolean;
  questions: boolean;
  errors: boolean;
}

/** Which session events play a short sound. */
export interface SoundPreferences {
  agent: boolean;
  permissions: boolean;
  questions: boolean;
  errors: boolean;
  interface: boolean;
  /** Selected tone per event key. */
  tones: Record<string, string>;
}

export interface ModelSelection {
  provider: string;
  model: string;
}

/** One transcript category whose placement and expansion the user can tune. */
export type TimelineCategory = "shell" | "edit" | "thinking" | "subagents" | "notices" | "tools" | "commentary";

/** Where a category renders relative to the collapsed tool group. */
export type TimelinePlacement = "separate" | "grouped" | "hidden";

/** Whether a rendered category opens its details by default. */
export type TimelineExpansion = "collapsed" | "expanded";

/** Per-category placement and expansion, matching the desktop timeline controls. */
export interface TimelineDetail {
  shell: { placement: TimelinePlacement; details: TimelineExpansion };
  edit: { placement: TimelinePlacement; details: TimelineExpansion };
  thinking: { placement: TimelinePlacement; details: TimelineExpansion };
  subagents: { placement: TimelinePlacement };
  notices: { placement: TimelinePlacement };
  tools: { placement: TimelinePlacement };
  commentary: { placement: TimelinePlacement };
}

/** The named points on the timeline detail slider. */
export type TimelineDetailPreset = "everything" | "detailed" | "compact" | "quiet" | "text-only";

/** Accepts a preset, the legacy three-level value, or a full category map. */
export type TimelineDetailInput = TimelineDetail | TimelineDetailPreset | "summary";

export interface AppearancePreferences {
  fontFamily: string;
  /** Font for code blocks and inline code. */
  codeFont: string;
  /** Font for the terminal surface. */
  terminalFont: string;
  /** Named UI theme. */
  themeName: string;
  density: "comfortable" | "compact";
  /** UI zoom percentage, 80–150. */
  zoom: number;
  timelineWidth: "focused" | "comfortable" | "wide";
  reduceMotion: "system" | "on" | "off";
  /** Follow the OS, or pin the color scheme. */
  theme: "system" | "dark" | "light";
  /** UI language. */
  language: "en" | "zh";
  /** Top tab strip, the vertical side-tab rail, or the session inbox. */
  tabLayout: "horizontal" | "vertical" | "inbox";
  /** Vertical rail shows open tabs only, or the project/session tree below them. */
  sidebarOrganize: "list" | "projects";
  timelineDetail: TimelineDetail;
}

/** Read-only About data. */
export interface AppInfo {
  version: string;
  built: string;
  configPath: string;
  databasePath: string;
  appDataDir: string;
  dataDir: string;
  logPath: string;
}

/** One foreground session command result. */
export interface ShellResult {
  output: string;
  exit: number;
  timedOut: boolean;
  truncated: boolean;
}

/** One running child session created by a parent session. */
export interface SessionSubagent {
  id: string;
  title?: string;
  agent?: string;
  started: string;
}

/** One background session command. */
export interface JobInfo {
  id: string;
  sessionId: string;
  command: string;
  file: string;
  status: string;
  exitCode: number;
  error?: string;
  started: string;
  finished: string;
}

/** The tail of one background command's output plus its current snapshot. */
export interface JobOutput {
  job: JobInfo;
  output: string;
  running: boolean;
}

/** One file or directory in the workspace tree. */
export interface FsEntry {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'symlink' | string;
  size: number;
  modified?: string;
  hidden?: boolean;
}

/** One directory listing. */
export interface FileList {
  path: string;
  entries: FsEntry[];
  truncated: boolean;
}

/** A bounded text preview of one file. */
export interface FileContent {
  path: string;
  content: string;
  truncated: boolean;
  binary: boolean;
  size: number;
}

/** Result of replacing one file. */
export interface FileWrite {
  path: string;
  size: number;
}

/** Workspace metadata for the core instance. */
export interface ProjectInfo {
  directory: string;
  name: string;
  config?: string;
  instructions?: string;
  sessions: number;
  vcs?: VCSInfo | null;
}

/** One configured permission rule. */
export interface PermissionRule {
  action: string;
  resource: string;
  effect: string;
}

/** Where one session runs and its permission rules. */
export interface SessionLocation {
  sessionId: string;
  directory: string;
  project: string;
  worktree?: string;
  parent?: string;
  parentTitle?: string;
  provider: string;
  model: string;
  agent: string;
  permissions: PermissionRule[];
}

/** One generated image returned inline as base64. */
export interface GeneratedImage {
  prompt: string;
  mediaType: string;
  extension: string;
  data: string;
  size: number;
  revisedPrompt?: string;
}

/** One image or PDF attachment from a tool result. */
export interface MediaItem {
  id: string;
  tool: string;
  mime: string;
  name?: string;
  data: string;
  size: number;
  seq: number;
  at: string;
}

/** One session's image and PDF attachments. */
export interface MediaList {
  sessionId: string;
  media: MediaItem[];
  count: number;
  truncated: boolean;
}

/** Session store schema, counts and legacy backups. */
export interface MigrationStatus {
  schemaVersion: number;
  sessionDir: string;
  sessions: number;
  events: number;
  legacyBackups: string[];
}

/** Migration status plus the database path. */
export interface MigrationInfo {
  migration: MigrationStatus;
  database: string;
}

/** One short-lived single-use pairing code. */
export interface PairingCode {
  code: string;
  sessionId: string;
  expiresAt: string;
  expiresIn: number;
}

/** Active pairings of one session. */
export interface PairingList {
  sessionId: string;
  pairings: PairingCode[];
  count: number;
}

/** Result of redeeming one pairing code. */
export interface PairingResult {
  paired: boolean;
  sessionId: string;
  directory: string;
  pairedAt: string;
  expiresAt: string;
}

/** Workspace and runtime information for one session. */
export interface SessionEnvironment {
  id: string;
  workdir: string;
  shell: string[];
  running: boolean;
  provider: string;
  model: string;
  agent: string;
  os: string;
  arch: string;
}

/** One field of a structured session form. */
export interface FormField {
  name: string;
  label?: string;
  type?: string;
  required?: boolean;
  options?: string[];
  placeholder?: string;
  default?: string;
}

/** One structured form request and its answer. */
export interface FormRecord {
  id: string;
  sessionID: string;
  title: string;
  fields: FormField[];
  status: string;
  askedAt: string;
  answeredAt?: string;
  values?: Record<string, unknown>;
  cancelled?: boolean;
}

/** One durable session event as returned by the log endpoint. */
export interface SessionEvent {
  seq: number;
  type: string;
  at: string;
  data: Record<string, unknown>;
}

/** One live event pushed by a per-session tail. */
export interface SessionTailEvent {
  workspace: string;
  sessionId: string;
  event: SessionEvent;
}

/** One exported session and its events. */
/** One text file chosen through the native open dialog. */
export interface PickedFile {
  path: string;
  name: string;
  content: string;
}

export interface SessionBundle {
  id: string;
  title?: string;
  provider?: string;
  model?: string;
  agent?: string;
  events: SessionEvent[];
}

/** One event from the all-session stream. */
export interface CoreEvent {
  workspace: string;
  sessionId: string;
  seq: number;
  type: string;
  at: string;
  data: Record<string, unknown>;
}

/** One tool call: live while a run is in flight, rebuilt from history later. */
export interface ToolRun {
  id: string;
  name: string;
  arguments: string;
  output?: string;
  diff?: string;
  failed?: boolean;
  cancelled?: boolean;
  done: boolean;
  /** Media returned by the tool, used by read previews. */
  attachments?: EntryAttachment[];
  /** UI-only result fields such as counts, providers, loaded files and diagnostics. */
  metadata?: Record<string, unknown>;
}

/**
 * One row of the transcript. Assistant text, user turns and tool calls share a
 * single ordered list so a live reply keeps the order its events arrived in.
 */
export interface TimelineEntry {
  key: string;
  role: "user" | "assistant" | "tool" | "reasoning" | "shell" | "loaded" | "notice" | "compaction" | "switch" | "failure";
  text?: string;
  tool?: ToolRun;
  /** An agent or model change, drawn as a divider instead of a message. */
  switch?: MessageSwitch;
  /** Why a turn failed, drawn as an error card instead of a message. */
  failure?: { message: string };
  /** Project instruction files loaded into the prompt for this turn. */
  loaded?: string[];
  /** User-run shell command and its output. */
  shell?: ShellRun;
  /** Synthetic notice source, outcome and subject. */
  notice?: { source: string; state?: string; description?: string; exit?: number; id?: string; sources?: string[] };  /** A compaction checkpoint and the turns it replaced. */
  compaction?: { status?: "running" | "completed" | "failed"; summary?: string; covered?: number; usage?: string; error?: string; reason?: string };
  /** Inline media carried by a user turn, without bytes. */
  attachments?: EntryAttachment[];
  /** Server-side file references shown as attachment cards. */
  references?: EntryAttachment[];
  /** Structured review comments attached to this prompt. */
  comments?: PromptComment[];
  /** The prompt was dictated through voice input. */
  voice?: boolean;
  /** Streamed text not yet confirmed by an assistant.message event. */
  live?: boolean;
  /** When a reasoning part finished, for its duration subtitle. */
  endedAt?: string;
  /** Optimistic user turn not yet echoed by the core's user.message event. */
  pending?: boolean;
  /**
   * The prompt landed while the turn was already running, so it joined that
   * turn as a steer. Live only: history has no way to know, and the animation
   * belongs to the arrival.
   */
  steer?: boolean;
  /** Durable time the message entered the conversation. */
  created?: string;
  /** Agent and model the user turn ran with. */
  agent?: string;
  provider?: string;
  model?: string;
}

/** Prompt-side and output tokens reported by the provider for this client run. */
export interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** Aggregated provider usage for one session. */
export interface UsageStats {
  sessionId: string;
  calls: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  last?: UsageTotals;
  lastAt?: string;
}

/** One literal text match in a workspace file. */
export interface Reference {
  path: string;
  line: number;
  column: number;
  text: string;
}

/** One workspace reference search result. */
export interface ReferenceResult {
  query: string;
  path: string;
  references: Reference[];
  truncated: boolean;
}

export type RunStatus = "completed" | "stopped" | "max-steps" | "failed";

export interface ChatState {
  id: string;
  title: string;
  draft: boolean;
  provider?: string;
  model?: string;
  agent?: string;
  loading?: boolean;
  entries: TimelineEntry[];
  running: boolean;
  tokens: number;
  pending: PermissionRequest[];
  questions: QuestionRequest[];
  /**
   * Durable pending input, mirrored from the core's inbox facts. Both the
   * composer queue and the pending steer rows are derived from it, so a
   * refresh cannot make a just-sent message disappear.
   */
  inbox?: InboxItem[];
  usage?: UsageTotals;
  runStartedAt?: number;
  runEndedAt?: number;
  lastRunMs?: number;
  lastRunStatus?: RunStatus;
  /** A retryable provider failure and the next automatic attempt. */
  retry?: { attempt: number; next: string; message: string };
  error?: string;
  notice?: string;
  /**
   * The core no longer has this session. A deleted session answers 404 instead
   * of an empty transcript, so a row that survives in a cached list opens onto
   * this state rather than onto an empty conversation.
   */
  notFound?: boolean;
  /** Newest transcript entries kept mounted; older ones load on demand. */
  historyLimit?: number;
}

export function blankChat(id: string, title = "New session", provider?: string, model?: string, agent?: string): ChatState {
  return {
    id,
    title,
    draft: true,
    provider,
    model,
    agent,
    loading: false,
    entries: [],
    running: false,
    tokens: 0,
    pending: [],
    questions: [],
    inbox: [],
  };
}

/**
 * Rebuilds the transcript from stored messages. Tool arguments live on the
 * assistant message while their rows come from tool results, so the two are
 * paired here; assistant tool calls alone produce no row.
 */
export function entriesFromMessages(messages: Message[]): TimelineEntry[] {
  const argumentsByID = new Map<string, string>();
  for (const message of messages) {
    for (const call of message.toolCalls ?? []) {
      argumentsByID.set(call.id, call.arguments);
    }
  }

  const entries: TimelineEntry[] = [];
  messages.forEach((message, index) => {
    const key = `history-${index}`;
    if (message.compaction) {
      entries.push({
        key,
        role: "compaction",
        compaction: {
          status: "completed",
          summary: message.content,
          covered: message.compactionCovered,
          reason: message.compactionReason,
        },
        created: message.created,
      });
      return;
    }
    if (message.shell) {
      entries.push({ key, role: "shell", shell: message.shell, created: message.created });
      return;
    }
    if (message.switch) {
      // A record that names no previous selection, or repeats it, is not a
      // change; older logs stored one for the first prompt of a session, and
      // drawing it would put a "Switched to ..." line above the first message.
      if (!switchChanges(message.switch)) return;
      entries.push({ key, role: "switch", switch: message.switch, created: message.created });
      return;
    }
    if (message.failure) {
      entries.push({ key, role: "failure", failure: message.failure, created: message.created });
      return;
    }
    if (message.role === "user") {
      if (message.synthetic) {
        const source = message.syntheticSource ?? "";
        if (
          source === "shell" ||
          source === "subagent" ||
          source === "schedule" ||
          source === "form" ||
          source === "instructions"
        ) {
          entries.push({
            key,
            role: "notice",
            text: message.syntheticDescription ?? "",
            notice: {
              source,
              state: message.syntheticState,
              description: message.syntheticDescription,
              id: message.syntheticId,
              sources: message.syntheticSources,
            },
            created: message.created,
          });
          return;
        }
        // An instruction load has no source; it becomes the same "Loaded ..."
        // row the live synthetic event produced.
        const paths = message.syntheticPaths ?? [];
        if (paths.length > 0) {
          entries.push({ key, role: "loaded", loaded: paths, created: message.created });
        }
        return;
      }
      entries.push({
        key,
        role: "user",
        text: message.content,
        created: message.created,
        agent: message.agent,
        provider: message.provider,
        model: message.model,
        comments: message.comments,
        voice: message.voice,
        references: message.references?.map((reference) => ({
          mime: reference.mime ?? "",
          name: reference.name,
        })),
        attachments: message.attachments?.map((attachment) => ({
          mime: attachment.mime,
          name: attachment.name,
          data: attachment.data,
          kind: attachment.kind,
          start: attachment.start,
          end: attachment.end,
        })),
      });
      return;
    }
    if (message.role === "assistant") {
      const parts = message.parts?.filter((part) => part.text.trim()) ?? [];
      if (parts.length > 0) {
        parts.forEach((part, partIndex) => {
          if (part.type === "reasoning") {
            entries.push({
              key: `${key}-part-${partIndex}`,
              role: "reasoning",
              text: part.text,
              created: part.created,
              endedAt: part.completed,
            });
          } else {
            entries.push({ key: `${key}-part-${partIndex}`, role: "assistant", text: part.text });
          }
        });
        return;
      }
      if (message.reasoning) {
        entries.push({
          key: `${key}-reasoning`,
          role: "reasoning",
          text: message.reasoning,
          created: message.reasoningCreated,
          endedAt: message.reasoningCompleted,
        });
      }
      if (message.content) entries.push({ key, role: "assistant", text: message.content });
      return;
    }
    entries.push({
      key,
      role: "tool",
      tool: {
        id: message.toolCallId ?? key,
        name: message.name || "tool",
        arguments: argumentsByID.get(message.toolCallId ?? "") ?? "",
        output: message.content,
        diff: message.diff,
        failed: message.failed,
        cancelled: message.cancelled,
        metadata: message.metadata,
        done: true,
      },
    });
  });
  return entries;
}

/** chatKey scopes a session to its workspace; IDs are only unique per core. */
export function chatKey(workspace: string, sessionID: string): string {
  return `${workspace}\u0000${sessionID}`;
}

/**
 * Whether a recorded agent or model row names a real change. Adopting the
 * default selection on the first prompt is not one, and a row that names no
 * previous value has nothing to say.
 */
export function switchChanges(value: MessageSwitch): boolean {
  if (value.kind === "agent") {
    return Boolean(value.agent) && Boolean(value.previous) && value.agent !== value.previous;
  }
  const provider = value.provider ?? "";
  const model = value.model ?? "";
  if (!provider && !model) return false;
  const previousProvider = value.previousProvider ?? "";
  const previousModel = value.previousModel ?? "";
  if (!previousProvider && !previousModel) return false;
  return provider !== previousProvider || model !== previousModel;
}

/** One primary agent profile the core can run. */
export interface AgentProfile {
  id: string;
  name: string;
  description?: string;
  mode?: string;
  model?: string;
  hidden?: boolean;
}

/** The selectable agent profiles plus the default id. */
export interface AgentCatalog {
  agents: AgentProfile[];
  default: string;
}

/** Core health probe payload. */
/** One core process lifecycle change, pushed on `lingzhu:core`. */
export interface CoreStatus {
  state: "restarting" | "ready" | "failed";
  attempt?: number;
  error?: string;
}

export interface CoreHealth {
  status: string;
  version?: string;
  uptime?: number;
}

export interface ArtifactContent {
  id: string;
  title: string;
  entry: string;
  files: string[];
  url: string;
  sessionId?: string;
  created: string;
  updated: string;
  contents: Record<string, string>;
}

export interface ArtifactFile {
  path: string;
  mediaType: string;
  size: number;
  data: string;
  truncated?: boolean;
}

export interface ArtifactInfo {
  id: string;
  title: string;
  entry: string;
  files: string[];
  url: string;
  sessionId?: string;
  created: string;
  updated: string;
}

export interface ArtifactProvider {
  id: string;
  name: string;
  capabilities: string[];
  default: boolean;
}

export interface ArtifactWrite {
  title?: string;
  files?: Record<string, string>;
  entry?: string;
  provider?: string;
}

export interface CommandInput {
  name: string;
  text?: string;
  arguments?: string;
  provider?: string;
  model?: string;
  agent?: string;
  delivery?: string;
}

export interface ConfigRule {
  action: string;
  resource: string;
  effect: string;
}

/** One inline attachment carried by a rendered timeline entry. */
export interface EntryAttachment {
  name?: string;
  mime: string;
  data?: string;
  kind?: string;
  start?: number;
  end?: number;
}

export interface FileGrepHit {
  path: string;
  line: number;
  text: string;
}

export interface FileGrepResult {
  hits: FileGrepHit[];
  truncated: boolean;
}

export interface FileSearchHit {
  path: string;
  size: number;
}

export interface FileSearchResult {
  files: FileSearchHit[];
  truncated: boolean;
}

export interface FormatResult {
  name?: string;
  changed: boolean;
  output?: string;
}

export interface FormatterInfo {
  name: string;
  source: string;
  command: string[];
  extensions: string[];
}

export interface Goal {
  id: string;
  objective: string;
  status: GoalStatus;
  reason?: string;
  rounds: number;
  maxRounds: number;
  stalls?: number;
  updatedAt: string;
}

export type GoalStatus = "active" | "paused" | "complete";

/** One row of the Home dashboard's session list. */
export interface HomeSessionRow {
  key: string;
  path: string;
  sessionID: string;
  title: string;
  workspaceName: string;
  icon?: string;
  color?: string;
  updated: string;
  running?: boolean;
  group?: string;
}

export interface ImageStatus {
  provider: string;
  configured: boolean;
  endpoint: string;
  model: string;
  size: string;
}

/** One row of the session inbox, grouped by its status. */
export interface InboxEntry {
  key: string;
  workspace: string;
  sessionID: string;
  title: string;
  workspaceName: string;
  status: InboxStatus;
  updated: string;
}

export type InboxStatus = "needs" | "working" | "failed" | "ready";

export interface InboxItem {
  id: string;
  sessionID: string;
  type: string;
  delivery: string;
  payload: { text: string; data?: Record<string, unknown> };
  time: { created: string };
}

export interface MCPResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export interface MCPServer {
  name: string;
  tools: MCPServerTool[];
  resources: MCPServerResource[];
}

export interface MCPServerTool {
  name: string;
  effective: string;
}

export interface MCPServerResource {
  name: string;
  uri?: string;
  uriTemplate?: string;
  description?: string;
  mimeType?: string;
}

export interface MCPToolContent {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
}

export interface MCPToolResult {
  content: MCPToolContent[];
  structuredContent?: unknown;
  isError: boolean;
}

export interface OAuthAuthorization {
  url: string;
  state: string;
}

export interface OAuthStatus {
  name: string;
  grant: string;
  token_url: string;
  authorization_url?: string;
  client_id: string;
  scopes: string[];
  authorized: boolean;
  expiresAt?: string;
  expired: boolean;
  hasRefreshToken: boolean;
}

export interface PermissionRequest {
  id: string;
  sessionId: string;
  action: string;
  resources: string[];
  message?: string;
}

export interface PickedAttachment {
  path: string;
  name: string;
  mime: string;
  size: number;
  data: string;
  kind?: string;
  start?: number;
  end?: number;
}

export interface PluginCapabilities {
  tools: boolean;
  commands: boolean;
  permissions: boolean;
  hooks: boolean;
}

export interface PluginStatus {
  name: string;
  capabilities: PluginCapabilities;
  tools: PluginTool[];
  commands: string[];
  panels: { id: string; title?: string; html: string }[];
}

export interface PluginTool {
  name: string;
  effective: string;
}

export interface PluginToolContent {
  type: string;
  text: string;
}

export interface PluginToolResult {
  content: PluginToolContent[];
  output: string;
  isError: boolean;
}

/** One attachment sent with a prompt. */
export interface PromptAttachment {
  name?: string;
  mime: string;
  data?: string;
  path?: string;
  size?: number;
  kind?: string;
  start?: number;
  end?: number;
}

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface QuestionPrompt {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
}

export interface QuestionRequest {
  id: string;
  sessionId: string;
  questions: QuestionPrompt[];
}

export interface QuestionResponse {
  answers: (string[] | null)[];
  cancelled?: boolean;
  message?: string;
}

export interface ReapplyResult {
  reapplied: boolean;
  turnSeq: number;
  snapshot: string;
}

export interface RevertResult {
  reverted: boolean;
  turnSeq: number;
  snapshot: string;
  current: string;
  files: string[];
}

export interface RevertState {
  active: boolean;
  turnSeq?: number;
  snapshot?: string;
  files?: string[];
  turns: RevertTurn[];
}

export interface RevertTurn {
  seq: number;
  text: string;
  hasSnapshot: boolean;
  created?: string;
}

export interface ScheduleItem {
  id: string;
  name?: string;
  sessionId: string;
  prompt: string;
  when: ScheduleWhen;
  status: string;
  created: string;
  updated: string;
  nextDueAt?: string;
  lastFiredAt?: string;
  runCount: number;
  lastError?: string;
}

export interface ScheduleUpdate {
  sessionId: string;
  action?: string;
  name?: string | null;
  prompt?: string | null;
  when?: ScheduleWhen | null;
}

export interface ScheduleWhen {
  type: string;
  in?: string;
  at?: string;
  every?: string;
}

export interface SearchHit {
  sessionId: string;
  title?: string;
  seq: number;
  type: string;
  at: string;
  snippet: string;
}

export interface SearchResult {
  title: string;
  url: string;
  content?: string;
  published?: string;
}

export interface SessionDiff {
  base: string;
  head: string;
  diffs: VCSFileDiff[];
}

export interface SessionInfo {
  id: string;
  title: string;
  provider?: string;
  model?: string;
  parent?: string;
  updated: string;
  running?: boolean;
}

/** One session picked for a bulk action. */
export interface SessionSelection {
  path: string;
  id: string;
}

export interface ShareInfo {
  token: string;
  sessionId: string;
  title: string;
  created: string;
  messages: number;
  path: string;
  url?: string;
}

export interface ShareServiceStatus {
  mode: string;
  enabled: boolean;
  remote: boolean;
  endpoint?: string;
  expiry?: string;
}

export interface ShareState {
  shared: boolean;
  share?: ShareInfo;
}

export interface SkillSummary {
  id: string;
  name: string;
  description?: string;
}

export interface SlashCommand {
  name: string;
  description?: string;
  keybind?: string;
  /** Command template shown in the catalog; empty for built-ins. */
  template?: string;
  /** Owning plugin id, or "builtin". */
  plugin?: string;
  /** Built-in commands run a shell action instead of sending text. */
  run?: () => void;
}

/** Where a notice points when it is about one session. */
export interface NoticeTarget {
  workspace: string;
  sessionID: string;
}

export type ToastTone = "info" | "error" | "success";


export interface VCSBase {
  name: string;
  ref: string;
  source: string;
}

export interface VCSBranch {
  current?: string;
  default?: string;
}

export interface VCSFileDiff {
  file: string;
  patch: string;
  additions: number;
  deletions: number;
  status: string;
}

export interface VCSFileStatus {
  file: string;
  additions: number;
  deletions: number;
  status: string;
}

export interface VCSInfo {
  provider: string;
  branch: VCSBranch;
}

export interface WebSearchStatus {
  provider: string;
  configured: boolean;
  endpoint: string;
  maxResults: number;
}

export interface WorkspaceInfo {
  path: string;
  name: string;
  addr: string;
  connected: boolean;
  error: string;
  icon?: string;
  color?: string;
}

export interface WorkspaceUsage {
  calls: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  sessions: UsageOverviewSession[];
}

export interface UsageOverviewSession {
  sessionId: string;
  title?: string;
  calls: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export interface Worktree {
  path: string;
  branch?: string;
  head?: string;
  main: boolean;
  size: number;
}

export interface WorktreeList {
  worktrees: Worktree[];
  repo: string;
}
