package service

import (
	"encoding/json"
	"errors"
	"strings"
)

// MCPConfig returns the configured MCP servers as raw JSON objects so unknown
// fields survive an edit from the desktop UI.
func (s *CoreService) MCPConfig() (map[string]json.RawMessage, error) {
	s.configMu.Lock()
	defer s.configMu.Unlock()
	file, err := s.readConfigFile()
	if err != nil {
		return nil, err
	}
	return readMCPServers(file), nil
}

// SaveMCPConfig replaces the configured servers and restarts the cores this app
// owns so the new set connects. Other mcp options, such as the global timeout,
// are preserved.
func (s *CoreService) SaveMCPConfig(servers map[string]json.RawMessage) error {
	if servers == nil {
		return errors.New("mcp servers are required")
	}
	for name := range servers {
		if strings.TrimSpace(name) == "" {
			return errors.New("mcp server name is empty")
		}
	}
	s.mu.Lock()
	busy := len(s.streams) > 0
	s.mu.Unlock()
	if busy {
		return errors.New("stop running sessions before changing settings")
	}
	s.configMu.Lock()
	file, err := s.readConfigFile()
	if err != nil {
		s.configMu.Unlock()
		return err
	}
	mcp, ok := asDocument(file["mcp"])
	if !ok {
		mcp = document{}
	}
	mcp["servers"] = servers
	file["mcp"] = mcp
	path := s.configFilePath()
	err = writeConfigFile(path, file)
	s.configMu.Unlock()
	if err != nil {
		return err
	}
	s.mu.Lock()
	s.configPath = path
	s.mu.Unlock()
	s.restartWorkspaces()
	return nil
}

func readMCPServers(file document) map[string]json.RawMessage {
	mcp, ok := asDocument(file["mcp"])
	if !ok {
		return map[string]json.RawMessage{}
	}
	servers, ok := asDocument(mcp["servers"])
	if !ok {
		return map[string]json.RawMessage{}
	}
	out := make(map[string]json.RawMessage, len(servers))
	for name, value := range servers {
		if data, err := json.Marshal(value); err == nil {
			out[name] = data
		}
	}
	return out
}
