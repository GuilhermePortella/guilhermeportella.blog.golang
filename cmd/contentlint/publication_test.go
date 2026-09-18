package main

import (
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	httptransport "github.com/guilhermeportella/guilhermeportella.github.io/internal/transport/http"
)

// The publication gate and the runtime must agree on the identity and date
// of an article, even though they have independent frontmatter parsers.
func TestPublicationContract(t *testing.T) {
	for _, tc := range []struct {
		name, metadata, slug, date string
	}{
		{"filename fallback", "publishedAt: 2026-05-04", "arvore", "2026-05-04"},
		{"normalized explicit slug", "publishedAt: '2026-05-04'\nslug: ' Ação__HTTP '", "acao-http", "2026-05-04"},
		{"legacy date", "publishedDate: '2026-04-30T23:30:00-03:00'", "arvore", "2026-04-30T23:30:00-03:00"},
		{"primary date wins", "publishedAt: '2026-05-04'\npublishedDate: '2025-01-01'", "arvore", "2026-05-04"},
		{"empty primary uses legacy", "publishedAt: ''\npublishedDate: '2026-05-04'", "arvore", "2026-05-04"},
		{"empty normalized slug uses filename", "publishedAt: '2026-05-04'\nslug: '!!!'", "arvore", "2026-05-04"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			articles, notes := t.TempDir(), t.TempDir()
			writeTestFile(t, filepath.Join(articles, "2026", "Árvore.MD"), fmt.Sprintf("---\ntitle: Artigo\nsummary: Resumo\nauthor: Autor\n%s\n---\nTexto.\n", tc.metadata))
			writeTestFile(t, filepath.Join(notes, "nota.md"), "---\ntitle: Nota\ndate: '2026-05-04'\n---\nTexto.\n")
			if err := run([]string{"-articles", articles, "-notes", notes}); err != nil {
				t.Fatalf("publication rejected: %v", err)
			}
			items, err := httptransport.ListBlogFeedItems(articles)
			if err != nil {
				t.Fatal(err)
			}
			if len(items) != 1 || items[0].Slug != tc.slug || items[0].PublishedAt != tc.date || items[0].Title != "Artigo" || items[0].Summary != "Resumo" {
				t.Fatalf("published items = %#v, want slug %q and date %q", items, tc.slug, tc.date)
			}
		})
	}
}

func TestPublicationRejectsSlugCollisionAcrossDirectories(t *testing.T) {
	articles, notes := t.TempDir(), t.TempDir()
	writeTestFile(t, filepath.Join(articles, "2025", "Ação.md"), validArticleFrontmatter("Primeiro", ""))
	writeTestFile(t, filepath.Join(articles, "2026", "outro.md"), validArticleFrontmatter("Segundo", "ação"))
	writeTestFile(t, filepath.Join(notes, "nota.md"), "---\ntitle: Nota\ndate: '2026-05-04'\n---\nTexto.\n")
	err := run([]string{"-articles", articles, "-notes", notes})
	if err == nil || !strings.Contains(err.Error(), `article slug "acao" duplicates`) {
		t.Fatalf("publication error = %v, want normalized slug collision", err)
	}
}

func TestPublicationDateBoundaries(t *testing.T) {
	for _, tc := range []struct {
		date  string
		valid bool
	}{
		{"2024-02-29", true}, {"2026-02-29", false},
		{"2026-04-31", false}, {"2026-05-04T23:59:59.123456789-03:00", true},
		{"2026-05-04T12:00:00", false}, {"04/05/2026", false},
	} {
		t.Run(tc.date, func(t *testing.T) {
			article := map[string]any{"title": "Artigo", "summary": "Resumo", "author": "Autor", "publishedAt": tc.date}
			note := map[string]any{"title": "Nota", "date": tc.date}
			for kind, issues := range map[string]lintIssues{
				"article": validateArticle("artigo.md", article, "Texto", make(map[string]string)),
				"note":    validateNote("nota.md", note, "Texto"),
			} {
				if (len(issues) == 0) != tc.valid {
					t.Errorf("%s: issues = %v, valid = %v", kind, issues, tc.valid)
				}
			}
		})
	}
}
