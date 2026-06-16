package httptransport

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestParseBlogDate(t *testing.T) {
	tests := []struct {
		name     string
		raw      string
		wantDate time.Time
		wantAttr string
		dateOnly bool
		ok       bool
	}{
		{
			name:     "date only",
			raw:      " 2026-05-04 ",
			wantDate: time.Date(2026, 5, 4, 0, 0, 0, 0, time.UTC),
			wantAttr: "2026-05-04",
			dateOnly: true,
			ok:       true,
		},
		{
			name:     "rfc3339",
			raw:      "2026-05-04T18:20:30-03:00",
			wantDate: mustParseTime(t, time.RFC3339, "2026-05-04T18:20:30-03:00"),
			wantAttr: "2026-05-04T18:20:30-03:00",
			ok:       true,
		},
		{
			name:     "rfc3339 nano keeps precision",
			raw:      "2026-05-04T18:20:30.123456789-03:00",
			wantDate: mustParseTime(t, time.RFC3339Nano, "2026-05-04T18:20:30.123456789-03:00"),
			wantAttr: "2026-05-04T18:20:30.123456789-03:00",
			ok:       true,
		},
		{name: "blank", raw: " ", ok: false},
		{name: "invalid", raw: "maio de 2026", ok: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, ok := parseBlogDate(test.raw)
			if ok != test.ok {
				t.Fatalf("ok = %v, want %v", ok, test.ok)
			}
			if !test.ok {
				return
			}
			if !got.Date.Equal(test.wantDate) {
				t.Fatalf("Date = %s, want %s", got.Date, test.wantDate)
			}
			if got.Attr != test.wantAttr {
				t.Fatalf("Attr = %q, want %q", got.Attr, test.wantAttr)
			}
			if got.DateOnly != test.dateOnly {
				t.Fatalf("DateOnly = %v, want %v", got.DateOnly, test.dateOnly)
			}
		})
	}
}

func TestBlogSortTimeUsesEpochForInvalidDate(t *testing.T) {
	got := blogSortTime("sem data")
	want := time.Unix(0, 0).UTC()
	if !got.Equal(want) {
		t.Fatalf("blogSortTime(invalid) = %s, want %s", got, want)
	}
}

func TestPrepareBlogArticlesSortsAndBuildsSearchText(t *testing.T) {
	articles := prepareBlogArticles([]blogArticle{
		{
			Title:       "Artigo sem data",
			Summary:     "Resumo solto",
			PublishedAt: "sem data",
			Content:     "Conteudo antigo",
		},
		{
			Title:       "Artigo recente",
			Summary:     "Resumo novo",
			PublishedAt: "2026-05-04T18:20:30-03:00",
			Content:     "Conteudo novo",
		},
		{
			Title:       "Artigo antigo",
			Summary:     "Resumo antigo",
			PublishedAt: "2026-04-02",
			Content:     "Conteudo antigo",
		},
	})

	if got := articles[0].Title; got != "Artigo recente" {
		t.Fatalf("articles[0].Title = %q, want Artigo recente", got)
	}
	if got := articles[0].DateLabel; got != "4 de maio de 2026" {
		t.Fatalf("articles[0].DateLabel = %q, want formatted date", got)
	}
	if got := articles[2].DateLabel; got != "Sem data" {
		t.Fatalf("articles[2].DateLabel = %q, want Sem data", got)
	}
	if got := articles[0].SearchText; got != "Artigo recente Resumo novo Conteudo novo" {
		t.Fatalf("articles[0].SearchText = %q, want joined searchable text", got)
	}
}

func TestGroupBlogArticlesByMonthHandlesDateOnlyTimezoneAndInvalidDates(t *testing.T) {
	groups := groupBlogArticlesByMonth([]blogArticle{
		{Title: "Maio", PublishedAt: "2026-05-04"},
		{Title: "Abril tarde", PublishedAt: "2026-04-30T23:30:00-03:00"},
		{Title: "Abril cedo", PublishedAt: "2026-04-02"},
		{Title: "Sem data", PublishedAt: "nao parseia"},
	})

	if len(groups) != 3 {
		t.Fatalf("len(groups) = %d, want 3", len(groups))
	}

	want := []struct {
		id         string
		label      string
		monthLabel string
		count      int
	}{
		{id: "2026-05", label: "2026 - Maio", monthLabel: "Maio", count: 1},
		{id: "2026-04", label: "2026 - Abril", monthLabel: "Abril", count: 2},
		{id: "1970-01", label: "1970 - Janeiro", monthLabel: "Janeiro", count: 1},
	}

	for index, expected := range want {
		group := groups[index]
		if group.ID != expected.id || group.Label != expected.label || group.MonthLabel != expected.monthLabel {
			t.Fatalf("groups[%d] = %#v, want id=%q label=%q monthLabel=%q", index, group, expected.id, expected.label, expected.monthLabel)
		}
		if len(group.Items) != expected.count {
			t.Fatalf("len(groups[%d].Items) = %d, want %d", index, len(group.Items), expected.count)
		}
	}
}

func TestBlogYearsReturnsUniqueDescendingYears(t *testing.T) {
	groups := []blogArticleGroup{
		{Key: blogGroupKey{Year: 2025, Month: 12}},
		{Key: blogGroupKey{Year: 2026, Month: 1}},
		{Key: blogGroupKey{Year: 2025, Month: 1}},
		{Key: blogGroupKey{Year: 2027, Month: 3}},
	}

	years := blogYears(groups)
	want := []int{2027, 2026, 2025}
	if len(years) != len(want) {
		t.Fatalf("len(years) = %d, want %d (%v)", len(years), len(want), years)
	}
	for index := range want {
		if years[index] != want[index] {
			t.Fatalf("years = %v, want %v", years, want)
		}
	}
}

func TestListBlogFeedItemsSortsAndProjectsMarkdownArticles(t *testing.T) {
	contentDir := t.TempDir()
	writeTestBlogArticle(t, contentDir, "antigo.md", `---
title: "Artigo antigo"
summary: "Resumo antigo"
publishedAt: "2026-04-02"
tags: ["Go", "HTTP"]
slug: "artigo antigo"
---

# Titulo

Texto **antigo**.
`)
	writeTestBlogArticle(t, contentDir, "recente.md", `---
title: "Artigo recente"
summary: "Resumo recente"
publishedAt: "2026-05-04"
tags:
  - Segurança
---

Texto recente.
`)

	items, err := ListBlogFeedItems(contentDir)
	if err != nil {
		t.Fatalf("ListBlogFeedItems() error = %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("len(items) = %d, want 2", len(items))
	}
	if items[0].Title != "Artigo recente" || items[0].Slug != "recente" {
		t.Fatalf("items[0] = %#v, want recent article projected from file slug", items[0])
	}
	if items[1].Title != "Artigo antigo" || items[1].Slug != "artigo-antigo" {
		t.Fatalf("items[1] = %#v, want old article projected from frontmatter slug", items[1])
	}
	if got := items[1].Tags; len(got) != 2 || got[0] != "Go" || got[1] != "HTTP" {
		t.Fatalf("items[1].Tags = %v, want [Go HTTP]", got)
	}
}

func TestMonthNamePTBRRejectsInvalidMonth(t *testing.T) {
	if got := monthNamePTBR(0); got != "" {
		t.Fatalf("monthNamePTBR(0) = %q, want empty", got)
	}
	if got := monthTitlePTBR(13); got != "" {
		t.Fatalf("monthTitlePTBR(13) = %q, want empty", got)
	}
}

func mustParseTime(t *testing.T, layout string, value string) time.Time {
	t.Helper()

	parsed, err := time.Parse(layout, value)
	if err != nil {
		t.Fatalf("time.Parse(%q, %q) error = %v", layout, value, err)
	}
	return parsed
}

func writeTestBlogArticle(t *testing.T, dir string, name string, content string) {
	t.Helper()

	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
		t.Fatalf("WriteFile(%q) error = %v", name, err)
	}
}
