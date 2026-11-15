package core

import (
	"net/http"
	"strings"
)

// TokenHeader is the request header carrying the core API token.
const TokenHeader = "X-Lingzhu-Token"

// tokenTransport adds the API token to every outgoing request. The core
// refuses any request without it, so one transport keeps every call site from
// having to remember the header.
type tokenTransport struct {
	token string
	next  http.RoundTripper
}

// RoundTrip injects the token unless the caller set one explicitly.
func (t tokenTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	if t.token != "" && request.Header.Get(TokenHeader) == "" {
		// Clone so a caller that reuses the request never observes the header
		// it did not set.
		cloned := request.Clone(request.Context())
		cloned.Header.Set(TokenHeader, t.token)
		request = cloned
	}
	next := t.next
	if next == nil {
		next = http.DefaultTransport
	}
	return next.RoundTrip(request)
}

// WithToken returns a copy of the client that presents token on every request.
func (c *Client) WithToken(token string) *Client {
	if c == nil {
		return nil
	}
	clone := *c
	base := http.DefaultTransport
	if c.HTTP != nil && c.HTTP.Transport != nil {
		base = c.HTTP.Transport
	}
	httpClient := &http.Client{}
	if c.HTTP != nil {
		*httpClient = *c.HTTP
	}
	httpClient.Transport = tokenTransport{token: strings.TrimSpace(token), next: base}
	clone.HTTP = httpClient
	return &clone
}
