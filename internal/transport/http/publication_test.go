package httptransport

import (
	"fmt"
	"html/template"
	"reflect"
	"strings"
	"testing"
)

func TestArticleOrderingPreservesTiesAndInput(t *testing.T) {
	input := []blogArticle{
		{Slug: "older", PublishedAt: "2026-04-30T23:00:00Z"},
		{Slug: "first", PublishedAt: "2026-04-30T23:30:00-03:00"},
		{Slug: "second", PublishedAt: "2026-05-01T02:30:00Z"},
	}
	before := append([]blogArticle(nil), input...)
	got := prepareBlogArticles(input)
	for i, slug := range []string{"first", "second", "older"} {
		if got[i].Slug != slug {
			t.Errorf("position %d = %q, want %q", i, got[i].Slug, slug)
		}
	}
	if !reflect.DeepEqual(input, before) {
		t.Fatal("preparing the archive changed its source articles")
	}
}

func TestNoteTagCountsPreserveDistinctTagsAndFallback(t *testing.T) {
	got := noteTagStats([]noteItem{{Tag: "go"}, {Tag: "Go"}, {Tag: "Go"}, {}, {Tag: "nota"}, {Tag: "Backend"}})
	want := []noteTagStat{{Tag: "Backend", Count: 1}, {Tag: "Go", Count: 2}, {Tag: "go", Count: 1}, {Tag: "nota", Count: 2}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("tag filters = %#v, want %#v", got, want)
	}
}

func TestReadingTimeBoundaries(t *testing.T) {
	// The current contract rounds to the nearest minute at 200 words/minute,
	// with a minimum of one minute (it does not always round up).
	for _, tc := range []struct{ words, minutes int }{
		{0, 1}, {199, 1}, {200, 1}, {201, 1}, {299, 1}, {300, 2}, {499, 2}, {500, 3},
	} {
		t.Run(fmt.Sprint(tc.words), func(t *testing.T) {
			body := template.HTML("<p>" + strings.Repeat("palavra\n", tc.words) + "</p>")
			if got := readingTimeFromHTML(body); got != tc.minutes {
				t.Fatalf("reading time = %d, want %d", got, tc.minutes)
			}
		})
	}
}

func TestPublicationLoadersRejectMalformedContent(t *testing.T) {
	dir := t.TempDir()
	writeTestBlogArticle(t, dir, "valid.md", "---\ntitle: Valido\npublishedAt: '2026-05-04'\n---\nTexto.")
	writeTestBlogArticle(t, dir, "broken.md", "---\ntitle: [broken\n---\nTexto.")
	if items, err := loadBlogArticles(dir); err == nil || len(items) != 0 {
		t.Fatalf("archive returned partial content: %#v, %v", items, err)
	}
	if items, err := ListBlogFeedItems(dir); err == nil || len(items) != 0 {
		t.Fatalf("feed returned partial content: %#v, %v", items, err)
	}
	if items, err := loadNotes(dir); err == nil || len(items) != 0 {
		t.Fatalf("notes returned partial content: %#v, %v", items, err)
	}
}
