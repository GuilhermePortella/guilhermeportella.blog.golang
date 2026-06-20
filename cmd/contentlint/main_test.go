package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
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
