package service

import (
	"bytes"
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReadPickedFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bundle.json")
	if err := os.WriteFile(path, []byte(`{"id":"s1"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	content, err := readPickedFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if content != `{"id":"s1"}` {
		t.Fatalf("unexpected content: %q", content)
	}

	binary := filepath.Join(t.TempDir(), "binary.bin")
	if err := os.WriteFile(binary, []byte("a\x00b"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := readPickedFile(binary); err == nil || !strings.Contains(err.Error(), "not text") {
		t.Fatalf("binary file should be rejected, got %v", err)
	}

	big := filepath.Join(t.TempDir(), "big.json")
	if err := os.WriteFile(big, make([]byte, maxPickedFileBytes+1), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := readPickedFile(big); err == nil || !strings.Contains(err.Error(), "larger") {
		t.Fatalf("oversized file should be rejected, got %v", err)
	}
}

func TestDecodeBase64Payload(t *testing.T) {
	want := []byte{0x89, 'P', 'N', 'G', 0x00, 0xff}
	plain := base64.StdEncoding.EncodeToString(want)
	got, err := decodeBase64Payload(plain)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("decode mismatch: %v", got)
	}

	dataURL, err := decodeBase64Payload("data:image/png;base64," + plain)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(dataURL, want) {
		t.Fatalf("data URL decode mismatch: %v", dataURL)
	}

	if _, err := decodeBase64Payload("not base64!"); err == nil {
		t.Fatal("invalid base64 should fail")
	}
}

func TestReadAttachment(t *testing.T) {
	root := t.TempDir()
	media := []byte{0x89, 'P', 'N', 'G', 0x00, 0xff}
	image := filepath.Join(root, "pixel.png")
	if err := os.WriteFile(image, media, 0o644); err != nil {
		t.Fatal(err)
	}
	picked, err := readAttachment(image)
	if err != nil {
		t.Fatal(err)
	}
	if picked.Mime != "image/png" || picked.Name != "pixel.png" || picked.Size != int64(len(media)) {
		t.Fatalf("unexpected attachment: %+v", picked)
	}
	decoded, err := base64.StdEncoding.DecodeString(picked.Data)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(decoded, media) {
		t.Fatalf("attachment bytes changed: %v", decoded)
	}

	doc := filepath.Join(root, "doc.pdf")
	if err := os.WriteFile(doc, []byte("%PDF-1.4"), 0o644); err != nil {
		t.Fatal(err)
	}
	if picked, err := readAttachment(doc); err != nil || picked.Mime != "application/pdf" {
		t.Fatalf("PDF attachment failed: %+v %v", picked, err)
	}

	text := filepath.Join(root, "notes.txt")
	if err := os.WriteFile(text, []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	if picked, err := readAttachment(text); err != nil || picked.Mime != "text/plain" {
		t.Fatalf("text attachment failed: %+v %v", picked, err)
	}

	binary := filepath.Join(root, "binary.bin")
	if err := os.WriteFile(binary, []byte{0xff, 0xfe, 0x00}, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := readAttachment(binary); err == nil || !strings.Contains(err.Error(), "unsupported") {
		t.Fatalf("binary file should be rejected, got %v", err)
	}

	big := filepath.Join(root, "big.png")
	if err := os.WriteFile(big, make([]byte, maxAttachmentFileBytes+1), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := readAttachment(big); err == nil || !strings.Contains(err.Error(), "larger") {
		t.Fatalf("oversized attachment should be rejected, got %v", err)
	}
}

func TestReadDirectoryAttachment(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "a.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(root, "nested"), 0o755); err != nil {
		t.Fatal(err)
	}
	picked, err := readDirectoryAttachment(root)
	if err != nil {
		t.Fatal(err)
	}
	if picked.Kind != "directory" || picked.Mime != "text/plain" {
		t.Fatalf("unexpected directory attachment: %+v", picked)
	}
	data, err := base64.StdEncoding.DecodeString(picked.Data)
	if err != nil {
		t.Fatal(err)
	}
	listing := string(data)
	for _, want := range []string{"Directory:", "a.txt (5 B)", "nested (dir)"} {
		if !strings.Contains(listing, want) {
			t.Fatalf("listing missing %q: %s", want, listing)
		}
	}
	if _, err := readDirectoryAttachment(filepath.Join(root, "a.txt")); err == nil {
		t.Fatal("regular file should not be accepted as a directory")
	}
}
