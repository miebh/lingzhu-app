// Package core is a small HTTP/SSE client for a running lingzhu core.
package core

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// ErrBusy is returned when the session already has a running turn.
var ErrBusy = errors.New("session is already running")

// ErrNotRunning is returned when queued input arrived after the turn closed.
var ErrNotRunning = errors.New("session is not running")

// HTTPError carries a non-2xx response from the core.
type HTTPError struct {
	Status  int
	Message string
}

func (e *HTTPError) Error() string {
	return fmt.Sprintf("core %d: %s", e.Status, e.Message)
}

type Client struct {
	BaseURL string
	HTTP    *http.Client
	// Directory names the workspace this client is bound to. A core can serve
	// several directories, so every request carries it; an empty value asks the
	// core for its default workspace, which is what a single-workspace core
	// answers anyway.
	Directory string
}

func New(baseURL string) *Client {
	return &Client{BaseURL: strings.TrimRight(baseURL, "/"), HTTP: &http.Client{Timeout: 0}}
}

// For returns a client bound to one workspace on the same core.
func (c *Client) For(directory string) *Client {
	if c == nil {
		return nil
	}
	clone := *c
	clone.Directory = directory
	return &clone
}

// path attaches the bound workspace to a request path. Every workspace-scoped
// endpoint reads it, so callers never have to thread a directory argument
// through 149 methods.
func (c *Client) path(raw string) string {
	if c.Directory == "" {
		return c.BaseURL + raw
	}
	separator := "?"
	if strings.Contains(raw, "?") {
		separator = "&"
	}
	return c.BaseURL + raw + separator + "directory=" + url.QueryEscape(c.Directory)
}

type Health struct {
	Status string `json:"status"`
}

type SessionInfo struct {
	ID       string    `json:"id"`
	Title    string    `json:"title"`
	Provider string    `json:"provider,omitempty"`
	Model    string    `json:"model,omitempty"`
	Parent   string    `json:"parent,omitempty"`
	Updated  time.Time `json:"updated"`
	Running  bool      `json:"running,omitempty"`
}

type ToolCall struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type Message struct {
	Role       string     `json:"role"`
	Content    string     `json:"content"`
	ToolCalls  []ToolCall `json:"toolCalls,omitempty"`
	ToolCallID string     `json:"toolCallId,omitempty"`
	Name       string     `json:"name,omitempty"`
	Diff       string     `json:"diff,omitempty"`
	// Metadata carries UI-only tool result fields such as counts and nested
	// Code Mode calls.
	Metadata map[string]any `json:"metadata,omitempty"`
	// Attachments are inline media carried by a user or tool message.
	Attachments []MessageAttachment `json:"attachments,omitempty"`
	// Shell describes a command the user ran directly.
	Shell *ShellRun `json:"shell,omitempty"`
	// Synthetic hides a system notification from the transcript. The source
	// fields let history draw the same notice the live event showed.
	Synthetic            bool     `json:"synthetic,omitempty"`
	SyntheticSource      string   `json:"syntheticSource,omitempty"`
	SyntheticDescription string   `json:"syntheticDescription,omitempty"`
	SyntheticState       string   `json:"syntheticState,omitempty"`
	SyntheticSources     []string `json:"syntheticSources,omitempty"`
	// Reasoning is UI-only provider reasoning attached to an assistant message.
	Reasoning string `json:"reasoning,omitempty"`
	// Created is the durable time the message entered the conversation. It is
	// UI metadata; core prompts are built from the messages themselves.
	Created time.Time `json:"created,omitempty"`
	// Agent, Provider and Model are recorded on user turns for footer meta.
	Agent    string `json:"agent,omitempty"`
	Provider string `json:"provider,omitempty"`
	Model    string `json:"model,omitempty"`
	// Switch marks a transcript-only agent or model change row.
	Switch *MessageSwitch `json:"switch,omitempty"`
	// Failure marks a transcript-only row explaining why a turn failed.
	Failure *MessageFailure `json:"failure,omitempty"`
	// Compaction marks a checkpoint row that separates compacted history. The
	// model request restarts from it while the transcript keeps earlier turns.
	Compaction        bool   `json:"compaction,omitempty"`
	CompactionCovered int    `json:"compactionCovered,omitempty"`
	CompactionReason  string `json:"compactionReason,omitempty"`
}

// MessageFailure is the reason a turn ended in an error. It is UI metadata
// only; providers never receive it.
type MessageFailure struct {
	Message string `json:"message"`
}

// MessageSwitch is the agent or model change a transcript row records. It is
// UI metadata only; providers never receive it.
type MessageSwitch struct {
	Kind             string `json:"kind"`
	Agent            string `json:"agent,omitempty"`
	Previous         string `json:"previous,omitempty"`
	Provider         string `json:"provider,omitempty"`
	Model            string `json:"model,omitempty"`
	PreviousProvider string `json:"previousProvider,omitempty"`
	PreviousModel    string `json:"previousModel,omitempty"`
}

// MessageAttachment is one inline attachment attached to a stored message.
type MessageAttachment struct {
	Mime  string `json:"mime"`
	Name  string `json:"name,omitempty"`
	Kind  string `json:"kind,omitempty"`
	Start int    `json:"start,omitempty"`
	End   int    `json:"end,omitempty"`
}

// ShellRun is one user-run command with its captured output.
type ShellRun struct {
	Command   string `json:"command"`
	Output    string `json:"output"`
	Exit      int    `json:"exit"`
	TimedOut  bool   `json:"timedOut,omitempty"`
	Truncated bool   `json:"truncated,omitempty"`
}

type ContextInfo struct {
	Messages []Message `json:"messages"`
	Tokens   int       `json:"tokens"`
	Window   int       `json:"window"`
	Provider string    `json:"provider"`
	Model    string    `json:"model"`
	Agent    string    `json:"agent"`
	Running  bool      `json:"running"`
}

type PermissionRequest struct {
	ID        string   `json:"id"`
	SessionID string   `json:"sessionId"`
	Action    string   `json:"action"`
	Resources []string `json:"resources"`
	Message   string   `json:"message,omitempty"`
}

type QuestionOption struct {
	Label       string `json:"label"`
	Description string `json:"description"`
}

type QuestionPrompt struct {
	Question string           `json:"question"`
	Header   string           `json:"header"`
	Options  []QuestionOption `json:"options"`
	Multiple bool             `json:"multiple,omitempty"`
}

type QuestionRequest struct {
	ID        string           `json:"id"`
	SessionID string           `json:"sessionId"`
	Questions []QuestionPrompt `json:"questions"`
}

type QuestionResponse struct {
	Answers   [][]string `json:"answers"`
	Cancelled bool       `json:"cancelled"`
	Message   string     `json:"message,omitempty"`
}

// Command is one slash command a core plugin exposes.
type Command struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Template    string `json:"template"`
	Plugin      string `json:"plugin"`
}

// UsageSession is one session's row in the workspace usage summary.
type UsageSession struct {
	SessionID  string `json:"sessionId"`
	Title      string `json:"title,omitempty"`
	Calls      int    `json:"calls"`
	Input      int    `json:"input"`
	Output     int    `json:"output"`
	CacheRead  int    `json:"cacheRead"`
	CacheWrite int    `json:"cacheWrite"`
	Total      int    `json:"total"`
}

// WorkspaceUsage aggregates usage across every session of a workspace.
type WorkspaceUsage struct {
	Calls      int            `json:"calls"`
	Input      int            `json:"input"`
	Output     int            `json:"output"`
	CacheRead  int            `json:"cacheRead"`
	CacheWrite int            `json:"cacheWrite"`
	Total      int            `json:"total"`
	Sessions   []UsageSession `json:"sessions"`
}

// FileSearchHit is one file matched by a workspace-wide name search.
type FileSearchHit struct {
	Path string `json:"path"`
	Size int64  `json:"size"`
}

// FileSearchResult is one workspace-wide filename search response.
type FileSearchResult struct {
	Files     []FileSearchHit `json:"files"`
	Truncated bool            `json:"truncated"`
}

// FileGrepHit is one matching line in a workspace file.
type FileGrepHit struct {
	Path string `json:"path"`
	Line int    `json:"line"`
	Text string `json:"text"`
}

// FileGrepResult is one workspace-wide content search response.
type FileGrepResult struct {
	Hits      []FileGrepHit `json:"hits"`
	Truncated bool          `json:"truncated"`
}

// SearchHit is one matching durable event across a workspace.
type SearchHit struct {
	SessionID string    `json:"sessionId"`
	Title     string    `json:"title,omitempty"`
	Seq       int64     `json:"seq"`
	Type      string    `json:"type"`
	At        time.Time `json:"at"`
	Snippet   string    `json:"snippet"`
}

// PluginCapabilities is what a plugin advertises.
type PluginCapabilities struct {
	Tools       bool `json:"tools"`
	Commands    bool `json:"commands"`
	Permissions bool `json:"permissions"`
	Hooks       bool `json:"hooks"`
}

// PluginTool is one tool contributed by a plugin.
type PluginTool struct {
	Name      string `json:"name"`
	Effective string `json:"effective"`
}

// PluginStatus is one connected plugin with its tools and commands.
type PluginStatus struct {
	Name         string             `json:"name"`
	Capabilities PluginCapabilities `json:"capabilities"`
	Tools        []PluginTool       `json:"tools"`
	Commands     []string           `json:"commands"`
}

// PluginToolContent is one part of a plugin tool result.
type PluginToolContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// PluginToolResult is the response to one plugin tool call.
type PluginToolResult struct {
	Content []PluginToolContent `json:"content"`
	Output  string              `json:"output"`
	IsError bool                `json:"isError"`
}

// SkillSummary is one discovered skill without its instructions.
type SkillSummary struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

// MCPServerTool is one tool advertised by an MCP server.
type MCPServerTool struct {
	Name      string `json:"name"`
	Effective string `json:"effective"`
}

// MCPServerResource is one resource of an MCP server.
type MCPServerResource struct {
	Name        string `json:"name"`
	URI         string `json:"uri,omitempty"`
	URITemplate string `json:"uriTemplate,omitempty"`
	Description string `json:"description,omitempty"`
	MimeType    string `json:"mimeType,omitempty"`
}

// MCPServer is one connected MCP server.
type MCPServer struct {
	Name      string              `json:"name"`
	Tools     []MCPServerTool     `json:"tools"`
	Resources []MCPServerResource `json:"resources"`
}

// MCPToolContent is one part returned by tools/call.
type MCPToolContent struct {
	Type     string `json:"type"`
	Text     string `json:"text,omitempty"`
	Data     string `json:"data,omitempty"`
	MimeType string `json:"mimeType,omitempty"`
	URI      string `json:"uri,omitempty"`
}

// MCPToolResult is the response to one MCP tool call.
type MCPToolResult struct {
	Content           []MCPToolContent `json:"content"`
	StructuredContent json.RawMessage  `json:"structuredContent,omitempty"`
	IsError           bool             `json:"isError"`
}

// MCPServerContent is one part returned by resources/read.
type MCPServerContent struct {
	URI      string `json:"uri"`
	MimeType string `json:"mimeType,omitempty"`
	Text     string `json:"text,omitempty"`
	Blob     string `json:"blob,omitempty"`
}

// Agent is one selectable primary profile.
type Agent struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Mode        string `json:"mode"`
	Model       string `json:"model,omitempty"`
	Hidden      bool   `json:"hidden,omitempty"`
}

// Worktree is one git worktree derived from a workspace.
type Worktree struct {
	Path   string `json:"path"`
	Branch string `json:"branch,omitempty"`
	Head   string `json:"head,omitempty"`
	Main   bool   `json:"main"`
	Size   int64  `json:"size"`
}

// WorktreeList is the repository root plus its worktrees.
type WorktreeList struct {
	Worktrees []Worktree `json:"worktrees"`
	Repo      string     `json:"repo"`
}

// Formatter is one resolved formatter.
type Formatter struct {
	Name       string   `json:"name"`
	Command    []string `json:"command"`
	Extensions []string `json:"extensions"`
	Source     string   `json:"source"`
}

// FormatResult is one formatter run.
type FormatResult struct {
	Name    string `json:"name,omitempty"`
	Changed bool   `json:"changed"`
	Output  string `json:"output,omitempty"`
}

// ShareInfo describes one shareable transcript.
type ShareInfo struct {
	Token     string    `json:"token"`
	SessionID string    `json:"sessionId"`
	Title     string    `json:"title"`
	Created   time.Time `json:"created"`
	Messages  int       `json:"messages"`
	Path      string    `json:"path"`
	URL       string    `json:"url,omitempty"`
}

// ShareServiceStatus is the sanitized share configuration.
type ShareServiceStatus struct {
	Mode     string `json:"mode"`
	Enabled  bool   `json:"enabled"`
	Remote   bool   `json:"remote"`
	Endpoint string `json:"endpoint,omitempty"`
	Expiry   string `json:"expiry,omitempty"`
}

// ShareState is the share status plus its record when active.
type ShareState struct {
	Shared bool      `json:"shared"`
	Share  ShareInfo `json:"share"`
}

// OAuthStatus is the public view of one OAuth endpoint.
type OAuthStatus struct {
	Name             string    `json:"name"`
	Grant            string    `json:"grant"`
	TokenURL         string    `json:"token_url"`
	AuthorizationURL string    `json:"authorization_url,omitempty"`
	ClientID         string    `json:"client_id"`
	Scopes           []string  `json:"scopes"`
	Authorized       bool      `json:"authorized"`
	ExpiresAt        time.Time `json:"expiresAt,omitempty"`
	Expired          bool      `json:"expired"`
	HasRefreshToken  bool      `json:"hasRefreshToken"`
}

// OAuthAuthorization is the consent URL plus its state value.
type OAuthAuthorization struct {
	URL   string `json:"url"`
	State string `json:"state"`
}

// WebSearchStatus is the configured search provider.
type WebSearchStatus struct {
	Provider   string `json:"provider"`
	Configured bool   `json:"configured"`
	Endpoint   string `json:"endpoint"`
	MaxResults int    `json:"maxResults"`
}

// SearchResult is one web search hit.
type SearchResult struct {
	Title     string `json:"title"`
	URL       string `json:"url"`
	Content   string `json:"content,omitempty"`
	Published string `json:"published,omitempty"`
}

// GeneratedImage is one generated image returned inline.
type GeneratedImage struct {
	Prompt        string `json:"prompt"`
	MediaType     string `json:"mediaType"`
	Extension     string `json:"extension"`
	Data          string `json:"data"`
	Size          int    `json:"size"`
	RevisedPrompt string `json:"revisedPrompt,omitempty"`
}

// ImageStatus is the configured image generator.
type ImageStatus struct {
	Provider   string `json:"provider"`
	Configured bool   `json:"configured"`
	Endpoint   string `json:"endpoint"`
	Model      string `json:"model"`
	Size       string `json:"size"`
}

// ArtifactInfo is artifact metadata.
type ArtifactInfo struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Entry     string    `json:"entry"`
	Files     []string  `json:"files"`
	URL       string    `json:"url"`
	SessionID string    `json:"sessionId,omitempty"`
	Created   time.Time `json:"created"`
	Updated   time.Time `json:"updated"`
}

// ArtifactProvider is one artifact backend.
type ArtifactProvider struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Capabilities []string `json:"capabilities"`
	Default      bool     `json:"default"`
}

// ArtifactWrite is a create or update request.
type ArtifactWrite struct {
	Title    string            `json:"title,omitempty"`
	Files    map[string]string `json:"files"`
	Entry    string            `json:"entry,omitempty"`
	Provider string            `json:"provider,omitempty"`
}

// ArtifactContent is metadata plus every file body.
type ArtifactContent struct {
	ArtifactInfo
	Contents map[string]string `json:"contents"`
}

// ArtifactFile is one raw artifact file fetched for preview.
type ArtifactFile struct {
	Path      string `json:"path"`
	MediaType string `json:"mediaType"`
	Size      int    `json:"size"`
	Data      string `json:"data"`
	Truncated bool   `json:"truncated,omitempty"`
}

const maxArtifactPreview = 8 << 20

// ArtifactFile fetches one raw file of an artifact for inline preview.
func (c *Client) ArtifactFile(ctx context.Context, id, path string) (ArtifactFile, error) {
	segments := strings.Split(strings.TrimPrefix(path, "/"), "/")
	for i, segment := range segments {
		segments[i] = url.PathEscape(segment)
	}
	endpoint := "/artifacts/" + url.PathEscape(id) + "/raw/" + strings.Join(segments, "/")
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.path(endpoint), nil)
	if err != nil {
		return ArtifactFile{}, err
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return ArtifactFile{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return ArtifactFile{}, responseError(resp)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxArtifactPreview+1))
	if err != nil {
		return ArtifactFile{}, err
	}
	truncated := len(data) > maxArtifactPreview
	if truncated {
		data = data[:maxArtifactPreview]
	}
	return ArtifactFile{
		Path:      path,
		MediaType: resp.Header.Get("Content-Type"),
		Size:      len(data),
		Data:      base64.StdEncoding.EncodeToString(data),
		Truncated: truncated,
	}, nil
}

// TerminalSize is a terminal viewport.
type TerminalSize struct {
	Cols int `json:"cols"`
	Rows int `json:"rows"`
}

// PersistentTerminal is one terminal record attached to a session.
type PersistentTerminal struct {
	ID                string       `json:"id"`
	Title             string       `json:"title"`
	ShellTitle        string       `json:"shellTitle,omitempty"`
	Command           string       `json:"command"`
	Args              []string     `json:"args"`
	Cwd               string       `json:"cwd"`
	SessionID         string       `json:"sessionID"`
	Status            string       `json:"status"`
	PID               int          `json:"pid"`
	ExitCode          *int         `json:"exitCode,omitempty"`
	UserTitle         *string      `json:"userTitle"`
	ForegroundProcess *string      `json:"foregroundProcess"`
	Size              TerminalSize `json:"size"`
	Output            struct {
		Head int64 `json:"head"`
		Tail int64 `json:"tail"`
	} `json:"output"`
}

// TerminalSnapshot is a rendered terminal screen.
type TerminalSnapshot struct {
	Info       PersistentTerminal `json:"info"`
	Text       string             `json:"text"`
	Checkpoint string             `json:"checkpoint"`
	Cursor     struct {
		X int `json:"x"`
		Y int `json:"y"`
	} `json:"cursor"`
}

// TerminalRead is the last rows of a session terminal.
type TerminalRead struct {
	PTYID             string  `json:"ptyID"`
	Title             string  `json:"title"`
	Cwd               string  `json:"cwd"`
	ForegroundProcess *string `json:"foregroundProcess"`
	Screen            struct {
		Text   string `json:"text"`
		Cols   int    `json:"cols"`
		Rows   int    `json:"rows"`
		Cursor struct {
			X int `json:"x"`
			Y int `json:"y"`
		} `json:"cursor"`
	} `json:"screen"`
}

// TerminalCreate starts a persistent terminal.
type TerminalCreate struct {
	Command string            `json:"command,omitempty"`
	Args    []string          `json:"args,omitempty"`
	Cwd     string            `json:"cwd,omitempty"`
	Title   string            `json:"title"`
	Env     map[string]string `json:"env,omitempty"`
	Size    *TerminalSize     `json:"size,omitempty"`
}

// InboxItem is one durable input waiting to be delivered.
type InboxItem struct {
	ID        string `json:"id"`
	SessionID string `json:"sessionID"`
	Type      string `json:"type"`
	Delivery  string `json:"delivery"`
	Payload   struct {
		Text string `json:"text"`
	} `json:"payload"`
	Time struct {
		Created string `json:"created"`
	} `json:"time"`
}

// CommandInput runs a named slash command.
type CommandInput struct {
	Name      string `json:"name"`
	Text      string `json:"text,omitempty"`
	Arguments string `json:"arguments,omitempty"`
	Provider  string `json:"provider,omitempty"`
	Model     string `json:"model,omitempty"`
	Agent     string `json:"agent,omitempty"`
	Delivery  string `json:"delivery,omitempty"`
}

// PTYInfo is one interactive terminal session.
type PTYInfo struct {
	ID       string   `json:"id"`
	Title    string   `json:"title"`
	Command  string   `json:"command"`
	Args     []string `json:"args"`
	Cwd      string   `json:"cwd"`
	Status   string   `json:"status"`
	PID      int      `json:"pid"`
	ExitCode *int     `json:"exitCode,omitempty"`
}

// PTYChunk is one output fragment.
type PTYChunk struct {
	Seq  int64  `json:"seq"`
	Data string `json:"data"`
}

// PTYOutput is one page of terminal output.
type PTYOutput struct {
	Chunks []PTYChunk `json:"chunks"`
	Next   int64      `json:"next"`
	Status string     `json:"status"`
}

// PTYCreate creates an interactive terminal.
type PTYCreate struct {
	Command string            `json:"command,omitempty"`
	Args    []string          `json:"args,omitempty"`
	Cwd     string            `json:"cwd,omitempty"`
	Title   string            `json:"title,omitempty"`
	Env     map[string]string `json:"env,omitempty"`
}

// ShellInfo is one one-shot shell command.
type ShellInfo struct {
	ID       string         `json:"id"`
	Status   string         `json:"status"`
	Command  string         `json:"command"`
	Cwd      string         `json:"cwd"`
	Shell    string         `json:"shell"`
	File     string         `json:"file"`
	PID      int            `json:"pid,omitempty"`
	Exit     *int           `json:"exit,omitempty"`
	Signal   string         `json:"signal,omitempty"`
	Metadata map[string]any `json:"metadata"`
	Time     struct {
		Started   int64  `json:"started"`
		Completed *int64 `json:"completed,omitempty"`
	} `json:"time"`
}

// ShellOutput is one page of captured shell output.
type ShellOutput struct {
	Output    string `json:"output"`
	Cursor    int64  `json:"cursor"`
	Size      int64  `json:"size"`
	Truncated bool   `json:"truncated"`
}

// ShellCreate runs one one-shot command.
type ShellCreate struct {
	Command  string         `json:"command"`
	Cwd      string         `json:"cwd,omitempty"`
	Timeout  int64          `json:"timeout,omitempty"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

// ProviderModel is one model advertised by a provider.
type ProviderModel struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	ContextWindow int    `json:"contextWindow"`
}

// ProviderInfo is one configured provider; it never carries a key.
type ProviderInfo struct {
	ID      string          `json:"id"`
	Name    string          `json:"name"`
	BaseURL string          `json:"baseUrl"`
	Ready   bool            `json:"ready"`
	Models  []ProviderModel `json:"models"`
}

// ModelInfo is one selectable model across providers.
type ModelInfo struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	ProviderID    string `json:"providerId"`
	ContextWindow int    `json:"contextWindow"`
	Default       bool   `json:"default"`
}

// ConfigRule is one permission rule in the sanitized config view.
type ConfigRule struct {
	Action   string `json:"action"`
	Resource string `json:"resource"`
	Effect   string `json:"effect"`
}

// ConfigView is the sanitized configuration returned by the core.
type ConfigView struct {
	Path          string       `json:"path,omitempty"`
	Workdir       string       `json:"workdir,omitempty"`
	DataDir       string       `json:"dataDir,omitempty"`
	Provider      string       `json:"provider,omitempty"`
	Model         string       `json:"model,omitempty"`
	DefaultAgent  string       `json:"defaultAgent,omitempty"`
	MaxSteps      int          `json:"maxSteps"`
	Shell         []string     `json:"shell,omitempty"`
	Permission    []ConfigRule `json:"permission,omitempty"`
	ContextWindow int          `json:"contextWindow,omitempty"`
	CompactKeep   int          `json:"compactKeep,omitempty"`
}

// VCSBranch is the current and default branch name.
type VCSBranch struct {
	Current string `json:"current,omitempty"`
	Default string `json:"default,omitempty"`
}

// VCSInfo is repository metadata.
type VCSInfo struct {
	Provider string    `json:"provider"`
	Branch   VCSBranch `json:"branch"`
}

// VCSBase is the inferred review base.
type VCSBase struct {
	Name   string `json:"name"`
	Ref    string `json:"ref"`
	Source string `json:"source"`
}

// VCSFileStatus is one uncommitted change with line counts.
type VCSFileStatus struct {
	File      string `json:"file"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
	Status    string `json:"status"`
}

// VCSFileDiff is one file patch.
type VCSFileDiff struct {
	File      string `json:"file"`
	Patch     string `json:"patch"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
	Status    string `json:"status"`
}

// SessionDiff is the worktree state since a session's first snapshot.
type SessionDiff struct {
	Base  string        `json:"base"`
	Head  string        `json:"head"`
	Diffs []VCSFileDiff `json:"diffs"`
}

// ScheduleWhen is one persisted trigger.
type ScheduleWhen struct {
	Type  string `json:"type"`
	In    string `json:"in,omitempty"`
	At    string `json:"at,omitempty"`
	Every string `json:"every,omitempty"`
}

// ScheduleItem is one stored schedule.
type ScheduleItem struct {
	ID          string       `json:"id"`
	Name        string       `json:"name,omitempty"`
	SessionID   string       `json:"sessionId"`
	Prompt      string       `json:"prompt"`
	When        ScheduleWhen `json:"when"`
	Status      string       `json:"status"`
	Created     time.Time    `json:"created"`
	Updated     time.Time    `json:"updated"`
	NextDueAt   time.Time    `json:"nextDueAt,omitempty"`
	LastFiredAt time.Time    `json:"lastFiredAt,omitempty"`
	RunCount    int          `json:"runCount"`
	LastError   string       `json:"lastError,omitempty"`
}

// Event is one payload from the core event stream.
type Event struct {
	Seq  int64          `json:"seq"`
	Type string         `json:"type"`
	At   time.Time      `json:"at"`
	Data map[string]any `json:"data"`
}

// GlobalEvent is one event from the all-session stream.
type GlobalEvent struct {
	SessionID string `json:"sessionId"`
	Seq       int64  `json:"seq"`
	// Global is the cross-session position the stream resumes from after a
	// dropped connection.
	Global int64 `json:"global"`
	// Directory is the workspace that owns the session, so a client does not
	// need a second request to route the event.
	Directory string         `json:"directory,omitempty"`
	Type      string         `json:"type"`
	At        time.Time      `json:"at"`
	Data      map[string]any `json:"data"`
}

func (c *Client) Health(ctx context.Context) error {
	var health Health
	return c.do(ctx, http.MethodGet, "/healthz", nil, &health)
}

// HealthStatus returns the core health payload.
func (c *Client) HealthStatus(ctx context.Context) (Health, error) {
	var health Health
	err := c.do(ctx, http.MethodGet, "/healthz", nil, &health)
	return health, err
}

func (c *Client) Sessions(ctx context.Context) ([]SessionInfo, error) {
	var payload struct {
		Sessions []SessionInfo `json:"sessions"`
	}
	if err := c.do(ctx, http.MethodGet, "/sessions", nil, &payload); err != nil {
		return nil, err
	}
	return payload.Sessions, nil
}

func (c *Client) Messages(ctx context.Context, sessionID string) ([]Message, error) {
	var payload struct {
		Messages []Message `json:"messages"`
	}
	if err := c.do(ctx, http.MethodGet, sessionPath(sessionID, "/messages"), nil, &payload); err != nil {
		return nil, err
	}
	return payload.Messages, nil
}

// ShellResult is one foreground session command result.
type ShellResult struct {
	Output    string `json:"output"`
	Exit      int    `json:"exit"`
	TimedOut  bool   `json:"timedOut"`
	Truncated bool   `json:"truncated"`
}

// JobInfo is one background session command.
type JobInfo struct {
	ID        string    `json:"id"`
	SessionID string    `json:"sessionId"`
	Command   string    `json:"command"`
	File      string    `json:"file"`
	Status    string    `json:"status"`
	ExitCode  int       `json:"exitCode"`
	Error     string    `json:"error,omitempty"`
	Started   time.Time `json:"started"`
	Finished  time.Time `json:"finished"`
}

// JobOutput is the tail of one background command's output plus its snapshot.
type JobOutput struct {
	Job     JobInfo `json:"job"`
	Output  string  `json:"output"`
	Running bool    `json:"running"`
}

// SessionSubagent is one running child session created by a parent session.
type SessionSubagent struct {
	ID      string    `json:"id"`
	Title   string    `json:"title,omitempty"`
	Agent   string    `json:"agent,omitempty"`
	Started time.Time `json:"started"`
}

// FormField is one field of a structured session form.
type FormField struct {
	Name        string   `json:"name"`
	Label       string   `json:"label,omitempty"`
	Type        string   `json:"type,omitempty"`
	Required    bool     `json:"required,omitempty"`
	Options     []string `json:"options,omitempty"`
	Placeholder string   `json:"placeholder,omitempty"`
	Default     string   `json:"default,omitempty"`
}

// FormRecord is one structured form request and its answer.
type FormRecord struct {
	ID         string         `json:"id"`
	SessionID  string         `json:"sessionID"`
	Title      string         `json:"title"`
	Fields     []FormField    `json:"fields"`
	Status     string         `json:"status"`
	AskedAt    time.Time      `json:"askedAt"`
	AnsweredAt *time.Time     `json:"answeredAt,omitempty"`
	Values     map[string]any `json:"values,omitempty"`
	Cancelled  bool           `json:"cancelled,omitempty"`
}

// FsEntry is one file or directory in the workspace tree.
type FsEntry struct {
	Name     string    `json:"name"`
	Path     string    `json:"path"`
	Type     string    `json:"type"`
	Size     int64     `json:"size"`
	Modified time.Time `json:"modified,omitempty"`
	Hidden   bool      `json:"hidden,omitempty"`
}

// FileList is one directory listing.
type FileList struct {
	Path      string    `json:"path"`
	Entries   []FsEntry `json:"entries"`
	Truncated bool      `json:"truncated"`
}

// FileContent is a bounded text preview of one file.
type FileContent struct {
	Path      string `json:"path"`
	Content   string `json:"content"`
	Truncated bool   `json:"truncated"`
	Binary    bool   `json:"binary"`
	Size      int64  `json:"size"`
}

// FileWrite is the result of replacing one file.
type FileWrite struct {
	Path string `json:"path"`
	Size int    `json:"size"`
}

// MediaItem is one image or PDF attachment from a tool result.
type MediaItem struct {
	ID   string    `json:"id"`
	Tool string    `json:"tool"`
	Mime string    `json:"mime"`
	Name string    `json:"name,omitempty"`
	Data string    `json:"data"`
	Size int       `json:"size"`
	Seq  int64     `json:"seq"`
	At   time.Time `json:"at"`
}

// MediaList is one session's image and PDF attachments.
type MediaList struct {
	SessionID string      `json:"sessionId"`
	Media     []MediaItem `json:"media"`
	Count     int         `json:"count"`
	Truncated bool        `json:"truncated"`
}

// MigrationStatus summarizes the session store schema and legacy backups.
type MigrationStatus struct {
	SchemaVersion int      `json:"schemaVersion"`
	SessionDir    string   `json:"sessionDir"`
	Sessions      int      `json:"sessions"`
	Events        int      `json:"events"`
	LegacyBackups []string `json:"legacyBackups"`
}

// MigrationInfo is the migration status plus the database path.
type MigrationInfo struct {
	Migration MigrationStatus `json:"migration"`
	Database  string          `json:"database"`
}

// PairingCode is one short-lived single-use pairing code.
type PairingCode struct {
	Code      string    `json:"code"`
	SessionID string    `json:"sessionId"`
	ExpiresAt time.Time `json:"expiresAt"`
	ExpiresIn int       `json:"expiresIn"`
}

// PairingList is the active pairings of one session.
type PairingList struct {
	SessionID string        `json:"sessionId"`
	Pairings  []PairingCode `json:"pairings"`
	Count     int           `json:"count"`
}

// PairingResult is the result of redeeming one code.
type PairingResult struct {
	Paired    bool      `json:"paired"`
	SessionID string    `json:"sessionId"`
	Directory string    `json:"directory"`
	PairedAt  time.Time `json:"pairedAt"`
	ExpiresAt time.Time `json:"expiresAt"`
}

// SessionBundle is one exported session and its events.
type SessionBundle struct {
	ID       string  `json:"id"`
	Title    string  `json:"title,omitempty"`
	Provider string  `json:"provider,omitempty"`
	Model    string  `json:"model,omitempty"`
	Agent    string  `json:"agent,omitempty"`
	Events   []Event `json:"events"`
}

// ProjectInfo describes the workspace core serves.
type ProjectInfo struct {
	Directory    string   `json:"directory"`
	Name         string   `json:"name"`
	Config       string   `json:"config,omitempty"`
	Instructions string   `json:"instructions,omitempty"`
	Sessions     int      `json:"sessions"`
	VCS          *VCSInfo `json:"vcs,omitempty"`
}

// LocationInfo describes one workspace a core serves.
type LocationInfo struct {
	Directory string `json:"directory"`
	Name      string `json:"name"`
	Default   bool   `json:"default"`
	Available bool   `json:"available"`
}

// Locations lists every workspace the core serves.
func (c *Client) Locations(ctx context.Context) ([]LocationInfo, error) {
	var payload struct {
		Locations []LocationInfo `json:"locations"`
	}
	err := c.do(ctx, http.MethodGet, "/locations", nil, &payload)
	return payload.Locations, err
}

// OpenLocation adds one directory to the core. It is a no-op when the
// directory is already open, so a caller can invoke it on every switch.
func (c *Client) OpenLocation(ctx context.Context, directory string) (string, error) {
	var payload struct {
		Directory string `json:"directory"`
	}
	err := c.do(ctx, http.MethodPost, "/locations", map[string]string{"directory": directory}, &payload)
	return payload.Directory, err
}

// CloseLocation drops one workspace from the core.
func (c *Client) CloseLocation(ctx context.Context, directory string) error {
	query := url.Values{}
	query.Set("directory", directory)
	return c.do(ctx, http.MethodDelete, "/locations?"+query.Encode(), nil, nil)
}

// MoveSessionToDirectory rehomes a session inside one core.
func (c *Client) MoveSessionToDirectory(ctx context.Context, sessionID, directory string) error {
	return c.do(ctx, http.MethodPost, sessionPath(sessionID, "/move"), map[string]string{"directory": directory}, nil)
}

// PermissionRule is one configured permission rule.
type PermissionRule struct {
	Action   string `json:"action"`
	Resource string `json:"resource"`
	Effect   string `json:"effect"`
}

// SessionLocation describes where one session runs.
type SessionLocation struct {
	SessionID string `json:"sessionId"`
	Directory string `json:"directory"`
	Project   string `json:"project"`
	// Worktree is the branch or directory name of the worktree that owns the
	// workspace; empty for the main checkout.
	Worktree string `json:"worktree,omitempty"`
	// Parent and ParentTitle describe the session that created this subagent.
	Parent      string           `json:"parent,omitempty"`
	ParentTitle string           `json:"parentTitle,omitempty"`
	Provider    string           `json:"provider"`
	Model       string           `json:"model"`
	Agent       string           `json:"agent"`
	Permissions []PermissionRule `json:"permissions"`
}

// Reference is one literal text match in a workspace file.
type Reference struct {
	Path   string `json:"path"`
	Line   int    `json:"line"`
	Column int    `json:"column"`
	Text   string `json:"text"`
}

// ReferenceResult is one workspace reference search.
type ReferenceResult struct {
	Query      string      `json:"query"`
	Path       string      `json:"path"`
	References []Reference `json:"references"`
	Truncated  bool        `json:"truncated"`
}

// UsageTotals is one provider usage snapshot.
type UsageTotals struct {
	Input      int `json:"input"`
	Output     int `json:"output"`
	CacheRead  int `json:"cacheRead"`
	CacheWrite int `json:"cacheWrite"`
}

// UsageStats aggregates every provider call of one session.
type UsageStats struct {
	SessionID  string       `json:"sessionId"`
	Calls      int          `json:"calls"`
	Input      int          `json:"input"`
	Output     int          `json:"output"`
	CacheRead  int          `json:"cacheRead"`
	CacheWrite int          `json:"cacheWrite"`
	Total      int          `json:"total"`
	Last       *UsageTotals `json:"last,omitempty"`
	LastAt     *time.Time   `json:"lastAt,omitempty"`
}

// SessionEnvironment describes the workspace and runtime of one session.
type SessionEnvironment struct {
	ID       string   `json:"id"`
	Workdir  string   `json:"workdir"`
	Shell    []string `json:"shell"`
	Running  bool     `json:"running"`
	Provider string   `json:"provider"`
	Model    string   `json:"model"`
	Agent    string   `json:"agent"`
	OS       string   `json:"os"`
	Arch     string   `json:"arch"`
}

// SessionLog returns every durable event of one session.
func (c *Client) SessionLog(ctx context.Context, sessionID string) ([]Event, error) {
	var payload struct {
		Events []Event `json:"events"`
	}
	if err := c.do(ctx, http.MethodGet, sessionPath(sessionID, "/log"), nil, &payload); err != nil {
		return nil, err
	}
	return payload.Events, nil
}

// Synthetic injects externally produced text into a session.
func (c *Client) Synthetic(ctx context.Context, sessionID, text string) error {
	return c.do(ctx, http.MethodPost, sessionPath(sessionID, "/synthetic"), map[string]string{"text": text}, nil)
}

// Skill runs one skill as a user turn.
func (c *Client) Skill(ctx context.Context, sessionID, name, arguments string) error {
	return c.do(ctx, http.MethodPost, sessionPath(sessionID, "/skill"), map[string]string{
		"name":      name,
		"arguments": arguments,
	}, nil)
}

// SessionShell runs one foreground command in the workspace.
func (c *Client) SessionShell(ctx context.Context, sessionID, command string, timeoutMS int) (ShellResult, error) {
	var result ShellResult
	err := c.do(ctx, http.MethodPost, sessionPath(sessionID, "/shell"), map[string]any{
		"command":    command,
		"timeout_ms": timeoutMS,
	}, &result)
	return result, err
}

// StartBackground starts one background command for a session.
func (c *Client) StartBackground(ctx context.Context, sessionID, command string, timeoutMS int) (JobInfo, error) {
	var item JobInfo
	err := c.do(ctx, http.MethodPost, sessionPath(sessionID, "/background"), map[string]any{
		"command":    command,
		"timeout_ms": timeoutMS,
	}, &item)
	return item, err
}

// CancelJob stops one running background command.
func (c *Client) CancelJob(ctx context.Context, sessionID, jobID string) (JobInfo, error) {
	var payload struct {
		Job JobInfo `json:"job"`
	}
	err := c.do(ctx, http.MethodDelete, sessionPath(sessionID, "/background/"+url.PathEscape(jobID)), nil, &payload)
	return payload.Job, err
}

// WorkspaceJobs lists background commands across every session.
func (c *Client) WorkspaceJobs(ctx context.Context) ([]JobInfo, error) {
	var payload struct {
		Jobs []JobInfo `json:"jobs"`
	}
	if err := c.do(ctx, http.MethodGet, "/background", nil, &payload); err != nil {
		return nil, err
	}
	return payload.Jobs, nil
}

// JobOutput returns the tail of one background command's output.
func (c *Client) JobOutput(ctx context.Context, sessionID, jobID string) (JobOutput, error) {
	var payload JobOutput
	err := c.do(ctx, http.MethodGet, sessionPath(sessionID, "/background/"+url.PathEscape(jobID)+"/output"), nil, &payload)
	return payload, err
}

// Jobs lists a session's background commands.
func (c *Client) Jobs(ctx context.Context, sessionID string) ([]JobInfo, error) {
	var payload struct {
		Jobs []JobInfo `json:"jobs"`
	}
	if err := c.do(ctx, http.MethodGet, sessionPath(sessionID, "/shell"), nil, &payload); err != nil {
		return nil, err
	}
	return payload.Jobs, nil
}

// SessionSubagents lists the child sessions a parent session still runs.
func (c *Client) SessionSubagents(ctx context.Context, sessionID string) ([]SessionSubagent, error) {
	var payload struct {
		Subagents []SessionSubagent `json:"subagents"`
	}
	if err := c.do(ctx, http.MethodGet, sessionPath(sessionID, "/subagents"), nil, &payload); err != nil {
		return nil, err
	}
	return payload.Subagents, nil
}

// Environment returns the workspace and runtime of one session.
func (c *Client) Environment(ctx context.Context, sessionID string) (SessionEnvironment, error) {
	var env SessionEnvironment
	err := c.do(ctx, http.MethodGet, sessionPath(sessionID, "/environment"), nil, &env)
	return env, err
}

// Project returns workspace metadata for this core instance.
func (c *Client) Project(ctx context.Context) (ProjectInfo, error) {
	var info ProjectInfo
	err := c.do(ctx, http.MethodGet, "/project", nil, &info)
	return info, err
}

// Location returns where one session runs and its permission rules.
func (c *Client) Location(ctx context.Context, sessionID string) (SessionLocation, error) {
	var location SessionLocation
	err := c.do(ctx, http.MethodGet, sessionPath(sessionID, "/location"), nil, &location)
	return location, err
}

// Media lists image and PDF attachments returned by tool calls.
func (c *Client) Media(ctx context.Context, sessionID string, limit int) (MediaList, error) {
	endpoint := sessionPath(sessionID, "/media")
	if limit > 0 {
		endpoint += "?limit=" + strconv.Itoa(limit)
	}
	var list MediaList
	err := c.do(ctx, http.MethodGet, endpoint, nil, &list)
	return list, err
}

// Migration reads the store schema, counts and legacy backups.
func (c *Client) Migration(ctx context.Context) (MigrationInfo, error) {
	var info MigrationInfo
	err := c.do(ctx, http.MethodGet, "/migration", nil, &info)
	return info, err
}

// Migrate re-imports legacy logs and returns the new status.
func (c *Client) Migrate(ctx context.Context) (MigrationInfo, error) {
	var info MigrationInfo
	err := c.do(ctx, http.MethodPost, "/migration", nil, &info)
	return info, err
}

// ExportBundle returns one session and its events.
func (c *Client) ExportBundle(ctx context.Context, sessionID string) (SessionBundle, error) {
	var payload struct {
		Bundle SessionBundle `json:"bundle"`
	}
	err := c.do(ctx, http.MethodGet, sessionPath(sessionID, "/bundle"), nil, &payload)
	return payload.Bundle, err
}

// ImportBundle stores one exported session.
func (c *Client) ImportBundle(ctx context.Context, bundle SessionBundle) (SessionInfo, error) {
	var payload struct {
		Session SessionInfo `json:"session"`
	}
	err := c.do(ctx, http.MethodPost, "/sessions/import", bundle, &payload)
	return payload.Session, err
}

// ExportMarkdown renders one session as Markdown.
func (c *Client) ExportMarkdown(ctx context.Context, sessionID string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.path(sessionPath(sessionID, "/export")), nil)
	if err != nil {
		return "", err
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", responseError(resp)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	return string(body), nil
}

// Pairings lists active pairing codes for one session.
func (c *Client) Pairings(ctx context.Context, sessionID string) (PairingList, error) {
	var list PairingList
	err := c.do(ctx, http.MethodGet, sessionPath(sessionID, "/pairing"), nil, &list)
	return list, err
}

// CreatePairing issues one short-lived pairing code.
func (c *Client) CreatePairing(ctx context.Context, sessionID string, ttlSeconds int) (PairingCode, error) {
	var payload struct {
		Pairing PairingCode `json:"pairing"`
	}
	err := c.do(ctx, http.MethodPost, sessionPath(sessionID, "/pairing"), map[string]int{
		"ttlSeconds": ttlSeconds,
	}, &payload)
	return payload.Pairing, err
}

// RedeemPairing consumes one pairing code.
func (c *Client) RedeemPairing(ctx context.Context, sessionID, code string) (PairingResult, error) {
	var result PairingResult
	err := c.do(ctx, http.MethodPost, sessionPath(sessionID, "/pairing/"+url.PathEscape(code)), map[string]any{}, &result)
	return result, err
}

// RevokePairing removes one active pairing code.
func (c *Client) RevokePairing(ctx context.Context, sessionID, code string) error {
	return c.do(ctx, http.MethodDelete, sessionPath(sessionID, "/pairing/"+url.PathEscape(code)), nil, nil)
}

// Usage returns aggregated provider usage for one session.
func (c *Client) Usage(ctx context.Context, sessionID string) (UsageStats, error) {
	var stats UsageStats
	err := c.do(ctx, http.MethodGet, sessionPath(sessionID, "/usage"), nil, &stats)
	return stats, err
}

// References searches the workspace for a literal text term.
func (c *Client) References(ctx context.Context, sessionID, query, path string, limit int, caseSensitive bool) (ReferenceResult, error) {
	values := url.Values{}
	values.Set("q", query)
	if path != "" {
		values.Set("path", path)
	}
	if limit > 0 {
		values.Set("limit", strconv.Itoa(limit))
	}
	if caseSensitive {
		values.Set("case_sensitive", "true")
	}
	var result ReferenceResult
	err := c.do(ctx, http.MethodGet, sessionPath(sessionID, "/reference")+"?"+values.Encode(), nil, &result)
	return result, err
}

// Files lists one directory inside the workspace.
func (c *Client) Files(ctx context.Context, path string, hidden bool) (FileList, error) {
	endpoint := "/files?path=" + url.QueryEscape(path)
	if hidden {
		endpoint += "&hidden=true"
	}
	var list FileList
	err := c.do(ctx, http.MethodGet, endpoint, nil, &list)
	return list, err
}

// FileContent returns a bounded text preview of one workspace file.
func (c *Client) FileContent(ctx context.Context, path string) (FileContent, error) {
	var file FileContent
	err := c.do(ctx, http.MethodGet, "/file?path="+url.QueryEscape(path), nil, &file)
	return file, err
}

// WriteFile replaces one workspace file with content.
func (c *Client) WriteFile(ctx context.Context, path, content string) (FileWrite, error) {
	var result FileWrite
	err := c.do(ctx, http.MethodPut, "/file?path="+url.QueryEscape(path), map[string]string{
		"content": content,
	}, &result)
	return result, err
}

// DeleteFile removes one workspace file or empty directory.
func (c *Client) DeleteFile(ctx context.Context, path string) error {
	return c.do(ctx, http.MethodDelete, "/file?path="+url.QueryEscape(path), nil, nil)
}

// MoveFile renames or moves one workspace entry.
func (c *Client) MoveFile(ctx context.Context, from, to string) error {
	return c.do(ctx, http.MethodPost, "/file/move", map[string]string{
		"from": from,
		"to":   to,
	}, nil)
}

// CreateEntry creates one workspace file or directory.
func (c *Client) CreateEntry(ctx context.Context, path, kind, content string) (FileWrite, error) {
	var result FileWrite
	err := c.do(ctx, http.MethodPost, "/files", map[string]string{
		"path":    path,
		"type":    kind,
		"content": content,
	}, &result)
	return result, err
}

// Forms lists a session's structured forms.
func (c *Client) Forms(ctx context.Context, sessionID string) ([]FormRecord, error) {
	var payload struct {
		Forms []FormRecord `json:"forms"`
	}
	if err := c.do(ctx, http.MethodGet, sessionPath(sessionID, "/form"), nil, &payload); err != nil {
		return nil, err
	}
	return payload.Forms, nil
}

// CreateForm records a structured form request.
func (c *Client) CreateForm(ctx context.Context, sessionID, title string, fields []FormField) (FormRecord, error) {
	var form FormRecord
	err := c.do(ctx, http.MethodPost, sessionPath(sessionID, "/form"), map[string]any{
		"title":  title,
		"fields": fields,
	}, &form)
	return form, err
}

// ReplyForm answers or cancels a pending form.
func (c *Client) ReplyForm(ctx context.Context, sessionID, formID string, values map[string]any, cancelled bool) (FormRecord, error) {
	var form FormRecord
	err := c.do(ctx, http.MethodPost, sessionPath(sessionID, "/form/"+url.PathEscape(formID)), map[string]any{
		"values":    values,
		"cancelled": cancelled,
	}, &form)
	return form, err
}

// Wait blocks until the session is idle or timeoutMS elapses.
func (c *Client) Wait(ctx context.Context, sessionID string, timeoutMS int) error {
	return c.do(ctx, http.MethodPost, sessionPath(sessionID, "/wait"), map[string]int{"timeout_ms": timeoutMS}, nil)
}

func (c *Client) Context(ctx context.Context, sessionID string) (ContextInfo, error) {
	var info ContextInfo
	err := c.do(ctx, http.MethodGet, sessionPath(sessionID, "/context"), nil, &info)
	return info, err
}

func (c *Client) Rename(ctx context.Context, sessionID, title string) error {
	body := map[string]string{"title": title}
	return c.do(ctx, http.MethodPatch, "/sessions/"+sessionID, body, nil)
}

// SetModel stores the session-level provider/model override.
func (c *Client) SetModel(ctx context.Context, sessionID, providerID, model string) error {
	body := map[string]string{"provider": providerID, "model": model}
	return c.do(ctx, http.MethodPatch, "/sessions/"+sessionID, body, nil)
}

func (c *Client) Delete(ctx context.Context, sessionID string) error {
	return c.do(ctx, http.MethodDelete, "/sessions/"+sessionID, nil, nil)
}

// Fork copies a session up to an optional sequence into a new session.
func (c *Client) Fork(ctx context.Context, sessionID string, before int64, title string) (SessionInfo, error) {
	body := map[string]any{}
	if before > 0 {
		body["before"] = before
	}
	if strings.TrimSpace(title) != "" {
		body["title"] = title
	}
	var payload struct {
		Session SessionInfo `json:"session"`
	}
	err := c.do(ctx, http.MethodPost, sessionPath(sessionID, "/fork"), body, &payload)
	return payload.Session, err
}

func (c *Client) Interrupt(ctx context.Context, sessionID string) (bool, error) {
	var payload struct {
		Interrupted bool `json:"interrupted"`
	}
	// Stopping continues steering input and control items; queued prompts stay
	// parked in the inbox.
	err := c.do(ctx, http.MethodPost, sessionPath(sessionID, "/interrupt")+"?resume=true", nil, &payload)
	return payload.Interrupted, err
}

func (c *Client) Compact(ctx context.Context, sessionID string) error {
	return c.do(ctx, http.MethodPost, sessionPath(sessionID, "/compact"), nil, nil)
}

// Summarize asks the hidden summary agent for a pull-request-style summary
// without mutating the session.
func (c *Client) Summarize(ctx context.Context, sessionID string) (string, error) {
	var payload struct {
		Summary string `json:"summary"`
	}
	err := c.do(ctx, http.MethodPost, sessionPath(sessionID, "/summary"), nil, &payload)
	return payload.Summary, err
}

// RevertTurn is one user turn available for reverting.
type RevertTurn struct {
	Seq         int64  `json:"seq"`
	Text        string `json:"text"`
	HasSnapshot bool   `json:"hasSnapshot"`
}

// RevertState is the staged revert plus the revertible turns.
type RevertState struct {
	Active   bool         `json:"active"`
	TurnSeq  int64        `json:"turnSeq,omitempty"`
	Snapshot string       `json:"snapshot,omitempty"`
	Files    []string     `json:"files,omitempty"`
	Turns    []RevertTurn `json:"turns"`
}

// RevertResult is the outcome of staging a revert.
type RevertResult struct {
	Reverted bool     `json:"reverted"`
	TurnSeq  int64    `json:"turnSeq"`
	Snapshot string   `json:"snapshot"`
	Current  string   `json:"current"`
	Files    []string `json:"files"`
}

// ReapplyResult is the outcome of undoing a staged revert.
type ReapplyResult struct {
	Reapplied bool   `json:"reapplied"`
	TurnSeq   int64  `json:"turnSeq"`
	Snapshot  string `json:"snapshot"`
}

// RevertState returns the staged revert and revertible turns.
func (c *Client) RevertState(ctx context.Context, sessionID string) (RevertState, error) {
	var state RevertState
	err := c.do(ctx, http.MethodGet, sessionPath(sessionID, "/revert"), nil, &state)
	return state, err
}

// RevertSession restores files to the start of one user turn.
func (c *Client) RevertSession(ctx context.Context, sessionID string, turnSeq int64) (RevertResult, error) {
	var result RevertResult
	err := c.do(ctx, http.MethodPost, sessionPath(sessionID, "/revert"), map[string]int64{"turnSeq": turnSeq}, &result)
	return result, err
}

// ReapplySession restores the worktree and history saved by a staged revert.
func (c *Client) ReapplySession(ctx context.Context, sessionID string) (ReapplyResult, error) {
	var result ReapplyResult
	err := c.do(ctx, http.MethodPost, sessionPath(sessionID, "/reapply"), nil, &result)
	return result, err
}

// Shutdown asks the core to stop gracefully.
func (c *Client) Shutdown(ctx context.Context) error {
	return c.do(ctx, http.MethodPost, "/shutdown", nil, nil)
}

func (c *Client) PendingPermissions(ctx context.Context, sessionID string) ([]PermissionRequest, error) {
	var payload struct {
		Requests []PermissionRequest `json:"requests"`
	}
	err := c.do(ctx, http.MethodGet, sessionPath(sessionID, "/permission"), nil, &payload)
	return payload.Requests, err
}

func (c *Client) ReplyPermission(ctx context.Context, sessionID, requestID, decision, message string) error {
	body := map[string]string{"decision": decision, "message": message}
	return c.do(ctx, http.MethodPost, sessionPath(sessionID, "/permission/"+requestID), body, nil)
}

func (c *Client) PendingQuestions(ctx context.Context, sessionID string) ([]QuestionRequest, error) {
	var payload struct {
		Questions []QuestionRequest `json:"questions"`
	}
	err := c.do(ctx, http.MethodGet, sessionPath(sessionID, "/question"), nil, &payload)
	return payload.Questions, err
}

func (c *Client) ReplyQuestion(ctx context.Context, sessionID, requestID string, response QuestionResponse) error {
	return c.do(ctx, http.MethodPost, sessionPath(sessionID, "/question/"+requestID), response, nil)
}

func (c *Client) Commands(ctx context.Context) ([]Command, error) {
	var payload struct {
		Commands []Command `json:"commands"`
	}
	err := c.do(ctx, http.MethodGet, "/commands", nil, &payload)
	return payload.Commands, err
}

// WorkspaceUsage aggregates usage across every session of this core.
func (c *Client) WorkspaceUsage(ctx context.Context) (WorkspaceUsage, error) {
	var usage WorkspaceUsage
	err := c.do(ctx, http.MethodGet, "/usage", nil, &usage)
	return usage, err
}

// SearchFiles finds files whose relative path contains the query.
func (c *Client) SearchFiles(ctx context.Context, query string, limit int) (FileSearchResult, error) {
	endpoint := "/files/search?q=" + url.QueryEscape(query)
	if limit > 0 {
		endpoint += "&limit=" + strconv.Itoa(limit)
	}
	var result FileSearchResult
	err := c.do(ctx, http.MethodGet, endpoint, nil, &result)
	return result, err
}

// GrepFiles searches text file contents in the workspace.
func (c *Client) GrepFiles(ctx context.Context, query string, limit int) (FileGrepResult, error) {
	endpoint := "/files/grep?q=" + url.QueryEscape(query)
	if limit > 0 {
		endpoint += "&limit=" + strconv.Itoa(limit)
	}
	var result FileGrepResult
	err := c.do(ctx, http.MethodGet, endpoint, nil, &result)
	return result, err
}

// SearchEvents searches durable event payloads across every session.
func (c *Client) SearchEvents(ctx context.Context, query string, limit int) ([]SearchHit, error) {
	endpoint := "/search?q=" + url.QueryEscape(query)
	if limit > 0 {
		endpoint += "&limit=" + strconv.Itoa(limit)
	}
	var payload struct {
		Hits []SearchHit `json:"hits"`
	}
	err := c.do(ctx, http.MethodGet, endpoint, nil, &payload)
	return payload.Hits, err
}

// Plugins lists connected plugins with their tools and commands.
func (c *Client) Plugins(ctx context.Context) ([]PluginStatus, error) {
	var payload struct {
		Plugins []PluginStatus `json:"plugins"`
	}
	err := c.do(ctx, http.MethodGet, "/plugins", nil, &payload)
	return payload.Plugins, err
}

// CallPluginTool invokes one tool contributed by a plugin.
func (c *Client) CallPluginTool(ctx context.Context, plugin, name string, arguments map[string]any) (PluginToolResult, error) {
	var payload struct {
		Result PluginToolResult `json:"result"`
	}
	err := c.do(ctx, http.MethodPost, "/plugins/"+url.PathEscape(plugin)+"/tool", map[string]any{
		"name":      name,
		"arguments": arguments,
	}, &payload)
	return payload.Result, err
}

// Skills lists the discovered skill catalog.
func (c *Client) Skills(ctx context.Context) ([]SkillSummary, error) {
	var payload struct {
		Skills []SkillSummary `json:"skills"`
	}
	err := c.do(ctx, http.MethodGet, "/skills", nil, &payload)
	return payload.Skills, err
}

// MCPStatus lists connected MCP servers with tools and resources.
func (c *Client) MCPStatus(ctx context.Context) ([]MCPServer, error) {
	var payload struct {
		Servers []MCPServer `json:"servers"`
	}
	err := c.do(ctx, http.MethodGet, "/mcp", nil, &payload)
	return payload.Servers, err
}

// CallMCPTool invokes one tool on a connected MCP server.
func (c *Client) CallMCPTool(ctx context.Context, server, name string, arguments map[string]any) (MCPToolResult, error) {
	var payload struct {
		Result MCPToolResult `json:"result"`
	}
	err := c.do(ctx, http.MethodPost, "/mcp/"+url.PathEscape(server)+"/tool", map[string]any{
		"name":      name,
		"arguments": arguments,
	}, &payload)
	return payload.Result, err
}

// ReadMCPResource reads one resource from a connected MCP server.
func (c *Client) ReadMCPResource(ctx context.Context, server, uri string) ([]MCPServerContent, error) {
	var payload struct {
		Contents []MCPServerContent `json:"contents"`
	}
	err := c.do(ctx, http.MethodPost, "/mcp/"+url.PathEscape(server)+"/resource", map[string]string{"uri": uri}, &payload)
	return payload.Contents, err
}

// Agents lists primary agents and the default id.
func (c *Client) Agents(ctx context.Context) ([]Agent, string, error) {
	var payload struct {
		Agents  []Agent `json:"agents"`
		Default string  `json:"default"`
	}
	err := c.do(ctx, http.MethodGet, "/agents", nil, &payload)
	return payload.Agents, payload.Default, err
}

// SetAgent stores the session-level agent selection.
func (c *Client) SetAgent(ctx context.Context, sessionID, agent string) error {
	return c.do(ctx, http.MethodPatch, "/sessions/"+sessionID, map[string]string{"agent": agent}, nil)
}

// Worktrees lists the repository's git worktrees.
func (c *Client) Worktrees(ctx context.Context) (WorktreeList, error) {
	var payload WorktreeList
	err := c.do(ctx, http.MethodGet, "/worktrees", nil, &payload)
	return payload, err
}

// CreateWorktree adds a worktree and returns it.
func (c *Client) CreateWorktree(ctx context.Context, name, branch, base string) (Worktree, error) {
	var payload struct {
		Worktree Worktree `json:"worktree"`
	}
	err := c.do(ctx, http.MethodPost, "/worktrees", map[string]string{
		"name": name, "branch": branch, "base": base,
	}, &payload)
	return payload.Worktree, err
}

// RemoveWorktree deletes a git worktree.
func (c *Client) RemoveWorktree(ctx context.Context, path string, force bool) error {
	query := "?path=" + url.QueryEscape(path)
	if force {
		query += "&force=true"
	}
	return c.do(ctx, http.MethodDelete, "/worktrees"+query, nil, nil)
}

// Formatters lists the resolved formatters.
func (c *Client) Formatters(ctx context.Context) ([]Formatter, error) {
	var payload struct {
		Formatters []Formatter `json:"formatters"`
	}
	err := c.do(ctx, http.MethodGet, "/formatters", nil, &payload)
	return payload.Formatters, err
}

// Format runs the matching formatter for one file.
func (c *Client) Format(ctx context.Context, path string) (FormatResult, error) {
	var payload struct {
		Format FormatResult `json:"format"`
	}
	err := c.do(ctx, http.MethodPost, "/format", map[string]string{"path": path}, &payload)
	return payload.Format, err
}

// Share creates a revocable public transcript for a session.
func (c *Client) Share(ctx context.Context, sessionID string) (ShareInfo, error) {
	var payload struct {
		Share ShareInfo `json:"share"`
	}
	err := c.do(ctx, http.MethodPost, sessionPath(sessionID, "/share"), map[string]any{}, &payload)
	return payload.Share, err
}

// ShareStatus returns the current share, if any.
func (c *Client) ShareStatus(ctx context.Context, sessionID string) (ShareState, error) {
	var payload ShareState
	err := c.do(ctx, http.MethodGet, sessionPath(sessionID, "/share"), nil, &payload)
	if payload.Share.URL == "" && payload.Share.Path != "" {
		payload.Share.URL = c.BaseURL + payload.Share.Path
	}
	return payload, err
}

// Unshare revokes the session's share.
func (c *Client) Unshare(ctx context.Context, sessionID string) error {
	return c.do(ctx, http.MethodDelete, sessionPath(sessionID, "/share"), nil, nil)
}

// ShareConfig returns the sanitized share configuration.
func (c *Client) ShareConfig(ctx context.Context) (ShareServiceStatus, error) {
	var payload struct {
		Share ShareServiceStatus `json:"share"`
	}
	err := c.do(ctx, http.MethodGet, "/share", nil, &payload)
	return payload.Share, err
}

// OAuthStatuses lists configured OAuth endpoints.
func (c *Client) OAuthStatuses(ctx context.Context) ([]OAuthStatus, error) {
	var payload struct {
		OAuth []OAuthStatus `json:"oauth"`
	}
	err := c.do(ctx, http.MethodGet, "/oauth", nil, &payload)
	return payload.OAuth, err
}

// RefreshOAuth forces a token refresh.
func (c *Client) RefreshOAuth(ctx context.Context, name string) (OAuthStatus, error) {
	var payload struct {
		OAuth OAuthStatus `json:"oauth"`
	}
	err := c.do(ctx, http.MethodPost, "/oauth/"+url.PathEscape(name)+"/refresh", map[string]any{}, &payload)
	return payload.OAuth, err
}

// AuthorizeOAuth starts the authorization-code flow.
func (c *Client) AuthorizeOAuth(ctx context.Context, name string) (OAuthAuthorization, error) {
	var payload OAuthAuthorization
	err := c.do(ctx, http.MethodPost, "/oauth/"+url.PathEscape(name)+"/authorize", map[string]any{}, &payload)
	return payload, err
}

// ExchangeOAuth completes the authorization-code flow.
func (c *Client) ExchangeOAuth(ctx context.Context, name, code, state string) (OAuthStatus, error) {
	var payload struct {
		OAuth OAuthStatus `json:"oauth"`
	}
	err := c.do(ctx, http.MethodPost, "/oauth/"+url.PathEscape(name)+"/token", map[string]string{
		"code": code, "state": state,
	}, &payload)
	return payload.OAuth, err
}

// RevokeOAuth deletes the stored token.
func (c *Client) RevokeOAuth(ctx context.Context, name string) error {
	return c.do(ctx, http.MethodDelete, "/oauth/"+url.PathEscape(name), nil, nil)
}

// MoveSession transfers one session to another core URL.
func (c *Client) MoveSession(ctx context.Context, sessionID, targetURL string) error {
	return c.do(ctx, http.MethodPost, sessionPath(sessionID, "/move"), map[string]string{
		"targetUrl": targetURL,
	}, nil)
}

// WebSearchStatus returns the configured search provider.
func (c *Client) WebSearchStatus(ctx context.Context) (WebSearchStatus, error) {
	var status WebSearchStatus
	err := c.do(ctx, http.MethodGet, "/websearch", nil, &status)
	return status, err
}

// WebSearch runs one search query.
func (c *Client) WebSearch(ctx context.Context, query string) ([]SearchResult, error) {
	var payload struct {
		Results []SearchResult `json:"results"`
	}
	err := c.do(ctx, http.MethodPost, "/websearch", map[string]string{"query": query}, &payload)
	return payload.Results, err
}

// ImageStatus returns the configured image generator.
func (c *Client) ImageStatus(ctx context.Context) (ImageStatus, error) {
	var status ImageStatus
	err := c.do(ctx, http.MethodGet, "/image", nil, &status)
	return status, err
}

// GenerateImage creates one image from a prompt.
func (c *Client) GenerateImage(ctx context.Context, prompt, size string) (GeneratedImage, error) {
	var payload struct {
		Image GeneratedImage `json:"image"`
	}
	err := c.do(ctx, http.MethodPost, "/image", map[string]string{
		"prompt": prompt,
		"size":   size,
	}, &payload)
	return payload.Image, err
}

// Artifacts lists stored artifacts.
func (c *Client) Artifacts(ctx context.Context) ([]ArtifactInfo, error) {
	var payload struct {
		Artifacts []ArtifactInfo `json:"artifacts"`
	}
	err := c.do(ctx, http.MethodGet, "/artifacts", nil, &payload)
	return payload.Artifacts, err
}

// Artifact reads one artifact's metadata and files.
func (c *Client) Artifact(ctx context.Context, id string) (ArtifactContent, error) {
	var payload struct {
		Artifact ArtifactContent `json:"artifact"`
	}
	err := c.do(ctx, http.MethodGet, "/artifacts/"+url.PathEscape(id), nil, &payload)
	return payload.Artifact, err
}

// DeleteArtifact removes one artifact.
func (c *Client) DeleteArtifact(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodDelete, "/artifacts/"+url.PathEscape(id), nil, nil)
}

// Schedules lists schedules, optionally filtered to one session.
func (c *Client) Schedules(ctx context.Context, sessionID string) ([]ScheduleItem, error) {
	endpoint := "/schedules"
	if strings.TrimSpace(sessionID) != "" {
		endpoint += "?sessionId=" + url.QueryEscape(sessionID)
	}
	var payload struct {
		Schedules []ScheduleItem `json:"schedules"`
	}
	err := c.do(ctx, http.MethodGet, endpoint, nil, &payload)
	return payload.Schedules, err
}

// CreateSchedule stores a new schedule owned by one session.
func (c *Client) CreateSchedule(ctx context.Context, sessionID, name, prompt string, when ScheduleWhen) (ScheduleItem, error) {
	var payload struct {
		Schedule ScheduleItem `json:"schedule"`
	}
	err := c.do(ctx, http.MethodPost, "/schedules", map[string]any{
		"sessionId": sessionID,
		"name":      name,
		"prompt":    prompt,
		"when":      when,
	}, &payload)
	return payload.Schedule, err
}

// DeleteSchedule removes one schedule owned by a session.
func (c *Client) DeleteSchedule(ctx context.Context, id, sessionID string) error {
	return c.do(ctx, http.MethodDelete, "/schedules/"+url.PathEscape(id)+"?sessionId="+url.QueryEscape(sessionID), nil, nil)
}

// ScheduleUpdate edits, pauses, or resumes one schedule.
type ScheduleUpdate struct {
	SessionID string        `json:"sessionId"`
	Action    string        `json:"action,omitempty"`
	Name      *string       `json:"name,omitempty"`
	Prompt    *string       `json:"prompt,omitempty"`
	When      *ScheduleWhen `json:"when,omitempty"`
}

// UpdateSchedule applies an edit, pause, or resume to one schedule.
func (c *Client) UpdateSchedule(ctx context.Context, id string, input ScheduleUpdate) (ScheduleItem, error) {
	var payload struct {
		Schedule ScheduleItem `json:"schedule"`
	}
	err := c.do(ctx, http.MethodPatch, "/schedules/"+url.PathEscape(id), input, &payload)
	return payload.Schedule, err
}

// Input queues a prompt behind the currently streaming turn.
func (c *Client) Input(ctx context.Context, sessionID, text string) error {
	return c.do(ctx, http.MethodPost, sessionPath(sessionID, "/input"), map[string]string{"text": text}, nil)
}

// InputWithDelivery queues text with an explicit steer or queue delivery.
func (c *Client) InputWithDelivery(ctx context.Context, sessionID, text, delivery string) error {
	body := map[string]string{"text": text}
	if delivery != "" {
		body["delivery"] = delivery
	}
	return c.do(ctx, http.MethodPost, sessionPath(sessionID, "/input"), body, nil)
}

// SessionEvents replays one session's durable events after a sequence number.
// The replay does not follow live events; the global stream covers those.
func (c *Client) SessionEvents(ctx context.Context, sessionID string, after int64) ([]Event, error) {
	events := []Event{}
	err := c.streamSessionEvents(ctx, sessionID, after, false, func(event Event) {
		events = append(events, event)
	})
	return events, err
}

// FollowSessionEvents replays and then follows one session's event stream,
// invoking emit for each event until ctx ends or the connection drops.
func (c *Client) FollowSessionEvents(ctx context.Context, sessionID string, after int64, emit func(Event)) error {
	return c.streamSessionEvents(ctx, sessionID, after, true, emit)
}

func (c *Client) streamSessionEvents(ctx context.Context, sessionID string, after int64, follow bool, emit func(Event)) error {
	endpoint := c.path(sessionPath(sessionID, "/events") + fmt.Sprintf("?after=%d&follow=%t", after, follow))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "text/event-stream")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return responseError(resp)
	}

	reader := bufio.NewReaderSize(resp.Body, 64*1024)
	for {
		line, err := reader.ReadString('\n')
		line = strings.TrimRight(line, "\r\n")
		if strings.HasPrefix(line, "data: ") {
			var ev Event
			if jsonErr := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &ev); jsonErr == nil && emit != nil {
				emit(ev)
			}
		}
		if err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			return err
		}
	}
}

// Events streams every session event until ctx ends or the connection drops.
func (c *Client) Events(ctx context.Context, emit func(GlobalEvent)) error {
	return c.EventsAfter(ctx, 0, emit)
}

// EventsAfter follows the all-session stream from one cross-session position.
// A reconnect passes the last position it saw, so events written while the
// connection was down are replayed instead of lost.
func (c *Client) EventsAfter(ctx context.Context, after int64, emit func(GlobalEvent)) error {
	endpoint := c.BaseURL + "/events"
	if after > 0 {
		endpoint += fmt.Sprintf("?after=%d", after)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "text/event-stream")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return responseError(resp)
	}

	reader := bufio.NewReaderSize(resp.Body, 64*1024)
	for {
		line, err := reader.ReadString('\n')
		line = strings.TrimRight(line, "\r\n")
		if strings.HasPrefix(line, "data: ") {
			var ev GlobalEvent
			if jsonErr := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &ev); jsonErr == nil {
				emit(ev)
			}
		}
		if err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			return err
		}
	}
}

// PromptAttachment is one inline image or PDF sent with a prompt.
type PromptAttachment struct {
	Mime string `json:"mime"`
	Name string `json:"name,omitempty"`
	Data string `json:"data"`
}

// PromptComment is one review comment attached to a prompt.
type PromptComment struct {
	ID   string `json:"id,omitempty"`
	File string `json:"file"`
	Line int    `json:"line,omitempty"`
	Body string `json:"body"`
}

// PromptReference is one server-side file reference attached to a prompt.
type PromptReference struct {
	Name string `json:"name"`
	Mime string `json:"mime,omitempty"`
	Path string `json:"path"`
}

// PromptWithMeta sends inline prompt content plus UI-only comments, references,
// or a voice marker. The model still receives only the prompt text.
func (c *Client) PromptWithMeta(ctx context.Context, sessionID, text, providerID, model, agent string, persist bool, attachments []PromptAttachment, comments []PromptComment, references []PromptReference, voice bool, emit func(Event)) error {
	body := map[string]any{
		"text":     text,
		"provider": providerID,
		"model":    model,
		"agent":    agent,
		"persist":  persist,
	}
	if len(attachments) > 0 {
		body["attachments"] = attachments
	}
	if len(comments) > 0 {
		body["comments"] = comments
	}
	if len(references) > 0 {
		body["references"] = references
	}
	if voice {
		body["voice"] = true
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.path(sessionPath(sessionID, "/prompt")), bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusConflict {
		return ErrBusy
	}
	if resp.StatusCode != http.StatusOK {
		return responseError(resp)
	}

	reader := bufio.NewReaderSize(resp.Body, 64*1024)
	for {
		line, err := reader.ReadString('\n')
		line = strings.TrimRight(line, "\r\n")
		if strings.HasPrefix(line, "data: ") {
			var ev Event
			if jsonErr := json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &ev); jsonErr == nil {
				emit(ev)
			}
		}
		if err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			return err
		}
	}
}

func (c *Client) do(ctx context.Context, method, path string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(payload)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.path(path), reader)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return responseError(resp)
	}
	if out == nil || resp.StatusCode == http.StatusNoContent {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func responseError(resp *http.Response) error {
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	var payload struct {
		Error string `json:"error"`
	}
	message := strings.TrimSpace(string(body))
	if json.Unmarshal(body, &payload) == nil && payload.Error != "" {
		message = payload.Error
	}
	if resp.StatusCode == http.StatusConflict && strings.Contains(message, "already running") {
		return ErrBusy
	}
	if resp.StatusCode == http.StatusConflict && strings.Contains(message, "not running") {
		return ErrNotRunning
	}
	return &HTTPError{Status: resp.StatusCode, Message: message}
}

func sessionPath(sessionID, suffix string) string {
	return "/sessions/" + sessionID + suffix
}

// VCSInfo returns repository metadata.
func (c *Client) VCSInfo(ctx context.Context) (VCSInfo, error) {
	var payload struct {
		Info VCSInfo `json:"info"`
	}
	err := c.do(ctx, http.MethodGet, "/vcs", nil, &payload)
	return payload.Info, err
}

// VCSBase returns the inferred review base, or nil before the first commit.
func (c *Client) VCSBase(ctx context.Context) (*VCSBase, error) {
	var payload struct {
		Base *VCSBase `json:"base"`
	}
	err := c.do(ctx, http.MethodGet, "/vcs/base", nil, &payload)
	return payload.Base, err
}

// VCSStatus lists uncommitted files with additions and deletions.
func (c *Client) VCSStatus(ctx context.Context) ([]VCSFileStatus, error) {
	var payload struct {
		Files []VCSFileStatus `json:"files"`
	}
	err := c.do(ctx, http.MethodGet, "/vcs/status", nil, &payload)
	return payload.Files, err
}

// VCSBranches lists local and remote branches.
func (c *Client) VCSBranches(ctx context.Context, search string, limit int) ([]string, error) {
	endpoint := "/vcs/branch"
	query := url.Values{}
	if strings.TrimSpace(search) != "" {
		query.Set("search", search)
	}
	if limit > 0 {
		query.Set("limit", strconv.Itoa(limit))
	}
	if len(query) > 0 {
		endpoint += "?" + query.Encode()
	}
	var payload struct {
		Branches []string `json:"branches"`
	}
	err := c.do(ctx, http.MethodGet, endpoint, nil, &payload)
	return payload.Branches, err
}

// VCSDiff returns per-file patches for one comparison mode.
func (c *Client) VCSDiff(ctx context.Context, mode, base string, contextLines int, untracked string) ([]VCSFileDiff, error) {
	query := url.Values{}
	query.Set("mode", mode)
	if strings.TrimSpace(base) != "" {
		query.Set("base", base)
	}
	if contextLines >= 0 {
		query.Set("context", strconv.Itoa(contextLines))
	}
	if strings.TrimSpace(untracked) != "" {
		query.Set("untracked", untracked)
	}
	var payload struct {
		Diffs []VCSFileDiff `json:"diffs"`
	}
	err := c.do(ctx, http.MethodGet, "/vcs/diff?"+query.Encode(), nil, &payload)
	return payload.Diffs, err
}

// SessionDiff returns the changes since the first captured turn of a session.
func (c *Client) SessionDiff(ctx context.Context, sessionID string) (SessionDiff, error) {
	var payload SessionDiff
	err := c.do(ctx, http.MethodGet, sessionPath(sessionID, "/diff"), nil, &payload)
	return payload, err
}

// VCSInit initializes a git repository in the core workdir.
func (c *Client) VCSInit(ctx context.Context) error {
	return c.do(ctx, http.MethodPost, "/vcs/init", nil, nil)
}

// Providers lists configured providers without credentials.
func (c *Client) Providers(ctx context.Context) ([]ProviderInfo, error) {
	var payload struct {
		Providers []ProviderInfo `json:"providers"`
	}
	err := c.do(ctx, http.MethodGet, "/providers", nil, &payload)
	return payload.Providers, err
}

// Provider returns one configured provider.
func (c *Client) Provider(ctx context.Context, id string) (ProviderInfo, error) {
	var payload struct {
		Provider ProviderInfo `json:"provider"`
	}
	err := c.do(ctx, http.MethodGet, "/providers/"+url.PathEscape(id), nil, &payload)
	return payload.Provider, err
}

// Models lists every selectable model across providers.
func (c *Client) Models(ctx context.Context) ([]ModelInfo, error) {
	var payload struct {
		Models []ModelInfo `json:"models"`
	}
	err := c.do(ctx, http.MethodGet, "/models", nil, &payload)
	return payload.Models, err
}

// DefaultModel returns the default selection, or nil when none is known.
func (c *Client) DefaultModel(ctx context.Context) (*ModelInfo, error) {
	var payload struct {
		Model *ModelInfo `json:"model"`
	}
	err := c.do(ctx, http.MethodGet, "/models/default", nil, &payload)
	return payload.Model, err
}

// Config returns the sanitized effective configuration.
func (c *Client) Config(ctx context.Context) (ConfigView, error) {
	var payload struct {
		Config ConfigView `json:"config"`
	}
	err := c.do(ctx, http.MethodGet, "/config", nil, &payload)
	return payload.Config, err
}

// UpdateConfig persists supported fields in the core config file.
func (c *Client) UpdateConfig(ctx context.Context, patch map[string]any) error {
	return c.do(ctx, http.MethodPatch, "/config", patch, nil)
}

// PTYs lists interactive terminal sessions.
func (c *Client) PTYs(ctx context.Context) ([]PTYInfo, error) {
	var payload struct {
		PTYs []PTYInfo `json:"ptys"`
	}
	err := c.do(ctx, http.MethodGet, "/pty", nil, &payload)
	return payload.PTYs, err
}

// CreatePTY starts an interactive terminal session.
func (c *Client) CreatePTY(ctx context.Context, input PTYCreate) (PTYInfo, error) {
	var payload struct {
		PTY PTYInfo `json:"pty"`
	}
	err := c.do(ctx, http.MethodPost, "/pty", input, &payload)
	return payload.PTY, err
}

// PTY returns one terminal session.
func (c *Client) PTY(ctx context.Context, id string) (PTYInfo, error) {
	var payload struct {
		PTY PTYInfo `json:"pty"`
	}
	err := c.do(ctx, http.MethodGet, "/pty/"+url.PathEscape(id), nil, &payload)
	return payload.PTY, err
}

// UpdatePTY changes a terminal title or viewport size.
func (c *Client) UpdatePTY(ctx context.Context, id, title string, rows, cols int) (PTYInfo, error) {
	body := map[string]any{"title": title}
	if rows > 0 && cols > 0 {
		body["size"] = map[string]int{"rows": rows, "cols": cols}
	}
	var payload struct {
		PTY PTYInfo `json:"pty"`
	}
	err := c.do(ctx, http.MethodPut, "/pty/"+url.PathEscape(id), body, &payload)
	return payload.PTY, err
}

// DeletePTY terminates and removes a terminal session.
func (c *Client) DeletePTY(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodDelete, "/pty/"+url.PathEscape(id), nil, nil)
}

// WritePTY sends input to a terminal session.
func (c *Client) WritePTY(ctx context.Context, id, data string) error {
	return c.do(ctx, http.MethodPost, "/pty/"+url.PathEscape(id)+"/input", map[string]string{"data": data}, nil)
}

// PTYOutput returns chunks after the given sequence.
func (c *Client) PTYOutput(ctx context.Context, id string, after int64) (PTYOutput, error) {
	var payload PTYOutput
	err := c.do(ctx, http.MethodGet, fmt.Sprintf("/pty/%s/output?after=%d", url.PathEscape(id), after), nil, &payload)
	return payload, err
}

// Shells lists running one-shot commands.
func (c *Client) Shells(ctx context.Context) ([]ShellInfo, error) {
	var payload struct {
		Shells []ShellInfo `json:"shells"`
	}
	err := c.do(ctx, http.MethodGet, "/shell", nil, &payload)
	return payload.Shells, err
}

// CreateShell runs a one-shot command.
func (c *Client) CreateShell(ctx context.Context, input ShellCreate) (ShellInfo, error) {
	var payload struct {
		Shell ShellInfo `json:"shell"`
	}
	err := c.do(ctx, http.MethodPost, "/shell", input, &payload)
	return payload.Shell, err
}

// Shell returns one one-shot command.
func (c *Client) Shell(ctx context.Context, id string) (ShellInfo, error) {
	var payload struct {
		Shell ShellInfo `json:"shell"`
	}
	err := c.do(ctx, http.MethodGet, "/shell/"+url.PathEscape(id), nil, &payload)
	return payload.Shell, err
}

// ShellOutput pages through captured output.
func (c *Client) ShellOutput(ctx context.Context, id string, cursor, limit int64) (ShellOutput, error) {
	var payload ShellOutput
	err := c.do(ctx, http.MethodGet, fmt.Sprintf("/shell/%s/output?cursor=%d&limit=%d", url.PathEscape(id), cursor, limit), nil, &payload)
	return payload, err
}

// DeleteShell terminates a one-shot command and removes its output.
func (c *Client) DeleteShell(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodDelete, "/shell/"+url.PathEscape(id), nil, nil)
}

// Inbox lists durable inputs waiting for delivery.
func (c *Client) Inbox(ctx context.Context, sessionID string) ([]InboxItem, error) {
	var payload struct {
		Data []InboxItem `json:"data"`
	}
	err := c.do(ctx, http.MethodGet, sessionPath(sessionID, "/inbox"), nil, &payload)
	return payload.Data, err
}

// CancelInbox removes one pending input.
func (c *Client) CancelInbox(ctx context.Context, sessionID, inputID string) error {
	return c.do(ctx, http.MethodDelete, sessionPath(sessionID, "/inbox/"+url.PathEscape(inputID)), nil, nil)
}

// UpdateInbox changes one pending input's delivery mode.
func (c *Client) UpdateInbox(ctx context.Context, sessionID, inputID, delivery string) error {
	return c.do(ctx, http.MethodPatch, sessionPath(sessionID, "/inbox/"+url.PathEscape(inputID)), map[string]string{"delivery": delivery}, nil)
}

// RunCommand executes a named slash command in a session.
func (c *Client) RunCommand(ctx context.Context, sessionID string, input CommandInput) error {
	return c.do(ctx, http.MethodPost, sessionPath(sessionID, "/command"), input, nil)
}

// SessionTerminals lists persistent terminals for a session.
func (c *Client) SessionTerminals(ctx context.Context, sessionID string) ([]PersistentTerminal, error) {
	var payload struct {
		Data []PersistentTerminal `json:"data"`
	}
	err := c.do(ctx, http.MethodGet, sessionPath(sessionID, "/terminal"), nil, &payload)
	return payload.Data, err
}

// CreateSessionTerminal starts a persistent terminal for a session.
func (c *Client) CreateSessionTerminal(ctx context.Context, sessionID string, input TerminalCreate) (PersistentTerminal, error) {
	var payload struct {
		Data PersistentTerminal `json:"data"`
	}
	err := c.do(ctx, http.MethodPost, sessionPath(sessionID, "/terminal"), input, &payload)
	return payload.Data, err
}

// ReadSessionTerminal returns the last rows of the newest session terminal.
func (c *Client) ReadSessionTerminal(ctx context.Context, sessionID string, lines int) (*TerminalRead, error) {
	endpoint := sessionPath(sessionID, "/terminal/read")
	if lines > 0 {
		endpoint += "?lines=" + strconv.Itoa(lines)
	}
	var payload struct {
		Data *TerminalRead `json:"data"`
	}
	err := c.do(ctx, http.MethodGet, endpoint, nil, &payload)
	return payload.Data, err
}

// PersistentTerminal returns one terminal record.
func (c *Client) PersistentTerminal(ctx context.Context, id string) (PersistentTerminal, error) {
	var payload struct {
		Data PersistentTerminal `json:"data"`
	}
	err := c.do(ctx, http.MethodGet, "/persistent-pty/"+url.PathEscape(id), nil, &payload)
	return payload.Data, err
}

// UpdatePersistentTerminal renames or resizes a terminal.
func (c *Client) UpdatePersistentTerminal(ctx context.Context, id, title string, clearTitle bool, size *TerminalSize) (PersistentTerminal, error) {
	body := map[string]any{}
	if clearTitle {
		body["title"] = nil
	} else if strings.TrimSpace(title) != "" {
		body["title"] = title
	}
	if size != nil {
		body["size"] = size
	}
	var payload struct {
		Data PersistentTerminal `json:"data"`
	}
	err := c.do(ctx, http.MethodPut, "/persistent-pty/"+url.PathEscape(id), body, &payload)
	return payload.Data, err
}

// TerminalSnapshot renders a terminal's retained output.
func (c *Client) TerminalSnapshot(ctx context.Context, id string) (TerminalSnapshot, error) {
	var payload struct {
		Data TerminalSnapshot `json:"data"`
	}
	err := c.do(ctx, http.MethodGet, "/persistent-pty/"+url.PathEscape(id)+"/snapshot", nil, &payload)
	return payload.Data, err
}

// DeletePersistentTerminal removes a terminal record.
func (c *Client) DeletePersistentTerminal(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodDelete, "/persistent-pty/"+url.PathEscape(id), nil, nil)
}

// PersistentTerminalTicket issues a single-use connect ticket.
func (c *Client) PersistentTerminalTicket(ctx context.Context, id string) (string, int, error) {
	var payload struct {
		Data struct {
			Ticket    string `json:"ticket"`
			ExpiresIn int    `json:"expires_in"`
		} `json:"data"`
	}
	err := c.do(ctx, http.MethodPost, "/persistent-pty/"+url.PathEscape(id)+"/connect-token", nil, &payload)
	return payload.Data.Ticket, payload.Data.ExpiresIn, err
}

// WritePersistentTerminal sends input to a terminal.
func (c *Client) WritePersistentTerminal(ctx context.Context, id, data string) error {
	return c.do(ctx, http.MethodPost, "/persistent-pty/"+url.PathEscape(id)+"/input", map[string]string{"data": data}, nil)
}

// PersistentTerminalOutput returns chunks after the given sequence.
func (c *Client) PersistentTerminalOutput(ctx context.Context, id string, after int64) (PTYOutput, error) {
	var payload PTYOutput
	err := c.do(ctx, http.MethodGet, fmt.Sprintf("/persistent-pty/%s/output?after=%d", url.PathEscape(id), after), nil, &payload)
	return payload, err
}

// ShutdownPersistentTerminals stops running terminal processes but keeps records.
func (c *Client) ShutdownPersistentTerminals(ctx context.Context) error {
	return c.do(ctx, http.MethodPost, "/persistent-pty/shutdown", nil, nil)
}

// TerminalHandoffItem is one exported terminal record and its retained output.
type TerminalHandoffItem struct {
	Info   PersistentTerminal `json:"info"`
	Output string             `json:"output"`
}

// TerminalHandoff is a transportable set of persistent terminal records.
type TerminalHandoff struct {
	Version    int                   `json:"version"`
	ExportedAt string                `json:"exportedAt,omitempty"`
	Terminals  []TerminalHandoffItem `json:"terminals"`
}

// ExportTerminalHandoff snapshots every persistent terminal record and output.
func (c *Client) ExportTerminalHandoff(ctx context.Context) (TerminalHandoff, error) {
	var payload struct {
		Handoff TerminalHandoff `json:"handoff"`
	}
	err := c.do(ctx, http.MethodPost, "/persistent-pty/handoff", nil, &payload)
	return payload.Handoff, err
}

// ImportTerminalHandoff restores exported records as exited terminals.
func (c *Client) ImportTerminalHandoff(ctx context.Context, handoff TerminalHandoff) ([]PersistentTerminal, error) {
	var payload struct {
		Data []PersistentTerminal `json:"data"`
	}
	err := c.do(ctx, http.MethodPost, "/persistent-pty/import", map[string]any{"handoff": handoff}, &payload)
	return payload.Data, err
}

// ArtifactProviders lists artifact backends.
func (c *Client) ArtifactProviders(ctx context.Context) ([]ArtifactProvider, error) {
	var payload struct {
		Providers []ArtifactProvider `json:"providers"`
	}
	err := c.do(ctx, http.MethodGet, "/artifacts/providers", nil, &payload)
	return payload.Providers, err
}

// CreateArtifact publishes a new artifact.
func (c *Client) CreateArtifact(ctx context.Context, input ArtifactWrite) (ArtifactInfo, error) {
	var payload struct {
		Artifact ArtifactInfo `json:"artifact"`
	}
	err := c.do(ctx, http.MethodPost, "/artifacts", input, &payload)
	return payload.Artifact, err
}

// UpdateArtifact replaces an artifact's files at the same id.
func (c *Client) UpdateArtifact(ctx context.Context, id string, input ArtifactWrite) (ArtifactInfo, error) {
	var payload struct {
		Artifact ArtifactInfo `json:"artifact"`
	}
	err := c.do(ctx, http.MethodPatch, "/artifacts/"+url.PathEscape(id), input, &payload)
	return payload.Artifact, err
}
