package core

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// TokenEnv carries the API token to a core this process starts. The core
// prefers it over its own stored token, so both sides agree without a file
// round trip.
const TokenEnv = "LINGZHU_TOKEN"

// tokenFile is the file a core writes its token to. A core started by another
// process is reached by reading the same file.
const tokenFile = "api-token"

// readToken returns the token of the core that owns dataDir, or an empty
// string when the file does not exist yet.
func readToken(dataDir string) string {
	if strings.TrimSpace(dataDir) == "" {
		return ""
	}
	data, err := os.ReadFile(filepath.Join(dataDir, tokenFile))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

// ensureToken returns the token for dataDir, creating and storing one when the
// file does not exist yet. The app and the core it starts share the file, so a
// core started by an earlier run stays reachable.
func ensureToken(dataDir string) (string, error) {
	if token := readToken(dataDir); token != "" {
		return token, nil
	}
	token, err := newToken()
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return "", err
	}
	path := filepath.Join(dataDir, tokenFile)
	temp := path + ".tmp"
	if err := os.WriteFile(temp, []byte(token+"\n"), 0o600); err != nil {
		return "", err
	}
	if err := os.Rename(temp, path); err != nil {
		_ = os.Remove(temp)
		return "", err
	}
	return token, nil
}

// newToken returns a fresh random token.
func newToken() (string, error) {
	buffer := make([]byte, 32)
	if _, err := rand.Read(buffer); err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}
	return hex.EncodeToString(buffer), nil
}
