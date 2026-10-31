// Package core is a small HTTP/SSE client for a running lingzhu core.
package core

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ErrBusy is returned when the session already has a running turn.
var ErrBusy = errors.New("session is already running")

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
}

func New(baseURL string) *Client {
	return &Client{BaseURL: strings.TrimRight(baseURL, "/"), HTTP: &http.Client{Timeout: 0}}
}

type Health struct {
	Status string `json:"status"`
}

type SessionInfo struct {
	ID      string    `json:"id"`
	Title   string    `json:"title"`
	Updated time.Time `json:"updated"`
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
}

type ContextInfo struct {
	Messages []Message `json:"messages"`
	Tokens   int       `json:"tokens"`
	Window   int       `json:"window"`
}

type PermissionRequest struct {
	ID        string   `json:"id"`
	SessionID string   `json:"sessionId"`
	Action    string   `json:"action"`
	Resources []string `json:"resources"`
	Message   string   `json:"message,omitempty"`
}

// Event is one payload from the core event stream.
type Event struct {
	Seq  int64          `json:"seq"`
	Type string         `json:"type"`
	At   time.Time      `json:"at"`
	Data map[string]any `json:"data"`
}

func (c *Client) Health(ctx context.Context) error {
	var health Health
	return c.do(ctx, http.MethodGet, "/healthz", nil, &health)
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

func (c *Client) Context(ctx context.Context, sessionID string) (ContextInfo, error) {
	var info ContextInfo
	err := c.do(ctx, http.MethodGet, sessionPath(sessionID, "/context"), nil, &info)
	return info, err
}

func (c *Client) Rename(ctx context.Context, sessionID, title string) error {
	body := map[string]string{"title": title}
	return c.do(ctx, http.MethodPatch, "/sessions/"+sessionID, body, nil)
}

func (c *Client) Delete(ctx context.Context, sessionID string) error {
	return c.do(ctx, http.MethodDelete, "/sessions/"+sessionID, nil, nil)
}

func (c *Client) Interrupt(ctx context.Context, sessionID string) (bool, error) {
	var payload struct {
		Interrupted bool `json:"interrupted"`
	}
	err := c.do(ctx, http.MethodPost, sessionPath(sessionID, "/interrupt"), nil, &payload)
	return payload.Interrupted, err
}

func (c *Client) Compact(ctx context.Context, sessionID string) error {
	return c.do(ctx, http.MethodPost, sessionPath(sessionID, "/compact"), nil, nil)
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

// Prompt starts a turn and streams its events to emit until the turn ends.
func (c *Client) Prompt(ctx context.Context, sessionID, text string, emit func(Event)) error {
	payload, err := json.Marshal(map[string]string{"text": text})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+sessionPath(sessionID, "/prompt"), bytes.NewReader(payload))
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
	req, err := http.NewRequestWithContext(ctx, method, c.BaseURL+path, reader)
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
	return &HTTPError{Status: resp.StatusCode, Message: message}
}

func sessionPath(sessionID, suffix string) string {
	return "/sessions/" + sessionID + suffix
}
