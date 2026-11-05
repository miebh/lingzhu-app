package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSyncConfigOnlyTouchesInfoVersion(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yml")
	content := "version: '3'\ninfo:\n  productName: \"Lingzhu\"\n  version: \"0.1.0\"\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := syncConfig(path, "1.2.3"); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	want := "version: '3'\ninfo:\n  productName: \"Lingzhu\"\n  version: \"1.2.3\"\n"
	if string(got) != want {
		t.Fatalf("config = %q, want %q", got, want)
	}
}

func TestSyncInfoJSONSetsFileAndProductVersion(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "info.json")
	content := `{"fixed":{"file_version":"0.1.0","product_version":"0.1.0"},"info":{"0409":{"ProductVersion":"0.1.0","ProductName":"Lingzhu"}}}`
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := syncInfoJSON(path, "2.0.0"); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"fixed":{"file_version":"2.0.0","product_version":"2.0.0"},"info":{"0409":{"ProductVersion":"2.0.0","ProductName":"Lingzhu"}}}`
	if string(data) != want {
		t.Fatalf("info.json = %q, want %q", data, want)
	}
}

func TestSyncPlistUpdatesBothKeys(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "Info.plist")
	content := "<plist><dict><key>CFBundleVersion</key><string>0.1.0</string><key>CFBundleShortVersionString</key><string>0.1.0</string></dict></plist>"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := syncPlist(path, "3.1.4"); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	want := "<plist><dict><key>CFBundleVersion</key><string>3.1.4</string><key>CFBundleShortVersionString</key><string>3.1.4</string></dict></plist>"
	if string(data) != want {
		t.Fatalf("plist = %q, want %q", data, want)
	}
}

func TestRunRejectsNonSemanticVersion(t *testing.T) {
	if err := run("dev"); err == nil {
		t.Fatal("want an error for a non-semantic version")
	}
}

func TestSyncNFPMUpdatesVersionOnly(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "nfpm.yaml")
	content := "name: \"lingzhu-app\"\nversion: \"0.1.0\"\nrelease: \"1\"\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := syncNFPM(path, "1.4.0"); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	want := "name: \"lingzhu-app\"\nversion: \"1.4.0\"\nrelease: \"1\"\n"
	if string(got) != want {
		t.Fatalf("nfpm = %q, want %q", got, want)
	}
}

func TestWriteIfChangedLeavesIdenticalFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "file")
	if err := os.WriteFile(path, []byte("same"), 0o644); err != nil {
		t.Fatal(err)
	}
	before, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := writeIfChanged(path, "same"); err != nil {
		t.Fatal(err)
	}
	after, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if !after.ModTime().Equal(before.ModTime()) {
		t.Fatal("an unchanged file should not be rewritten")
	}
}
