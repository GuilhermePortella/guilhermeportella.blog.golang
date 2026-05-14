package httptransport

import (
	"encoding/json"
	"html/template"
	"strings"
	"testing"
)

func TestReadingTimeFromHTML(t *testing.T) {
	tests := []struct {
		name string
		html template.HTML
		want int
	}{
		{name: "empty", html: "", want: 1},
		{name: "strips tags", html: "<p>uma duas</p><strong>tres</strong>", want: 1},
		{name: "rounds up around two hundred words", html: template.HTML(strings.Repeat("palavra ", 301)), want: 2},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := readingTimeFromHTML(test.html); got != test.want {
				t.Fatalf("readingTimeFromHTML() = %d, want %d", got, test.want)
			}
		})
	}
}

func TestBuildArticleJSONLDDefault(t *testing.T) {
	article := blogArticleFull{
		Title:    "Titulo do artigo",
		Author:   "Guilherme",
		DateAttr: "2026-05-04",
	}

	raw := buildArticleJSONLD(article, "Descricao curta.", "https://example.com/blog/artigo", "/img/capa.jpg", nil)
	var got map[string]any
	if err := json.Unmarshal([]byte(raw), &got); err != nil {
		t.Fatalf("json.Unmarshal(JSONLD) error = %v: %s", err, raw)
	}

	for key, want := range map[string]string{
		"@context":         "https://schema.org",
		"@type":            "Article",
		"headline":         "Titulo do artigo",
		"description":      "Descricao curta.",
		"mainEntityOfPage": "https://example.com/blog/artigo",
		"datePublished":    "2026-05-04",
		"dateModified":     "2026-05-04",
		"image":            "/img/capa.jpg",
	} {
		if got[key] != want {
			t.Fatalf("JSONLD[%s] = %#v, want %q", key, got[key], want)
		}
	}
}

func TestBuildArticleJSONLDReturnsEmptyForInvalidFrontmatterJSONLD(t *testing.T) {
	raw := buildArticleJSONLD(blogArticleFull{}, "", "", "", map[string]any{"bad": make(chan int)})
	if raw != "" {
		t.Fatalf("buildArticleJSONLD(invalid frontmatter) = %q, want empty", raw)
	}
}
