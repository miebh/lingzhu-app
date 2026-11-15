package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// TestProvider checks that an endpoint answers. It uses the saved key when the
// form has none, and never logs or returns the key.
func (s *CoreService) TestProvider(providerID, baseURL, apiKey, apiKeyEnv string) (string, error) {
	file, err := s.readConfigFile()
	if err != nil {
		return "", err
	}
	providers, _, _ := readProviderSettings(file)
	id := strings.TrimSpace(providerID)
	base := strings.TrimSpace(baseURL)
	for _, provider := range providers {
		if provider.ID != id {
			continue
		}
		if base == "" {
			base = provider.BaseURL
		}
		if apiKeyEnv == "" {
			apiKeyEnv = provider.APIKeyEnv
		}
	}
	if err := validHTTPURL(base); err != nil {
		return "", err
	}
	key := strings.TrimSpace(apiKey)
	if key == "" && strings.TrimSpace(apiKeyEnv) != "" {
		key = os.Getenv(strings.TrimSpace(apiKeyEnv))
	}
	if key == "" {
		key = savedProviderKey(file, id)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest(http.MethodGet, strings.TrimRight(base, "/")+"/models", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/json")
	if key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("connect: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	status := resp.StatusCode
	if status == http.StatusUnauthorized || status == http.StatusForbidden {
		return "", fmt.Errorf("provider %s: API key was rejected", resp.Status)
	}
	if status == http.StatusNotFound || status == http.StatusMethodNotAllowed {
		return "Endpoint reachable; model listing is not supported", nil
	}
	if status < 200 || status >= 300 {
		return "", fmt.Errorf("provider %s: %s", resp.Status, snippet(body))
	}
	var payload struct {
		Data []json.RawMessage `json:"data"`
	}
	if json.Unmarshal(body, &payload) == nil && len(payload.Data) > 0 {
		return fmt.Sprintf("Connected · %d models available", len(payload.Data)), nil
	}
	return "Connected", nil
}

func savedProviderKey(file document, id string) string {
	if providers, ok := asDocument(file["providers"]); ok {
		if entry, ok := asDocument(providers[id]); ok {
			if key := entry.str("api_key"); key != "" {
				return key
			}
			if env := entry.str("api_key_env"); env != "" {
				return os.Getenv(env)
			}
		}
	}
	if id == "default" {
		if key := file.str("api_key"); key != "" {
			return key
		}
		return os.Getenv("OPENAI_API_KEY")
	}
	return ""
}

func validHTTPURL(raw string) error {
	if raw == "" {
		return errors.New("base URL is required")
	}
	parsed, err := url.Parse(raw)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return errors.New("base URL must be an absolute http(s) URL")
	}
	return nil
}

func hasProvider(providers []ProviderSettings, id string) bool {
	for _, provider := range providers {
		if provider.ID == id {
			return true
		}
	}
	return false
}

func snippet(body []byte) string {
	text := strings.TrimSpace(string(body))
	if len(text) > 300 {
		text = text[:300] + "…"
	}
	return text
}
