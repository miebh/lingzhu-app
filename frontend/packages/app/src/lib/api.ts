import { CoreService } from "@lingzhu/bindings/lingzhu-app/internal/service";
import { Events } from "@wailsio/runtime";
import type {
  AgentCatalog,
  AppInfo,
  AppPreferences,
  AppSettings,
  ArtifactContent,
  ArtifactFile,
  ArtifactInfo,
  ArtifactProvider,
  ArtifactWrite,
  CommandInput,
  CoreConfig,
  CoreEvent,
  CoreHealth,
  CoreStatus,
  CoreModel,
  CoreProvider,
  CoreShell,
  CoreShellCreate,
  CoreShellOutput,
  InboxItem,
  FormatterInfo,
  FormatResult,
  FormField,
  FormRecord,
  Goal,
  FileContent,
  FileGrepResult,
  FileList,
  FileSearchResult,
  FileWrite,
  ImageStatus,
  GeneratedImage,
  MagpieGateway,
  MCPServer,
  MCPResourceContent,
  MCPToolResult,
  Message,
  ModelVisibility,
  OAuthAuthorization,
  OAuthStatus,
  PermissionRequest,
  PluginStatus,
  PluginToolResult,
  QuestionRequest,
  QuestionResponse,
  ReapplyResult,
  RevertResult,
  RevertState,
  ScheduleItem,
  ScheduleUpdate,
  ScheduleWhen,
  SessionDiff,
  SlashCommand,
  VCSBase,
  VCSFileDiff,
  VCSFileStatus,
  VCSInfo,
  UsageStats,
  WorkspaceUsage,
  ReferenceResult,
  PresetModel,
  ProviderPreset,
  PromptAttachment,
  PromptComment,
  PromptReference,
  SessionInfo,
  SessionEvent,
  SessionBundle,
  PickedFile,
  PickedAttachment,
  SessionEnvironment,
  SessionTailEvent,
  SettingsInput,
  SkillSummary,
  ShareInfo,
  ShareServiceStatus,
  ShareState,
  SearchHit,
  SearchResult,
  ShellResult,
  JobInfo,
  JobOutput,
  ProjectInfo,
  SessionLocation,
  SessionSubagent,
  MediaList,
  MigrationInfo,
  PairingCode,
  PairingList,
  PairingResult,
  WebSearchStatus,
  WorkspaceInfo,
  Worktree,
  WorktreeList,
} from "@lingzhu/ui/types";

// The generated bindings are plain JS with JSDoc types, so results are cast
// here once instead of at every call site.
const call = CoreService as any;

export const api = {
  workspaces: (): Promise<WorkspaceInfo[]> => call.Workspaces(),
  addWorkspace: (): Promise<WorkspaceInfo> => call.AddWorkspace(),
  addWorkspaceAt: (path: string): Promise<WorkspaceInfo> => call.AddWorkspaceAt(path),
  removeWorkspace: (path: string): Promise<void> => call.RemoveWorkspace(path),

  sessions: (workspace: string): Promise<SessionInfo[]> => call.Sessions(workspace),
  messages: (workspace: string, sessionID: string): Promise<Message[]> => call.Messages(workspace, sessionID),
  workspaceUsage: (workspace: string): Promise<WorkspaceUsage> => call.WorkspaceUsage(workspace),
  searchEvents: (workspace: string, query: string, limit = 50): Promise<SearchHit[]> =>
    call.SearchEvents(workspace, query, limit),
  sessionEvents: (workspace: string, sessionID: string, after: number): Promise<SessionEvent[]> =>
    call.SessionEvents(workspace, sessionID, after),
  startSessionTail: (workspace: string, sessionID: string, after: number): Promise<void> =>
    call.StartSessionTail(workspace, sessionID, after),
  stopSessionTail: (workspace: string, sessionID: string): Promise<void> =>
    call.StopSessionTail(workspace, sessionID),
  sessionLog: (workspace: string, sessionID: string): Promise<SessionEvent[]> => call.SessionLog(workspace, sessionID),
  synthetic: (workspace: string, sessionID: string, text: string): Promise<void> =>
    call.Synthetic(workspace, sessionID, text),
  waitSession: (workspace: string, sessionID: string, timeoutMS = 0): Promise<void> =>
    call.WaitSession(workspace, sessionID, timeoutMS),
  skill: (workspace: string, sessionID: string, name: string, arguments_ = ""): Promise<void> =>
    call.Skill(workspace, sessionID, name, arguments_),
  plugins: (workspace: string): Promise<PluginStatus[]> => call.Plugins(workspace),
  callPluginTool: (
    workspace: string,
    plugin: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<PluginToolResult> => call.CallPluginTool(workspace, plugin, name, args),
  skills: (workspace: string): Promise<SkillSummary[]> => call.Skills(workspace),
  mcpStatus: (workspace: string): Promise<MCPServer[]> => call.MCPStatus(workspace),
  readMCPResource: (workspace: string, server: string, uri: string): Promise<MCPResourceContent[]> =>
    call.ReadMCPResource(workspace, server, uri),
  callMCPTool: (workspace: string, server: string, name: string, args: Record<string, unknown>): Promise<MCPToolResult> =>
    call.CallMCPTool(workspace, server, name, args),
  sessionShell: (workspace: string, sessionID: string, command: string, timeoutMS = 0): Promise<ShellResult> =>
    call.SessionShell(workspace, sessionID, command, timeoutMS),
  startBackground: (workspace: string, sessionID: string, command: string, timeoutMS = 0): Promise<JobInfo> =>
    call.StartBackground(workspace, sessionID, command, timeoutMS),
  backgroundJobs: (workspace: string, sessionID: string): Promise<JobInfo[]> =>
    call.Jobs(workspace, sessionID),
  jobOutput: (workspace: string, sessionID: string, jobID: string): Promise<JobOutput> =>
    call.JobOutput(workspace, sessionID, jobID),
  sessionSubagents: (workspace: string, sessionID: string): Promise<SessionSubagent[]> =>
    call.SessionSubagents(workspace, sessionID),
  allJobs: (workspace: string): Promise<JobInfo[]> => call.WorkspaceJobs(workspace),
  environment: (workspace: string, sessionID: string): Promise<SessionEnvironment> =>
    call.Environment(workspace, sessionID),
  project: (workspace: string): Promise<ProjectInfo> => call.Project(workspace),
  location: (workspace: string, sessionID: string): Promise<SessionLocation> =>
    call.Location(workspace, sessionID),
  media: (workspace: string, sessionID: string, limit = 0): Promise<MediaList> =>
    call.Media(workspace, sessionID, limit),
  migration: (workspace: string): Promise<MigrationInfo> => call.Migration(workspace),
  migrate: (workspace: string): Promise<MigrationInfo> => call.Migrate(workspace),
  pairings: (workspace: string, sessionID: string): Promise<PairingList> =>
    call.Pairings(workspace, sessionID),
  createPairing: (workspace: string, sessionID: string, ttlSeconds = 0): Promise<PairingCode> =>
    call.CreatePairing(workspace, sessionID, ttlSeconds),
  redeemPairing: (workspace: string, sessionID: string, code: string): Promise<PairingResult> =>
    call.RedeemPairing(workspace, sessionID, code),
  revokePairing: (workspace: string, sessionID: string, code: string): Promise<void> =>
    call.RevokePairing(workspace, sessionID, code),
  usage: (workspace: string, sessionID: string): Promise<UsageStats> => call.Usage(workspace, sessionID),
  references: (
    workspace: string,
    sessionID: string,
    query: string,
    path = "",
    limit = 0,
    caseSensitive = false,
  ): Promise<ReferenceResult> =>
    call.References(workspace, sessionID, query, path, limit, caseSensitive),
  searchFiles: (workspace: string, query: string, limit = 50): Promise<FileSearchResult> =>
    call.SearchFiles(workspace, query, limit),
  grepFiles: (workspace: string, query: string, limit = 50): Promise<FileGrepResult> =>
    call.GrepFiles(workspace, query, limit),
  files: (workspace: string, path: string, hidden: boolean): Promise<FileList> =>
    call.Files(workspace, path, hidden),
  fileContent: (workspace: string, path: string): Promise<FileContent> =>
    call.FileContent(workspace, path),
  writeFile: (workspace: string, path: string, content: string): Promise<FileWrite> =>
    call.WriteFile(workspace, path, content),
  deleteFile: (workspace: string, path: string): Promise<void> => call.DeleteFile(workspace, path),
  moveFile: (workspace: string, from: string, to: string): Promise<void> =>
    call.MoveFile(workspace, from, to),
  createEntry: (workspace: string, path: string, type: 'file' | 'dir', content = ""): Promise<FileWrite> =>
    call.CreateEntry(workspace, path, type, content),
  exportBundle: (workspace: string, sessionID: string): Promise<SessionBundle> =>
    call.ExportBundle(workspace, sessionID),
  importBundle: (workspace: string, bundle: SessionBundle): Promise<SessionInfo> =>
    call.ImportBundle(workspace, bundle),
  exportMarkdown: (workspace: string, sessionID: string): Promise<string> =>
    call.ExportMarkdown(workspace, sessionID),
  saveTextFile: (name: string, content: string): Promise<string> => call.SaveTextFile(name, content),
  revealPath: (path: string): Promise<void> => call.RevealPath(path),
  saveBase64File: (name: string, encoded: string): Promise<string> => call.SaveBase64File(name, encoded),
  pickTextFile: (title: string): Promise<PickedFile> => call.ReadTextFile(title),

  /** Chooses an installer executable for an in-place update. */
  pickInstaller: (title: string): Promise<string> => call.PickInstaller(title),
  pickAttachmentFile: (title: string): Promise<PickedAttachment> => call.ReadAttachmentFile(title),
  forms: (workspace: string, sessionID: string): Promise<FormRecord[]> => call.Forms(workspace, sessionID),
  createForm: (workspace: string, sessionID: string, title: string, fields: FormField[]): Promise<FormRecord> =>
    call.CreateForm(workspace, sessionID, title, fields),
  replyForm: (
    workspace: string,
    sessionID: string,
    formID: string,
    values: Record<string, unknown>,
    cancelled = false,
  ): Promise<FormRecord> => call.ReplyForm(workspace, sessionID, formID, values, cancelled),
  send: (
    workspace: string,
    sessionID: string,
    text: string,
    providerID: string,
    model: string,
    agent: string,
    delivery: 'steer' | 'queue' = 'steer',
  ): Promise<void> => call.Send(workspace, sessionID, text, providerID, model, agent, delivery),
  sendWithMeta: (
    workspace: string,
    sessionID: string,
    text: string,
    providerID: string,
    model: string,
    agent: string,
    delivery: 'steer' | 'queue' = 'steer',
    attachments: PromptAttachment[] = [],
    comments: PromptComment[] = [],
    references: PromptReference[] = [],
    voice = false,
  ): Promise<void> =>
    call.SendWithMeta(workspace, sessionID, text, providerID, model, agent, delivery, attachments, comments, references, voice),
  sendOnce: (
    workspace: string,
    sessionID: string,
    text: string,
    providerID: string,
    model: string,
    agent: string,
  ): Promise<void> => call.SendOnce(workspace, sessionID, text, providerID, model, agent),
  selectModel: (workspace: string, sessionID: string, providerID: string, model: string): Promise<void> =>
    call.SelectModel(workspace, sessionID, providerID, model),
  agents: (workspace: string): Promise<AgentCatalog> => call.Agents(workspace),
  selectAgent: (workspace: string, sessionID: string, agent: string): Promise<void> =>
    call.SelectAgent(workspace, sessionID, agent),
  worktrees: (workspace: string): Promise<WorktreeList> => call.Worktrees(workspace),
  worktreeSessions: (paths: string[]): Promise<Record<string, number>> => call.WorktreeSessions(paths),
  createWorktree: (workspace: string, name: string): Promise<Worktree> =>
    call.CreateWorktree(workspace, name),
  removeWorktree: (workspace: string, path: string, force: boolean): Promise<void> =>
    call.RemoveWorktree(workspace, path, force),
  formatters: (workspace: string): Promise<FormatterInfo[]> => call.Formatters(workspace),
  formatFile: (workspace: string, path: string): Promise<FormatResult> =>
    call.FormatFile(workspace, path),
  shareSession: (workspace: string, sessionID: string): Promise<ShareInfo> =>
    call.ShareSession(workspace, sessionID),
  shareStatus: (workspace: string, sessionID: string): Promise<ShareState> =>
    call.ShareStatus(workspace, sessionID),
  unshareSession: (workspace: string, sessionID: string): Promise<void> =>
    call.UnshareSession(workspace, sessionID),
  shareConfig: (workspace: string): Promise<ShareServiceStatus> => call.ShareConfig(workspace),
  health: (workspace: string): Promise<CoreHealth> => call.Health(workspace),
  restartCore: (workspace: string): Promise<void> => call.RestartCore(workspace),
  coreProviders: (workspace: string): Promise<CoreProvider[]> => call.Providers(workspace),
  coreProvider: (workspace: string, id: string): Promise<CoreProvider> => call.Provider(workspace, id),
  coreModels: (workspace: string): Promise<CoreModel[]> => call.Models(workspace),
  coreDefaultModel: (workspace: string): Promise<CoreModel | null> => call.DefaultModel(workspace),
  coreConfig: (workspace: string): Promise<CoreConfig> => call.Config(workspace),
  updateCoreConfig: (workspace: string, patch: Record<string, unknown>): Promise<void> =>
    call.UpdateConfig(workspace, patch),
  createShell: (workspace: string, input: CoreShellCreate): Promise<CoreShell> =>
    call.CreateShell(workspace, input),
  shellOutput: (workspace: string, id: string, cursor: number, limit: number): Promise<CoreShellOutput> =>
    call.ShellOutput(workspace, id, cursor, limit),
  vcsInfo: (workspace: string): Promise<VCSInfo> => call.VCSInfo(workspace),
  vcsBase: (workspace: string): Promise<VCSBase | null> => call.VCSBase(workspace),
  vcsStatus: (workspace: string): Promise<VCSFileStatus[]> => call.VCSStatus(workspace),
  vcsBranches: (workspace: string, search: string, limit: number): Promise<string[]> =>
    call.VCSBranches(workspace, search, limit),
  vcsDiff: (
    workspace: string,
    mode: 'working' | 'branch' | 'committed',
    base: string,
    context: number,
    untracked: 'files' | 'folders',
  ): Promise<VCSFileDiff[]> => call.VCSDiff(workspace, mode, base, context, untracked),
  sessionDiff: (workspace: string, sessionID: string): Promise<SessionDiff> =>
    call.SessionDiff(workspace, sessionID),
  vcsInit: (workspace: string): Promise<void> => call.VCSInit(workspace),
  oauthStatuses: (workspace: string): Promise<OAuthStatus[]> => call.OAuthStatuses(workspace),
  refreshOAuth: (workspace: string, name: string): Promise<OAuthStatus> =>
    call.RefreshOAuth(workspace, name),
  authorizeOAuth: (workspace: string, name: string): Promise<OAuthAuthorization> =>
    call.AuthorizeOAuth(workspace, name),
  exchangeOAuth: (workspace: string, name: string, code: string, state: string): Promise<OAuthStatus> =>
    call.ExchangeOAuth(workspace, name, code, state),
  revokeOAuth: (workspace: string, name: string): Promise<void> => call.RevokeOAuth(workspace, name),
  webSearchStatus: (workspace: string): Promise<WebSearchStatus> => call.WebSearchStatus(workspace),
  webSearch: (workspace: string, query: string): Promise<SearchResult[]> =>
    call.WebSearch(workspace, query),
  imageStatus: (workspace: string): Promise<ImageStatus> => call.ImageStatus(workspace),
  generateImage: (workspace: string, prompt: string, size = ""): Promise<GeneratedImage> =>
    call.GenerateImage(workspace, prompt, size),
  artifacts: (workspace: string): Promise<ArtifactInfo[]> => call.Artifacts(workspace),
  artifact: (workspace: string, id: string): Promise<ArtifactContent> => call.Artifact(workspace, id),
  artifactFile: (workspace: string, id: string, path: string): Promise<ArtifactFile> =>
    call.ArtifactFile(workspace, id, path),
  deleteArtifact: (workspace: string, id: string): Promise<void> => call.DeleteArtifact(workspace, id),
  artifactProviders: (workspace: string): Promise<ArtifactProvider[]> => call.ArtifactProviders(workspace),
  createArtifact: (workspace: string, input: ArtifactWrite): Promise<ArtifactInfo> =>
    call.CreateArtifact(workspace, input),
  updateArtifact: (workspace: string, id: string, input: ArtifactWrite): Promise<ArtifactInfo> =>
    call.UpdateArtifact(workspace, id, input),
  updateSchedule: (workspace: string, id: string, input: ScheduleUpdate): Promise<ScheduleItem> =>
    call.UpdateSchedule(workspace, id, input),
  schedules: (workspace: string, sessionID: string): Promise<ScheduleItem[]> =>
    call.Schedules(workspace, sessionID),
  allSchedules: (workspace: string): Promise<ScheduleItem[]> => call.Schedules(workspace, ""),
  createSchedule: (
    workspace: string,
    sessionID: string,
    name: string,
    prompt: string,
    when: ScheduleWhen,
  ): Promise<ScheduleItem> => call.CreateSchedule(workspace, sessionID, name, prompt, when),
  deleteSchedule: (workspace: string, sessionID: string, id: string): Promise<void> =>
    call.DeleteSchedule(workspace, sessionID, id),
  interrupt: (workspace: string, sessionID: string): Promise<boolean> => call.Interrupt(workspace, sessionID),
  pending: (workspace: string, sessionID: string): Promise<PermissionRequest[]> => call.Pending(workspace, sessionID),
  reply: (workspace: string, sessionID: string, requestID: string, decision: string, message = ""): Promise<void> =>
    call.Reply(workspace, sessionID, requestID, decision, message),
  questions: (workspace: string, sessionID: string): Promise<QuestionRequest[]> =>
    call.Questions(workspace, sessionID),
  replyQuestion: (
    workspace: string,
    sessionID: string,
    requestID: string,
    response: QuestionResponse,
  ): Promise<void> => call.ReplyQuestion(workspace, sessionID, requestID, response),
  commands: (workspace: string): Promise<SlashCommand[]> => call.Commands(workspace),
  compact: (workspace: string, sessionID: string): Promise<void> => call.Compact(workspace, sessionID),
  summarizeSession: (workspace: string, sessionID: string): Promise<string> =>
    call.SummarizeSession(workspace, sessionID),
  revertState: (workspace: string, sessionID: string): Promise<RevertState> =>
    call.RevertState(workspace, sessionID),
  revertSession: (workspace: string, sessionID: string, turnSeq: number): Promise<RevertResult> =>
    call.RevertSession(workspace, sessionID, turnSeq),
  reapplySession: (workspace: string, sessionID: string): Promise<ReapplyResult> =>
    call.ReapplySession(workspace, sessionID),
  rename: (workspace: string, sessionID: string, title: string): Promise<void> =>
    call.Rename(workspace, sessionID, title),
  goalState: (workspace: string, sessionID: string): Promise<Goal | null> =>
    call.GoalState(workspace, sessionID),
  goalAction: (workspace: string, sessionID: string, action: "pause" | "resume" | "clear"): Promise<void> =>
    call.GoalAction(workspace, sessionID, action),
  remove: (workspace: string, sessionID: string): Promise<void> => call.Delete(workspace, sessionID),
  forkSession: (workspace: string, sessionID: string, before: number, title: string): Promise<SessionInfo> =>
    call.Fork(workspace, sessionID, before, title),
  inbox: (workspace: string, sessionID: string): Promise<InboxItem[]> => call.Inbox(workspace, sessionID),
  cancelInbox: (workspace: string, sessionID: string, inputID: string): Promise<void> =>
    call.CancelInbox(workspace, sessionID, inputID),
  updateInbox: (workspace: string, sessionID: string, inputID: string, delivery: 'steer' | 'queue'): Promise<void> =>
    call.UpdateInbox(workspace, sessionID, inputID, delivery),
  runCommand: (workspace: string, sessionID: string, input: CommandInput): Promise<void> =>
    call.RunCommand(workspace, sessionID, input),
  cancelJob: (workspace: string, sessionID: string, jobID: string): Promise<JobInfo> =>
    call.CancelJob(workspace, sessionID, jobID),
  moveSession: (fromWorkspace: string, toWorkspace: string, sessionID: string): Promise<void> =>
    call.MoveSession(fromWorkspace, toWorkspace, sessionID),
  newSessionID: (): Promise<string> => call.NewSessionID(),

  settings: (): Promise<AppSettings> => call.Settings(),
  saveSettings: (input: SettingsInput): Promise<string[]> => call.SaveSettings(input),
  saveModelVisibility: (entries: ModelVisibility[]): Promise<void> => call.SaveModelVisibility(entries),
  testProvider: (providerID: string, baseUrl: string, apiKey: string, apiKeyEnv: string): Promise<string> =>
    call.TestProvider(providerID, baseUrl, apiKey, apiKeyEnv),
  presets: (): Promise<ProviderPreset[]> => call.ProviderPresets(),
  providerModels: (providerID: string, baseUrl: string, apiKey: string, apiKeyEnv: string): Promise<PresetModel[]> =>
    call.ProviderModels(providerID, baseUrl, apiKey, apiKeyEnv),
  magpie: (): Promise<MagpieGateway> => call.Magpie(),

  preferences: (): Promise<AppPreferences> => call.Preferences(),
  savePreferences: (input: AppPreferences): Promise<void> => call.SavePreferences(input),
  info: (): Promise<AppInfo> => call.Info(),

  onEvent(handler: (event: CoreEvent) => void): () => void {
    return Events.On("lingzhu:event", (payload: any) => handler(payload.data as CoreEvent));
  },

  /** Core process lifecycle: restarting, ready or failed. */
  onCoreStatus(handler: (status: CoreStatus) => void): () => void {
    return Events.On("lingzhu:core", (payload: any) => handler(payload.data as CoreStatus));
  },

  /** Starts a downloaded installer and quits so it can replace the binaries. */
  installUpdate: (path: string): Promise<void> => call.InstallUpdate(path),

  onSessionTail(handler: (event: SessionTailEvent) => void): () => void {
    return Events.On("lingzhu:tail", (payload: any) => handler(payload.data as SessionTailEvent));
  },
};


