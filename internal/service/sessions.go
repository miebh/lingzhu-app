package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"lingzhu-app/internal/core"
)

func (s *CoreService) Sessions(workspace string) ([]core.SessionInfo, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.SessionInfo, error) {
		return client.Sessions(s.ctx)
	})
}

func (s *CoreService) Messages(workspace, sessionID string) ([]core.Message, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.Message, error) {
		return client.Messages(s.ctx, sessionID)
	})
}

// SessionLog returns every durable event of one session.
func (s *CoreService) SessionLog(workspace, sessionID string) ([]core.Event, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.Event, error) {
		return client.SessionLog(s.ctx, sessionID)
	})
}

// Synthetic injects externally produced text into a session.
func (s *CoreService) Synthetic(workspace, sessionID, text string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.Synthetic(s.ctx, sessionID, text)
	})
}

// WaitSession blocks until the session is idle or timeoutMS elapses.
func (s *CoreService) WaitSession(workspace, sessionID string, timeoutMS int) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.Wait(s.ctx, sessionID, timeoutMS)
	})
}

// Skill runs one skill as a user turn.
func (s *CoreService) Skill(workspace, sessionID, name, arguments string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.Skill(s.ctx, sessionID, name, arguments)
	})
}

// SessionShell runs one foreground command in the workspace.
func (s *CoreService) SessionShell(workspace, sessionID, command string, timeoutMS int) (core.ShellResult, error) {
	return callClient(s, workspace, func(client *core.Client) (core.ShellResult, error) {
		return client.SessionShell(s.ctx, sessionID, command, timeoutMS)
	})
}

// StartBackground starts one background command for a session.
func (s *CoreService) StartBackground(workspace, sessionID, command string, timeoutMS int) (core.JobInfo, error) {
	return callClient(s, workspace, func(client *core.Client) (core.JobInfo, error) {
		return client.StartBackground(s.ctx, sessionID, command, timeoutMS)
	})
}

// CancelJob stops one running background command.
func (s *CoreService) CancelJob(workspace, sessionID, jobID string) (core.JobInfo, error) {
	return callClient(s, workspace, func(client *core.Client) (core.JobInfo, error) {
		return client.CancelJob(s.ctx, sessionID, jobID)
	})
}

// JobOutput returns the tail of one background command's output.
func (s *CoreService) JobOutput(workspace, sessionID, jobID string) (core.JobOutput, error) {
	return callClient(s, workspace, func(client *core.Client) (core.JobOutput, error) {
		return client.JobOutput(s.ctx, sessionID, jobID)
	})
}

// WorkspaceJobs lists background commands across every session.
func (s *CoreService) WorkspaceJobs(workspace string) ([]core.JobInfo, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.JobInfo, error) {
		return client.WorkspaceJobs(s.ctx)
	})
}

// Jobs lists a session's background commands.
func (s *CoreService) Jobs(workspace, sessionID string) ([]core.JobInfo, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.JobInfo, error) {
		return client.Jobs(s.ctx, sessionID)
	})
}

// SessionSubagents lists the child sessions a session still runs.
func (s *CoreService) SessionSubagents(workspace, sessionID string) ([]core.SessionSubagent, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.SessionSubagent, error) {
		return client.SessionSubagents(s.ctx, sessionID)
	})
}

// Health returns the core health payload for one workspace.
func (s *CoreService) Health(workspace string) (core.Health, error) {
	return callClient(s, workspace, func(client *core.Client) (core.Health, error) {
		return client.HealthStatus(s.ctx)
	})
}

// SessionEvents replays one session's durable events after a sequence number.
func (s *CoreService) SessionEvents(workspace, sessionID string, after int64) ([]core.Event, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.Event, error) {
		return client.SessionEvents(s.ctx, sessionID, after)
	})
}

// Environment returns the workspace and runtime of one session.
func (s *CoreService) Environment(workspace, sessionID string) (core.SessionEnvironment, error) {
	return callClient(s, workspace, func(client *core.Client) (core.SessionEnvironment, error) {
		return client.Environment(s.ctx, sessionID)
	})
}

// Project returns workspace metadata for this core instance.
func (s *CoreService) Project(workspace string) (core.ProjectInfo, error) {
	return callClient(s, workspace, func(client *core.Client) (core.ProjectInfo, error) {
		return client.Project(s.ctx)
	})
}

// Location returns where one session runs and its permission rules.
func (s *CoreService) Location(workspace, sessionID string) (core.SessionLocation, error) {
	return callClient(s, workspace, func(client *core.Client) (core.SessionLocation, error) {
		return client.Location(s.ctx, sessionID)
	})
}

// Media lists image and PDF attachments returned by tool calls.
func (s *CoreService) Media(workspace, sessionID string, limit int) (core.MediaList, error) {
	return callClient(s, workspace, func(client *core.Client) (core.MediaList, error) {
		return client.Media(s.ctx, sessionID, limit)
	})
}

// ExportBundle returns one session and its events.
func (s *CoreService) ExportBundle(workspace, sessionID string) (core.SessionBundle, error) {
	return callClient(s, workspace, func(client *core.Client) (core.SessionBundle, error) {
		return client.ExportBundle(s.ctx, sessionID)
	})
}

// ImportBundle stores one exported session.
func (s *CoreService) ImportBundle(workspace string, bundle core.SessionBundle) (core.SessionInfo, error) {
	return callClient(s, workspace, func(client *core.Client) (core.SessionInfo, error) {
		return client.ImportBundle(s.ctx, bundle)
	})
}

// ExportMarkdown renders one session as Markdown.
func (s *CoreService) ExportMarkdown(workspace, sessionID string) (string, error) {
	return callClient(s, workspace, func(client *core.Client) (string, error) {
		return client.ExportMarkdown(s.ctx, sessionID)
	})
}

// Pairings lists active pairing codes for one session.
func (s *CoreService) Pairings(workspace, sessionID string) (core.PairingList, error) {
	return callClient(s, workspace, func(client *core.Client) (core.PairingList, error) {
		return client.Pairings(s.ctx, sessionID)
	})
}

// CreatePairing issues one short-lived pairing code.
func (s *CoreService) CreatePairing(workspace, sessionID string, ttlSeconds int) (core.PairingCode, error) {
	return callClient(s, workspace, func(client *core.Client) (core.PairingCode, error) {
		return client.CreatePairing(s.ctx, sessionID, ttlSeconds)
	})
}

// RedeemPairing consumes one pairing code.
func (s *CoreService) RedeemPairing(workspace, sessionID, code string) (core.PairingResult, error) {
	return callClient(s, workspace, func(client *core.Client) (core.PairingResult, error) {
		return client.RedeemPairing(s.ctx, sessionID, code)
	})
}

// RevokePairing removes one active pairing code.
func (s *CoreService) RevokePairing(workspace, sessionID, code string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.RevokePairing(s.ctx, sessionID, code)
	})
}

// Usage returns aggregated provider usage for one session.
func (s *CoreService) Usage(workspace, sessionID string) (core.UsageStats, error) {
	return callClient(s, workspace, func(client *core.Client) (core.UsageStats, error) {
		return client.Usage(s.ctx, sessionID)
	})
}

// References searches the workspace for a literal text term.
func (s *CoreService) References(workspace, sessionID, query, path string, limit int, caseSensitive bool) (core.ReferenceResult, error) {
	return callClient(s, workspace, func(client *core.Client) (core.ReferenceResult, error) {
		return client.References(s.ctx, sessionID, query, path, limit, caseSensitive)
	})
}

// Files lists one workspace directory.
func (s *CoreService) Files(workspace, path string, hidden bool) (core.FileList, error) {
	return callClient(s, workspace, func(client *core.Client) (core.FileList, error) {
		return client.Files(s.ctx, path, hidden)
	})
}

// FileContent returns a bounded text preview of one workspace file.
func (s *CoreService) FileContent(workspace, path string) (core.FileContent, error) {
	return callClient(s, workspace, func(client *core.Client) (core.FileContent, error) {
		return client.FileContent(s.ctx, path)
	})
}

// WriteFile replaces one workspace file with content.
func (s *CoreService) WriteFile(workspace, path, content string) (core.FileWrite, error) {
	return callClient(s, workspace, func(client *core.Client) (core.FileWrite, error) {
		return client.WriteFile(s.ctx, path, content)
	})
}

// DeleteFile removes one workspace file or empty directory.
func (s *CoreService) DeleteFile(workspace, path string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.DeleteFile(s.ctx, path)
	})
}

// MoveFile renames or moves one workspace entry.
func (s *CoreService) MoveFile(workspace, from, to string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.MoveFile(s.ctx, from, to)
	})
}

// CreateEntry creates one workspace file or directory.
func (s *CoreService) CreateEntry(workspace, path, kind, content string) (core.FileWrite, error) {
	return callClient(s, workspace, func(client *core.Client) (core.FileWrite, error) {
		return client.CreateEntry(s.ctx, path, kind, content)
	})
}

// Forms lists a session's structured forms.
func (s *CoreService) Forms(workspace, sessionID string) ([]core.FormRecord, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.FormRecord, error) {
		return client.Forms(s.ctx, sessionID)
	})
}

// CreateForm records a structured form request.
func (s *CoreService) CreateForm(workspace, sessionID, title string, fields []core.FormField) (core.FormRecord, error) {
	return callClient(s, workspace, func(client *core.Client) (core.FormRecord, error) {
		return client.CreateForm(s.ctx, sessionID, title, fields)
	})
}

// ReplyForm answers or cancels a pending form.
func (s *CoreService) ReplyForm(workspace, sessionID, formID string, values map[string]any, cancelled bool) (core.FormRecord, error) {
	return callClient(s, workspace, func(client *core.Client) (core.FormRecord, error) {
		return client.ReplyForm(s.ctx, sessionID, formID, values, cancelled)
	})
}

func (s *CoreService) Context(workspace, sessionID string) (core.ContextInfo, error) {
	return callClient(s, workspace, func(client *core.Client) (core.ContextInfo, error) {
		return client.Context(s.ctx, sessionID)
	})
}

// Send starts a turn when idle, or queues the text behind the active run.
// Queued input is delivered by the original stream at its next model boundary.
func (s *CoreService) Send(workspace, sessionID, text, providerID, model, agent, delivery string) error {
	return s.sendWithMeta(workspace, sessionID, text, providerID, model, agent, delivery, nil, nil, nil, false)
}

// SendWithMeta starts a turn with inline attachments plus UI-only comments or a
// voice marker. Comments and voice require an idle session, like attachments.
func (s *CoreService) SendWithMeta(workspace, sessionID, text, providerID, model, agent, delivery string, attachments []core.PromptAttachment, comments []core.PromptComment, references []core.PromptReference, voice bool) error {
	return s.sendWithMeta(workspace, sessionID, text, providerID, model, agent, delivery, attachments, comments, references, voice)
}

func (s *CoreService) sendWithMeta(workspace, sessionID, text, providerID, model, agent, delivery string, attachments []core.PromptAttachment, comments []core.PromptComment, references []core.PromptReference, voice bool) error {
	return doClient(s, workspace, func(client *core.Client) error {
		key := streamKey(workspace, sessionID)
		for {
			s.mu.Lock()
			state := s.streams[key]
			if state == nil {
				ctx, cancel := context.WithCancel(s.ctx)
				state = &streamState{cancel: cancel, done: make(chan struct{})}
				s.streams[key] = state
				s.mu.Unlock()
				go s.streamTurn(client, workspace, sessionID, text, providerID, model, agent, delivery, attachments, comments, references, voice, true, true, key, ctx, state)
				return nil
			}
			s.mu.Unlock()

			if len(attachments) > 0 || len(comments) > 0 || len(references) > 0 || voice {
				return errors.New("attachments and comments require an idle session")
			}
			if err := client.InputWithDelivery(s.ctx, sessionID, text, delivery); err == nil {
				return nil
			} else if !errors.Is(err, core.ErrNotRunning) {
				return err
			}
			// The run ended between the local busy check and the input request.
			// Wait for its stream to settle, then retry as a normal turn.
			select {
			case <-state.done:
			case <-s.ctx.Done():
				return s.ctx.Err()
			}
		}
	})
}

// SendOnce starts one turn with provider/model/agent overrides that are not
// persisted to the session. It rejects a running session instead of queueing.
func (s *CoreService) SendOnce(workspace, sessionID, text, providerID, model, agent string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		key := streamKey(workspace, sessionID)
		s.mu.Lock()
		if s.streams[key] != nil {
			s.mu.Unlock()
			return errors.New("session is running")
		}
		ctx, cancel := context.WithCancel(s.ctx)
		state := &streamState{cancel: cancel, done: make(chan struct{})}
		s.streams[key] = state
		s.mu.Unlock()
		go s.streamTurn(client, workspace, sessionID, text, providerID, model, agent, "steer", nil, nil, nil, false, false, false, key, ctx, state)
		return nil
	})
}

func (s *CoreService) streamTurn(
	client *core.Client,
	workspace, sessionID, text, providerID, model, agent, delivery string,
	attachments []core.PromptAttachment,
	comments []core.PromptComment,
	references []core.PromptReference,
	voice bool,
	persist, allowQueue bool,
	key string,
	ctx context.Context,
	state *streamState,
) {
	defer func() {
		s.mu.Lock()
		if s.streams[key] == state {
			delete(s.streams, key)
		}
		s.mu.Unlock()
		state.cancel()
		close(state.done)
	}()
	// Events arrive through the workspace feed. The prompt stream only has to
	// stay open until the turn ends so the error path can report failures.
	var err error
	for attempt := 0; attempt < 2; attempt++ {
		err = client.PromptWithMeta(ctx, sessionID, text, providerID, model, agent, persist, attachments, comments, references, voice, func(core.Event) {})
		if !errors.Is(err, core.ErrBusy) {
			break
		}
		if !allowQueue || len(attachments) > 0 || len(comments) > 0 || len(references) > 0 || voice {
			break
		}
		// A recovered run has no local stream, so /prompt is busy even though
		// this client owns no send. Queue the text instead.
		inputErr := client.InputWithDelivery(s.ctx, sessionID, text, delivery)
		if inputErr == nil {
			return
		}
		if !errors.Is(inputErr, core.ErrNotRunning) {
			err = inputErr
			break
		}
		// The recovered run ended before the input arrived; retry as a normal
		// prompt once.
	}
	if err != nil && !errors.Is(err, context.Canceled) {
		s.emit(EventEnvelope{
			Workspace: workspace,
			SessionID: sessionID,
			Type:      "client.error",
			At:        time.Now(),
			Data:      map[string]any{"message": err.Error()},
		})
	}
	s.emit(EventEnvelope{Workspace: workspace, SessionID: sessionID, Type: "client.done", At: time.Now()})
}

func (s *CoreService) Interrupt(workspace, sessionID string) (bool, error) {
	return callClient(s, workspace, func(client *core.Client) (bool, error) {
		return client.Interrupt(s.ctx, sessionID)
	})
}

func (s *CoreService) Pending(workspace, sessionID string) ([]core.PermissionRequest, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.PermissionRequest, error) {
		return client.PendingPermissions(s.ctx, sessionID)
	})
}

func (s *CoreService) Reply(workspace, sessionID, requestID, decision, message string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.ReplyPermission(s.ctx, sessionID, requestID, decision, message)
	})
}

func (s *CoreService) Questions(workspace, sessionID string) ([]core.QuestionRequest, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.QuestionRequest, error) {
		return client.PendingQuestions(s.ctx, sessionID)
	})
}

func (s *CoreService) ReplyQuestion(workspace, sessionID, requestID string, response core.QuestionResponse) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.ReplyQuestion(s.ctx, sessionID, requestID, response)
	})
}

// Commands lists plugin slash commands for one workspace.
func (s *CoreService) Commands(workspace string) ([]core.Command, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.Command, error) {
		return client.Commands(s.ctx)
	})
}

// Inbox lists durable inputs waiting for delivery.
func (s *CoreService) Inbox(workspace, sessionID string) ([]core.InboxItem, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.InboxItem, error) {
		return client.Inbox(s.ctx, sessionID)
	})
}

// CancelInbox removes one pending input.
func (s *CoreService) CancelInbox(workspace, sessionID, inputID string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.CancelInbox(s.ctx, sessionID, inputID)
	})
}

// UpdateInbox changes one pending input's delivery mode.
func (s *CoreService) UpdateInbox(workspace, sessionID, inputID, delivery string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.UpdateInbox(s.ctx, sessionID, inputID, delivery)
	})
}

// RunCommand executes a named slash command in a session.
func (s *CoreService) RunCommand(workspace, sessionID string, input core.CommandInput) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.RunCommand(s.ctx, sessionID, input)
	})
}

func (s *CoreService) Compact(workspace, sessionID string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.Compact(s.ctx, sessionID)
	})
}

// SummarizeSession returns a pull-request-style summary of the session.
func (s *CoreService) SummarizeSession(workspace, sessionID string) (string, error) {
	var summary string
	err := doClient(s, workspace, func(client *core.Client) error {
		text, err := client.Summarize(s.ctx, sessionID)
		if err != nil {
			return err
		}
		summary = text
		return nil
	})
	return summary, err
}

// RevertState returns the staged revert and revertible turns.
func (s *CoreService) RevertState(workspace, sessionID string) (core.RevertState, error) {
	return callClient(s, workspace, func(client *core.Client) (core.RevertState, error) {
		return client.RevertState(s.ctx, sessionID)
	})
}

// RevertSession restores files to the start of one user turn.
func (s *CoreService) RevertSession(workspace, sessionID string, turnSeq int64) (core.RevertResult, error) {
	return callClient(s, workspace, func(client *core.Client) (core.RevertResult, error) {
		return client.RevertSession(s.ctx, sessionID, turnSeq)
	})
}

// ReapplySession restores the worktree and history saved by a staged revert.
func (s *CoreService) ReapplySession(workspace, sessionID string) (core.ReapplyResult, error) {
	return callClient(s, workspace, func(client *core.Client) (core.ReapplyResult, error) {
		return client.ReapplySession(s.ctx, sessionID)
	})
}

func (s *CoreService) Rename(workspace, sessionID, title string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.Rename(s.ctx, sessionID, title)
	})
}

// SelectModel persists a session-level provider/model override.
func (s *CoreService) SelectModel(workspace, sessionID, providerID, model string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.SetModel(s.ctx, sessionID, providerID, model)
	})
}

// Fork copies a session up to an optional sequence into a new session.
func (s *CoreService) Fork(workspace, sessionID string, before int64, title string) (core.SessionInfo, error) {
	return callClient(s, workspace, func(client *core.Client) (core.SessionInfo, error) {
		return client.Fork(s.ctx, sessionID, before, title)
	})
}

func (s *CoreService) Delete(workspace, sessionID string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.Delete(s.ctx, sessionID)
	})
}

// AgentCatalog is the selectable primary profiles plus the default id.
type AgentCatalog struct {
	Agents  []core.Agent `json:"agents"`
	Default string       `json:"default"`
}

// WorkspaceUsage aggregates usage across every session of a workspace.
func (s *CoreService) WorkspaceUsage(workspace string) (core.WorkspaceUsage, error) {
	return callClient(s, workspace, func(client *core.Client) (core.WorkspaceUsage, error) {
		return client.WorkspaceUsage(s.ctx)
	})
}

// SearchFiles finds files whose relative path contains the query.
func (s *CoreService) SearchFiles(workspace, query string, limit int) (core.FileSearchResult, error) {
	return callClient(s, workspace, func(client *core.Client) (core.FileSearchResult, error) {
		return client.SearchFiles(s.ctx, query, limit)
	})
}

// GrepFiles searches text file contents in the workspace.
func (s *CoreService) GrepFiles(workspace, query string, limit int) (core.FileGrepResult, error) {
	return callClient(s, workspace, func(client *core.Client) (core.FileGrepResult, error) {
		return client.GrepFiles(s.ctx, query, limit)
	})
}

// SearchEvents searches durable event payloads across every session.
func (s *CoreService) SearchEvents(workspace, query string, limit int) ([]core.SearchHit, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.SearchHit, error) {
		return client.SearchEvents(s.ctx, query, limit)
	})
}

// Plugins lists connected plugins with their tools and commands.
func (s *CoreService) Plugins(workspace string) ([]core.PluginStatus, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.PluginStatus, error) {
		return client.Plugins(s.ctx)
	})
}

// CallPluginTool invokes one tool contributed by a plugin.
func (s *CoreService) CallPluginTool(workspace, plugin, name string, arguments map[string]any) (core.PluginToolResult, error) {
	return callClient(s, workspace, func(client *core.Client) (core.PluginToolResult, error) {
		return client.CallPluginTool(s.ctx, plugin, name, arguments)
	})
}

// Skills lists the discovered skill catalog.
func (s *CoreService) Skills(workspace string) ([]core.SkillSummary, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.SkillSummary, error) {
		return client.Skills(s.ctx)
	})
}

// SkillDetail returns one skill's instructions and sampled files.
func (s *CoreService) SkillDetail(workspace, id string) (core.SkillDetail, error) {
	return callClient(s, workspace, func(client *core.Client) (core.SkillDetail, error) {
		return client.SkillDetail(s.ctx, id)
	})
}

// CreateSkill writes a new skill under a local root.
func (s *CoreService) CreateSkill(workspace, id, name, description, content string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.CreateSkill(s.ctx, id, name, description, content)
	})
}

// DeleteSkill removes one local skill.
func (s *CoreService) DeleteSkill(workspace, id string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.DeleteSkill(s.ctx, id)
	})
}

// SkillErrors lists per-source remote pull failures.
func (s *CoreService) SkillErrors(workspace string) ([]core.SkillSourceError, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.SkillSourceError, error) {
		return client.SkillErrors(s.ctx)
	})
}

// RefreshSkills rescans local roots and retries remote skill sources.
func (s *CoreService) RefreshSkills(workspace string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.RefreshSkills(s.ctx)
	})
}

// RefreshSkillSource retries one remote skill source.
func (s *CoreService) RefreshSkillSource(workspace, sourceURL string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.RefreshSkillSource(s.ctx, sourceURL)
	})
}

// MCPStatus lists configured MCP servers with their status and catalogs.
func (s *CoreService) MCPStatus(workspace string) ([]core.MCPServer, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.MCPServer, error) {
		return client.MCPStatus(s.ctx)
	})
}

// ReconnectMCP retries one failed MCP server.
func (s *CoreService) ReconnectMCP(workspace, server string) (core.MCPServer, error) {
	return callClient(s, workspace, func(client *core.Client) (core.MCPServer, error) {
		return client.ReconnectMCP(s.ctx, server)
	})
}

// MCPEvents lists the event types one connected MCP server advertises.
func (s *CoreService) MCPEvents(workspace, server string) ([]core.MCPEventType, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.MCPEventType, error) {
		return client.MCPEvents(s.ctx, server)
	})
}

// DisconnectMCP stops one MCP server without changing its configuration.
func (s *CoreService) DisconnectMCP(workspace, server string) (core.MCPServer, error) {
	return callClient(s, workspace, func(client *core.Client) (core.MCPServer, error) {
		return client.DisconnectMCP(s.ctx, server)
	})
}

// StartMCPAuth starts OAuth for one MCP server.
func (s *CoreService) StartMCPAuth(workspace, server string) (core.MCPAuth, error) {
	return callClient(s, workspace, func(client *core.Client) (core.MCPAuth, error) {
		return client.StartMCPAuth(s.ctx, server)
	})
}

// ExchangeMCPAuth completes a pasted-code MCP login.
func (s *CoreService) ExchangeMCPAuth(workspace, server, code, state string) (core.MCPServer, error) {
	return callClient(s, workspace, func(client *core.Client) (core.MCPServer, error) {
		return client.ExchangeMCPAuth(s.ctx, server, code, state)
	})
}

// CallMCPTool invokes one tool on a connected MCP server.
func (s *CoreService) CallMCPTool(workspace, server, name string, arguments map[string]any) (core.MCPToolResult, error) {
	return callClient(s, workspace, func(client *core.Client) (core.MCPToolResult, error) {
		return client.CallMCPTool(s.ctx, server, name, arguments)
	})
}

// ReadMCPResource reads one resource from a connected MCP server.
func (s *CoreService) ReadMCPResource(workspace, server, uri string) ([]core.MCPServerContent, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.MCPServerContent, error) {
		return client.ReadMCPResource(s.ctx, server, uri)
	})
}

// Agents lists the primary agent profiles.
func (s *CoreService) Agents(workspace string) (AgentCatalog, error) {
	return callClient(s, workspace, func(client *core.Client) (AgentCatalog, error) {
		agents, defaultID, err := client.Agents(s.ctx)
		return AgentCatalog{Agents: agents, Default: defaultID}, err
	})
}

// SelectAgent persists the session agent selection.
func (s *CoreService) SelectAgent(workspace, sessionID, agent string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.SetAgent(s.ctx, sessionID, agent)
	})
}

// Worktrees lists git worktrees for one workspace.
func (s *CoreService) Worktrees(workspace string) (core.WorktreeList, error) {
	return callClient(s, workspace, func(client *core.Client) (core.WorktreeList, error) {
		return client.Worktrees(s.ctx)
	})
}

// CreateWorktree creates a git worktree from one workspace.
func (s *CoreService) CreateWorktree(workspace, name string) (core.Worktree, error) {
	return callClient(s, workspace, func(client *core.Client) (core.Worktree, error) {
		return client.CreateWorktree(s.ctx, name, "", "")
	})
}

// RemoveWorktree deletes a git worktree.
func (s *CoreService) RemoveWorktree(workspace, path string, force bool) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.RemoveWorktree(s.ctx, path, force)
	})
}

// Formatters lists the formatters resolved for one workspace.
func (s *CoreService) Formatters(workspace string) ([]core.Formatter, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.Formatter, error) {
		return client.Formatters(s.ctx)
	})
}

// FormatFile runs the matching formatter for one file.
func (s *CoreService) FormatFile(workspace, path string) (core.FormatResult, error) {
	return callClient(s, workspace, func(client *core.Client) (core.FormatResult, error) {
		return client.Format(s.ctx, path)
	})
}

// ShareSession creates a revocable transcript link and returns its local URL.
func (s *CoreService) ShareSession(workspace, sessionID string) (core.ShareInfo, error) {
	client, err := s.client(workspace)
	if err != nil {
		return core.ShareInfo{}, err
	}
	info, err := client.Share(s.ctx, sessionID)
	if err != nil {
		return core.ShareInfo{}, err
	}
	info.URL = client.BaseURL + info.Path
	return info, nil
}

// ShareStatus reports whether a session is shared.
func (s *CoreService) ShareStatus(workspace, sessionID string) (core.ShareState, error) {
	client, err := s.client(workspace)
	if err != nil {
		return core.ShareState{}, err
	}
	return client.ShareStatus(s.ctx, sessionID)
}

// ShareConfig returns the share endpoint and mode for one workspace.
func (s *CoreService) ShareConfig(workspace string) (core.ShareServiceStatus, error) {
	return callClient(s, workspace, func(client *core.Client) (core.ShareServiceStatus, error) {
		return client.ShareConfig(s.ctx)
	})
}

// UnshareSession revokes a session share.
func (s *CoreService) UnshareSession(workspace, sessionID string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.Unshare(s.ctx, sessionID)
	})
}

// OAuthStatuses lists OAuth endpoints for one workspace.
func (s *CoreService) OAuthStatuses(workspace string) ([]core.OAuthStatus, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.OAuthStatus, error) {
		return client.OAuthStatuses(s.ctx)
	})
}

// RefreshOAuth forces a token refresh.
func (s *CoreService) RefreshOAuth(workspace, name string) (core.OAuthStatus, error) {
	return callClient(s, workspace, func(client *core.Client) (core.OAuthStatus, error) {
		return client.RefreshOAuth(s.ctx, name)
	})
}

// AuthorizeOAuth starts the authorization-code flow.
func (s *CoreService) AuthorizeOAuth(workspace, name string) (core.OAuthAuthorization, error) {
	return callClient(s, workspace, func(client *core.Client) (core.OAuthAuthorization, error) {
		return client.AuthorizeOAuth(s.ctx, name)
	})
}

// ExchangeOAuth completes the authorization-code flow.
func (s *CoreService) ExchangeOAuth(workspace, name, code, state string) (core.OAuthStatus, error) {
	return callClient(s, workspace, func(client *core.Client) (core.OAuthStatus, error) {
		return client.ExchangeOAuth(s.ctx, name, code, state)
	})
}

// RevokeOAuth deletes a stored token.
func (s *CoreService) RevokeOAuth(workspace, name string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.RevokeOAuth(s.ctx, name)
	})
}

// MoveSession transfers a session from one workspace core to another.
func (s *CoreService) MoveSession(fromWorkspace, toWorkspace, sessionID string) error {
	source, err := s.client(fromWorkspace)
	if err != nil {
		return err
	}
	target, err := s.client(toWorkspace)
	if err != nil {
		return err
	}
	if source.BaseURL == target.BaseURL {
		return errors.New("source and target workspaces are the same")
	}
	return source.MoveSession(s.ctx, sessionID, target.BaseURL)
}

// WebSearchStatus returns the configured search provider.
func (s *CoreService) WebSearchStatus(workspace string) (core.WebSearchStatus, error) {
	return callClient(s, workspace, func(client *core.Client) (core.WebSearchStatus, error) {
		return client.WebSearchStatus(s.ctx)
	})
}

// WebSearch runs a manual search.
func (s *CoreService) WebSearch(workspace, query string) ([]core.SearchResult, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.SearchResult, error) {
		return client.WebSearch(s.ctx, query)
	})
}

// ImageStatus returns the configured image generator for one workspace.
func (s *CoreService) ImageStatus(workspace string) (core.ImageStatus, error) {
	return callClient(s, workspace, func(client *core.Client) (core.ImageStatus, error) {
		return client.ImageStatus(s.ctx)
	})
}

// GenerateImage creates one image from a prompt.
func (s *CoreService) GenerateImage(workspace, prompt, size string) (core.GeneratedImage, error) {
	return callClient(s, workspace, func(client *core.Client) (core.GeneratedImage, error) {
		return client.GenerateImage(s.ctx, prompt, size)
	})
}

// Artifacts lists stored artifacts for one workspace.
func (s *CoreService) Artifacts(workspace string) ([]core.ArtifactInfo, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.ArtifactInfo, error) {
		return client.Artifacts(s.ctx)
	})
}

// Artifact reads one artifact.
func (s *CoreService) Artifact(workspace, id string) (core.ArtifactContent, error) {
	return callClient(s, workspace, func(client *core.Client) (core.ArtifactContent, error) {
		return client.Artifact(s.ctx, id)
	})
}

// DeleteArtifact removes one artifact.
func (s *CoreService) DeleteArtifact(workspace, id string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.DeleteArtifact(s.ctx, id)
	})
}

// Schedules lists schedules for one workspace, optionally one session.
func (s *CoreService) Schedules(workspace, sessionID string) ([]core.ScheduleItem, error) {
	return callClient(s, workspace, func(client *core.Client) ([]core.ScheduleItem, error) {
		return client.Schedules(s.ctx, sessionID)
	})
}

// CreateSchedule stores a new schedule owned by one session.
func (s *CoreService) CreateSchedule(workspace, sessionID, name, prompt string, when core.ScheduleWhen) (core.ScheduleItem, error) {
	return callClient(s, workspace, func(client *core.Client) (core.ScheduleItem, error) {
		return client.CreateSchedule(s.ctx, sessionID, name, prompt, when)
	})
}

// UpdateSchedule edits, pauses, or resumes one schedule.
func (s *CoreService) UpdateSchedule(workspace, id string, input core.ScheduleUpdate) (core.ScheduleItem, error) {
	return callClient(s, workspace, func(client *core.Client) (core.ScheduleItem, error) {
		return client.UpdateSchedule(s.ctx, id, input)
	})
}

// DeleteSchedule removes one schedule owned by a session.
func (s *CoreService) DeleteSchedule(workspace, sessionID, id string) error {
	return doClient(s, workspace, func(client *core.Client) error {
		return client.DeleteSchedule(s.ctx, id, sessionID)
	})
}

// NewSessionID returns an ID the core accepts, used before the first message.
func (s *CoreService) NewSessionID() string {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("s-%d", time.Now().UnixNano())
	}
	return "s-" + hex.EncodeToString(buf)
}

func streamKey(workspace, sessionID string) string {
	return workspace + "\x00" + sessionID
}
