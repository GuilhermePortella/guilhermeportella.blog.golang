package httptransport

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadNotesFromTempDirSortsAndDefaults(t *testing.T) {
	notesDir := t.TempDir()
	writeTestNote(t, notesDir, "antiga.md", `---
title: "Nota antiga"
date: "2026-04-02"
tag: "Go"
slug: "nota antiga"
---

Texto antigo.
`)
	writeTestNote(t, notesDir, "recente.md", `---
title: "Nota recente"
date: "2026-05-04"
---

Texto recente.
`)

	notes, err := loadNotes(notesDir)
	if err != nil {
		t.Fatalf("loadNotes() error = %v", err)
	}
	if len(notes) != 2 {
		t.Fatalf("len(notes) = %d, want 2", len(notes))
	}
	if notes[0].Title != "Nota recente" {
		t.Fatalf("notes[0].Title = %q, want Nota recente", notes[0].Title)
	}
	if notes[0].Tag != "nota" {
		t.Fatalf("notes[0].Tag = %q, want nota fallback", notes[0].Tag)
	}
	if notes[0].Slug != "recente" {
		t.Fatalf("notes[0].Slug = %q, want recente", notes[0].Slug)
	}
	if notes[0].DateLabel != "mai 2026" {
		t.Fatalf("notes[0].DateLabel = %q, want mai 2026", notes[0].DateLabel)
	}
	if notes[1].Slug != "nota-antiga" {
		t.Fatalf("notes[1].Slug = %q, want frontmatter slug", notes[1].Slug)
	}
}

func writeTestNote(t *testing.T, dir string, name string, content string) {
	t.Helper()

	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
		t.Fatalf("WriteFile(%q) error = %v", name, err)
	}
}
