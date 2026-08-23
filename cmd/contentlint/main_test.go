package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestRunAcceptsValidArticlesAndNotes(t *testing.T) {
	articlesDir := t.TempDir()
	notesDir := t.TempDir()

	writeTestFile(t, filepath.Join(articlesDir, "meu-artigo.md"), `---
title: "Meu artigo"
summary: "Resumo curto."
author: "Guilherme Portella"
publishedAt: "2026-05-04"
tags:
  - Go
---

Texto do artigo.
`)
	writeTestFile(t, filepath.Join(notesDir, "minha-nota.md"), `---
title: "Minha nota"
date: "2026-05-04"
---

Texto da nota.
`)

	if err := run([]string{"-articles", articlesDir, "-notes", notesDir}); err != nil {
		t.Fatalf("run() error = %v", err)
	}
}

func TestRunReportsContentIssues(t *testing.T) {
	articlesDir := t.TempDir()
	notesDir := t.TempDir()

	writeTestFile(t, filepath.Join(articlesDir, "sem-resumo.md"), `---
title: "Sem resumo"
author: "Guilherme Portella"
publishedAt: "2026-99-99"
---

`)
	writeTestFile(t, filepath.Join(notesDir, "sem-data.md"), `---
title: "Sem data"
---

Texto.
`)

	err := run([]string{"-articles", articlesDir, "-notes", notesDir})
	if err == nil {
		t.Fatal("run() error = nil, want content issues")
	}

	for _, expected := range []string{
		"summary is required",
		"publishedAt/publishedDate must be YYYY-MM-DD or RFC3339",
		"body is required",
		"date is required",
	} {
		if !strings.Contains(err.Error(), expected) {
			t.Fatalf("run() error = %q, want it to contain %q", err.Error(), expected)
		}
	}
}

func TestRunReportsDuplicateArticleSlugs(t *testing.T) {
	articlesDir := t.TempDir()
	notesDir := t.TempDir()

	writeTestFile(t, filepath.Join(articlesDir, "primeiro.md"), validArticleFrontmatter("Titulo 1", "slug repetido"))
	writeTestFile(t, filepath.Join(articlesDir, "segundo.md"), validArticleFrontmatter("Titulo 2", "slug-repetido"))
	writeTestFile(t, filepath.Join(notesDir, "nota.md"), `---
title: "Nota"
date: "2026-05-04"
---

Texto.
`)

	err := run([]string{"-articles", articlesDir, "-notes", notesDir})
	if err == nil {
		t.Fatal("run() error = nil, want duplicate slug issue")
	}
	if !strings.Contains(err.Error(), `article slug "slug-repetido" duplicates`) {
		t.Fatalf("run() error = %q, want duplicate slug issue", err.Error())
	}
}

func TestRunReportsMalformedFrontmatter(t *testing.T) {
	articlesDir := t.TempDir()
	notesDir := t.TempDir()
	writeTestFile(t, filepath.Join(articlesDir, "broken.md"), "---\ntitle: [broken\n---\n\nTexto.\n")
	writeTestFile(t, filepath.Join(notesDir, "missing-frontmatter.md"), "Texto sem frontmatter.\n")

	err := run([]string{"-articles", articlesDir, "-notes", notesDir})
	if err == nil {
		t.Fatal("run() error = nil, want frontmatter issues")
	}
	for _, expected := range []string{"decode YAML frontmatter", "missing YAML frontmatter block"} {
		if !strings.Contains(err.Error(), expected) {
			t.Fatalf("run() error = %q, want it to contain %q", err, expected)
		}
	}
}

func TestRunReportsEmptyMarkdownDirectories(t *testing.T) {
	err := run([]string{"-articles", t.TempDir(), "-notes", t.TempDir()})
	if err == nil {
		t.Fatal("run() error = nil, want empty directory issues")
	}
	if count := strings.Count(err.Error(), "no Markdown files found"); count != 2 {
		t.Fatalf("empty directory issues = %d, want 2: %v", count, err)
	}
}

func TestRunReportsMissingDirectory(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "missing")
	err := run([]string{"-articles", missing, "-notes", t.TempDir()})
	if err == nil {
		t.Fatal("run() error = nil, want missing directory error")
	}
	if !strings.Contains(err.Error(), "open") || !strings.Contains(err.Error(), "missing") {
		t.Fatalf("run() error = %q, want missing directory details", err)
	}
}

func TestContentValueHelpers(t *testing.T) {
	when := time.Date(2026, time.May, 4, 13, 30, 0, 0, time.FixedZone("BRT", -3*60*60))
	tests := []struct {
		name string
		data map[string]any
		want string
	}{
		{name: "trimmed string", data: map[string]any{"value": " texto "}, want: "texto"},
		{name: "date", data: map[string]any{"value": time.Date(2026, time.May, 4, 0, 0, 0, 0, time.UTC)}, want: "2026-05-04"},
		{name: "timestamp", data: map[string]any{"value": when}, want: "2026-05-04T13:30:00-03:00"},
		{name: "number", data: map[string]any{"value": 42}, want: "42"},
		{name: "nil", data: map[string]any{"value": nil}, want: ""},
		{name: "missing", data: map[string]any{}, want: ""},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := fieldString(test.data, "value"); got != test.want {
				t.Fatalf("fieldString() = %q, want %q", got, test.want)
			}
		})
	}
}

func TestNormalizeSlugFoldsAccentsAndSeparators(t *testing.T) {
	tests := map[string]string{
		" Árvore e Coração ":       "arvore-e-coracao",
		"ÉLÈVE_ÎLE-DE-FRANCE":      "eleve-ile-de-france",
		"Pão, maçã, órgão e manhã": "pao-maca-orgao-e-manha",
		"Ünico--número 42":         "unico-numero-42",
		"!!!":                      "",
	}

	for input, want := range tests {
		if got := normalizeSlug(input); got != want {
			t.Fatalf("normalizeSlug(%q) = %q, want %q", input, got, want)
		}
	}
}

func validArticleFrontmatter(title string, slug string) string {
	return `---
title: "` + title + `"
summary: "Resumo."
author: "Guilherme Portella"
publishedAt: "2026-05-04"
slug: "` + slug + `"
---

Texto.
`
}

func writeTestFile(t *testing.T, path string, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll(%q) error = %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("WriteFile(%q) error = %v", path, err)
	}
}
