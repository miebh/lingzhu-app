package service

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// maxPickedFileBytes bounds files read through the desktop open dialog.
const maxPickedFileBytes = 8 << 20

// maxAttachmentFileBytes matches the core prompt attachment limit.
const maxAttachmentFileBytes = 20 << 20

// PickedFile is one text file chosen through the desktop open dialog.
type PickedFile struct {
	Path    string `json:"path"`
	Name    string `json:"name"`
	Content string `json:"content"`
}

// PickedAttachment is one image, PDF, text file, or directory chosen through
// the desktop open dialog.
type PickedAttachment struct {
	Path  string `json:"path"`
	Name  string `json:"name"`
	Mime  string `json:"mime"`
	Size  int64  `json:"size"`
	Data  string `json:"data"`
	Kind  string `json:"kind,omitempty"`
	Start int    `json:"start,omitempty"`
	End   int    `json:"end,omitempty"`
}

// SaveTextFile opens a native save dialog and writes content to the chosen
// path. It returns an empty path when the dialog is cancelled.
func (s *CoreService) SaveTextFile(defaultName, content string) (string, error) {
	return saveToDisk(defaultName, []byte(content))
}

// SaveBase64File decodes base64 content and writes it through the native save
// dialog, so binary artifact files survive the round trip unchanged.
func (s *CoreService) SaveBase64File(defaultName, encoded string) (string, error) {
	data, err := decodeBase64Payload(encoded)
	if err != nil {
		return "", err
	}
	return saveToDisk(defaultName, data)
}

func saveToDisk(defaultName string, data []byte) (string, error) {
	app := application.Get()
	if app == nil {
		return "", errors.New("desktop application is not ready")
	}
	name := strings.TrimSpace(defaultName)
	if name == "" {
		name = "untitled.txt"
	}
	dialog := app.Dialog.SaveFile()
	dialog.SetFilename(filepath.Base(name))
	switch strings.ToLower(filepath.Ext(name)) {
	case ".json":
		dialog.AddFilter("JSON", "*.json")
	case ".md", ".markdown":
		dialog.AddFilter("Markdown", "*.md;*.markdown")
	case ".html", ".htm":
		dialog.AddFilter("HTML", "*.html;*.htm")
	case ".png":
		dialog.AddFilter("PNG", "*.png")
	case ".jpg", ".jpeg":
		dialog.AddFilter("JPEG", "*.jpg;*.jpeg")
	case ".svg":
		dialog.AddFilter("SVG", "*.svg")
	}
	dialog.AddFilter("All files", "*.*")
	path, err := dialog.PromptForSingleSelection()
	if err != nil {
		return "", err
	}
	if path == "" {
		return "", nil
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return "", err
	}
	return path, nil
}

// decodeBase64Payload accepts standard base64, including data URLs.
func decodeBase64Payload(encoded string) ([]byte, error) {
	value := strings.TrimSpace(encoded)
	if comma := strings.Index(value, ","); strings.HasPrefix(value, "data:") && comma >= 0 {
		value = value[comma+1:]
	}
	data, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		return nil, fmt.Errorf("invalid base64 content: %w", err)
	}
	return data, nil
}

// PickInstaller opens a native dialog for an installer executable and returns
// its path. The file is never read: an installer is a binary, and the updater
// only needs to start it.
func (s *CoreService) PickInstaller(title string) (string, error) {
	app := application.Get()
	if app == nil {
		return "", errors.New("desktop application is not ready")
	}
	dialog := app.Dialog.OpenFile()
	dialog.CanChooseFiles(true)
	dialog.CanChooseDirectories(false)
	dialog.AddFilter("Installer", "*.exe")
	dialog.AddFilter("All files", "*.*")
	if strings.TrimSpace(title) != "" {
		dialog.SetTitle(title)
	}
	return dialog.PromptForSingleSelection()
}

// ReadTextFile opens a native open dialog and returns the chosen UTF-8 file.
func (s *CoreService) ReadTextFile(title string) (PickedFile, error) {
	app := application.Get()
	if app == nil {
		return PickedFile{}, errors.New("desktop application is not ready")
	}
	dialog := app.Dialog.OpenFile()
	dialog.CanChooseFiles(true)
	dialog.CanChooseDirectories(false)
	dialog.AddFilter("JSON", "*.json")
	dialog.AddFilter("Text", "*.txt;*.md;*.markdown")
	dialog.AddFilter("All files", "*.*")
	if strings.TrimSpace(title) != "" {
		dialog.SetTitle(title)
	}
	path, err := dialog.PromptForSingleSelection()
	if err != nil {
		return PickedFile{}, err
	}
	if path == "" {
		return PickedFile{}, nil
	}
	content, err := readPickedFile(path)
	if err != nil {
		return PickedFile{}, err
	}
	return PickedFile{Path: path, Name: filepath.Base(path), Content: content}, nil
}

// ReadAttachmentFile opens a native dialog and returns the chosen image, PDF,
// or text file as base64 for a prompt attachment.
func (s *CoreService) ReadAttachmentFile(title string) (PickedAttachment, error) {
	app := application.Get()
	if app == nil {
		return PickedAttachment{}, errors.New("desktop application is not ready")
	}
	dialog := app.Dialog.OpenFile()
	dialog.CanChooseFiles(true)
	dialog.CanChooseDirectories(false)
	dialog.AddFilter("Images", "*.png;*.jpg;*.jpeg;*.gif;*.webp")
	dialog.AddFilter("PDF", "*.pdf")
	dialog.AddFilter("Text", "*.txt;*.md;*.markdown;*.json;*.yaml;*.yml;*.xml;*.csv;*.log;*.toml;*.js;*.ts;*.tsx;*.jsx")
	dialog.AddFilter("All files", "*.*")
	if strings.TrimSpace(title) != "" {
		dialog.SetTitle(title)
	}
	path, err := dialog.PromptForSingleSelection()
	if err != nil {
		return PickedAttachment{}, err
	}
	if path == "" {
		return PickedAttachment{}, nil
	}
	return readAttachment(path)
}

// readDirectoryAttachment renders immediate entries only, matching the
// attachment semantics for directories.
func readDirectoryAttachment(path string) (PickedAttachment, error) {
	info, err := os.Stat(path)
	if err != nil {
		return PickedAttachment{}, err
	}
	if !info.IsDir() {
		return PickedAttachment{}, errors.New("attachment is not a directory")
	}
	entries, err := os.ReadDir(path)
	if err != nil {
		return PickedAttachment{}, err
	}
	name := filepath.Base(path)
	var listing strings.Builder
	fmt.Fprintf(&listing, "Directory: %s\nPath: %s\nEntries:\n", name, path)
	limit := len(entries)
	if limit > 500 {
		limit = 500
	}
	for _, entry := range entries[:limit] {
		kind := "file"
		size := int64(0)
		if entry.IsDir() {
			kind = "dir"
		} else if entry.Type()&os.ModeSymlink != 0 {
			kind = "link"
		} else if entryInfo, err := entry.Info(); err == nil {
			size = entryInfo.Size()
		}
		if kind == "file" {
			fmt.Fprintf(&listing, "- %s (%s)\n", entry.Name(), formatAttachmentSize(size))
		} else {
			fmt.Fprintf(&listing, "- %s (%s)\n", entry.Name(), kind)
		}
	}
	if len(entries) > limit {
		fmt.Fprintf(&listing, "- ... %d more entries\n", len(entries)-limit)
	}
	data := []byte(listing.String())
	if len(data) > maxAttachmentFileBytes {
		return PickedAttachment{}, fmt.Errorf("directory listing is larger than %d MB", maxAttachmentFileBytes>>20)
	}
	return PickedAttachment{
		Path: path,
		Name: name + "/",
		Mime: "text/plain",
		Size: int64(len(data)),
		Data: base64.StdEncoding.EncodeToString(data),
		Kind: "directory",
	}, nil
}

func formatAttachmentSize(bytes int64) string {
	if bytes < 1024 {
		return fmt.Sprintf("%d B", bytes)
	}
	if bytes < 1024*1024 {
		return fmt.Sprintf("%.1f KB", float64(bytes)/1024)
	}
	return fmt.Sprintf("%.1f MB", float64(bytes)/(1024*1024))
}

// readAttachment validates the media type and size, then encodes the bytes for
// the prompt payload.
func readAttachment(path string) (PickedAttachment, error) {
	info, err := os.Stat(path)
	if err != nil {
		return PickedAttachment{}, err
	}
	if info.Size() > maxAttachmentFileBytes {
		return PickedAttachment{}, fmt.Errorf("attachment is larger than %d MB", maxAttachmentFileBytes>>20)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return PickedAttachment{}, err
	}
	if len(data) == 0 {
		return PickedAttachment{}, errors.New("attachment is empty")
	}
	mime, ok := attachmentMime(path)
	if !ok {
		if !utf8.Valid(data) || bytes.IndexByte(data, 0) >= 0 {
			return PickedAttachment{}, fmt.Errorf("unsupported attachment type: %s", filepath.Ext(path))
		}
		mime = "text/plain"
	}
	if isTextAttachmentMime(mime) && (!utf8.Valid(data) || bytes.IndexByte(data, 0) >= 0) {
		return PickedAttachment{}, errors.New("attachment is not UTF-8 text")
	}
	kind := "file"
	if isTextAttachmentMime(mime) {
		kind = "text"
	}
	return PickedAttachment{
		Path: path,
		Name: filepath.Base(path),
		Mime: mime,
		Size: int64(len(data)),
		Data: base64.StdEncoding.EncodeToString(data),
		Kind: kind,
	}, nil
}

func attachmentMime(path string) (string, bool) {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".png":
		return "image/png", true
	case ".jpg", ".jpeg":
		return "image/jpeg", true
	case ".gif":
		return "image/gif", true
	case ".webp":
		return "image/webp", true
	case ".pdf":
		return "application/pdf", true
	case ".json":
		return "application/json", true
	case ".yaml", ".yml":
		return "application/yaml", true
	case ".xml":
		return "application/xml", true
	case ".toml":
		return "application/toml", true
	case ".js", ".jsx":
		return "application/javascript", true
	case ".ts", ".tsx":
		return "application/typescript", true
	case ".sh":
		return "application/x-sh", true
	case ".txt", ".md", ".markdown", ".csv", ".log", ".html", ".htm", ".css",
		".go", ".py", ".rs", ".java", ".c", ".h", ".cpp", ".hpp", ".cs", ".rb",
		".php", ".swift", ".kt", ".kts", ".scala", ".lua", ".sql", ".ini", ".cfg", ".conf":
		return "text/plain", true
	default:
		return "", false
	}
}

func isTextAttachmentMime(mime string) bool {
	if strings.HasPrefix(mime, "text/") {
		return true
	}
	switch mime {
	case "application/json", "application/xml", "application/yaml", "application/x-yaml",
		"application/javascript", "application/typescript", "application/x-sh", "application/toml":
		return true
	default:
		return false
	}
}

// readPickedFile reads a small text file and refuses oversized input.
func readPickedFile(path string) (string, error) {
	info, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	if info.Size() > maxPickedFileBytes {
		return "", fmt.Errorf("file is larger than %d MB", maxPickedFileBytes>>20)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	if bytes.IndexByte(data, 0) >= 0 {
		return "", errors.New("file is not text")
	}
	return string(data), nil
}
