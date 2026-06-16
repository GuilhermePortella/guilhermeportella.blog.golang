package httptransport

import (
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/yuin/goldmark/ast"
)

func TestMarkdownToHTMLSupportsGFMAndControlledHTML(t *testing.T) {
	html := string(markdownToHTML(`
| Campo | Funcao |
| :---- | :----- |
| title | SEO |

<figure class="my-8" style="color:red">
  <img src="./joi.jpg" alt="Joi" class="rounded" width="800" loading="lazy" decoding="async" onerror="alert(1)">
  <figcaption class="text-center">Legenda.</figcaption>
</figure>

<div class="callout info" style="display:block">Observacao.</div>
<script>alert("x")</script>
<iframe src="https://example.com"></iframe>
`))

	for _, expected := range []string{
		"<table>",
		"<th>Campo</th>",
		"<td>SEO</td>",
		"<figure class=\"my-8\">",
		`src="/content/joi.jpg"`,
		`class="rounded"`,
		"<figcaption class=\"text-center\">Legenda.</figcaption>",
		`<div class="callout info">Observacao.</div>`,
	} {
		if !strings.Contains(html, expected) {
			t.Fatalf("HTML does not contain %q:\n%s", expected, html)
		}
	}

	for _, unwanted := range []string{"<script", "<iframe", "style=", "onerror"} {
		if strings.Contains(html, unwanted) {
			t.Fatalf("HTML contains unsafe fragment %q:\n%s", unwanted, html)
		}
	}
}

func TestMarkdownToHTMLStripsUnsafeURLsAndHardensBlankTargets(t *testing.T) {
	html := string(markdownToHTML(`
[link ruim](javascript:alert(1))
![imagem ruim](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+)
<img src="//example.com/tracker.png" alt="tracker">
<a href="https://example.com" target="_blank">externo</a>
<a href="https://example.org" target="_blank" rel="nofollow">rel existente</a>
`))

	for _, unwanted := range []string{"javascript:", "data:image", `src="//example.com/tracker.png"`} {
		if strings.Contains(html, unwanted) {
			t.Fatalf("HTML contains unsafe URL %q:\n%s", unwanted, html)
		}
	}

	for _, expected := range []string{
		`href="https://example.com"`,
		`target="_blank"`,
		`rel="noopener noreferrer"`,
		`rel="nofollow noopener noreferrer"`,
	} {
		if !strings.Contains(html, expected) {
			t.Fatalf("HTML does not contain hardened link fragment %q:\n%s", expected, html)
		}
	}
}

func TestMarkdownToHTMLSupportsKatexAndTwemoji(t *testing.T) {
	html := string(markdownToHTML("A formula e $E = mc^2$ 🙂 e `🙂`.\n\n$$\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n$$\n\n$$a^2 + b^2 = c^2$$"))

	for _, expected := range []string{
		`class="katex"`,
		`class="katex-display"`,
		`a^2 + b^2 = c^2`,
		`src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f642.svg"`,
		"<code>🙂</code>",
	} {
		if !strings.Contains(html, expected) {
			t.Fatalf("HTML does not contain %q:\n%s", expected, html)
		}
	}
}

func TestMarkdownArticleFrontmatterSEOAndJSONLD(t *testing.T) {
	contentDir := t.TempDir()
	filePath := filepath.Join(contentDir, "Artigo-Com-SEO.md")
	raw := `---
title: "Titulo do artigo"
summary: "Resumo curto."
author: "Guilherme Portella"
publishedDate: "2025-12-12"
keywords: "Palavra chave"
seo:
  title: "Titulo SEO"
  description: "Descricao SEO."
  canonicalUrl: "https://example.com/artigo/"
  image: "/images/capa.jpg"
  locale: "pt-BR"
jsonLd:
  "@context": "https://schema.org"
  "@type": "Article"
  headline: "Titulo JSON-LD"
---

## Secao com acento

Texto.
`
	if err := os.WriteFile(filePath, []byte(raw), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	article, err := getMarkdownArticleBySlug(contentDir, "artigo com seo")
	if err != nil {
		t.Fatalf("getMarkdownArticleBySlug() error = %v", err)
	}

	if article.Frontmatter.PublishedAt != "2025-12-12" {
		t.Fatalf("PublishedAt = %q, want 2025-12-12", article.Frontmatter.PublishedAt)
	}
	if article.Frontmatter.SEO.Title != "Titulo SEO" || article.Frontmatter.SEO.Locale != "pt-BR" {
		t.Fatalf("SEO = %#v, want nested SEO fields", article.Frontmatter.SEO)
	}
	if !strings.Contains(string(article.HTML), `id="secao-com-acento"`) {
		t.Fatalf("HTML does not contain normalized heading id:\n%s", article.HTML)
	}

	data, err := newBlogArticlePageData(time.Date(2026, 5, 6, 0, 0, 0, 0, time.UTC), "/blog/artigo-com-seo", contentDir, "artigo-com-seo")
	if err != nil {
		t.Fatalf("newBlogArticlePageData() error = %v", err)
	}

	if data.Title != "Titulo SEO" || data.Description != "Descricao SEO." || data.CanonicalURL != "https://example.com/artigo/" {
		t.Fatalf("metadata = %#v, want SEO overrides", data)
	}
	if data.Keywords != "Palavra chave" {
		t.Fatalf("Keywords = %q, want Palavra chave", data.Keywords)
	}
	if !strings.Contains(string(data.Article.JSONLD), `"headline":"Titulo JSON-LD"`) {
		t.Fatalf("JSONLD = %s, want frontmatter JSON-LD", data.Article.JSONLD)
	}
}

func TestMarkdownArticleMalformedFrontmatterReturnsError(t *testing.T) {
	contentDir := t.TempDir()
	filePath := filepath.Join(contentDir, "quebrado.md")
	raw := `---
title: "Titulo sem fechar
---

Texto.
`
	if err := os.WriteFile(filePath, []byte(raw), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	_, err := getMarkdownArticleBySlug(contentDir, "quebrado")
	if err == nil {
		t.Fatal("getMarkdownArticleBySlug() error = nil, want error")
	}

	for _, expected := range []string{"parse markdown frontmatter", filePath, "decode YAML"} {
		if !strings.Contains(err.Error(), expected) {
			t.Fatalf("error = %q, want it to contain %q", err.Error(), expected)
		}
	}
}

func TestMarkdownArticleIgnoresSymlinkedFiles(t *testing.T) {
	contentDir := t.TempDir()
	outsideDir := t.TempDir()
	outsideArticle := filepath.Join(outsideDir, "vazamento.md")
	linkedArticle := filepath.Join(contentDir, "vazamento.md")

	if err := os.WriteFile(outsideArticle, []byte("---\ntitle: Vazamento\n---\n\nsegredo"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outsideArticle, linkedArticle); err != nil {
		t.Skipf("symlinks are not available: %v", err)
	}

	_, err := getMarkdownArticleBySlug(contentDir, "vazamento")
	if !errors.Is(err, errMarkdownArticleNotFound) {
		t.Fatalf("getMarkdownArticleBySlug(symlink) error = %v, want not found", err)
	}
}

func TestFrontmatterValueHelpers(t *testing.T) {
	dateOnly := time.Date(2026, 5, 4, 0, 0, 0, 0, time.UTC)
	dateTime := time.Date(2026, 5, 4, 18, 20, 30, 0, time.FixedZone("BRT", -3*60*60))

	if got := stringFromAny(dateOnly); got != "2026-05-04" {
		t.Fatalf("stringFromAny(dateOnly) = %q, want 2026-05-04", got)
	}
	if got := stringFromAny(dateTime); got != "2026-05-04T18:20:30-03:00" {
		t.Fatalf("stringFromAny(dateTime) = %q, want RFC3339 date", got)
	}

	data := map[string]any{
		"tags":     []any{" Go ", "", 42},
		"keywords": " arquitetura ",
		"clean":    []string{" backend ", "", "Go"},
	}

	if got, want := stringSliceFromFrontmatter(data, "tags"), []string{"Go", "42"}; !slices.Equal(got, want) {
		t.Fatalf("tags = %#v, want %#v", got, want)
	}
	if got, want := stringSliceFromFrontmatter(data, "keywords"), []string{"arquitetura"}; !slices.Equal(got, want) {
		t.Fatalf("keywords = %#v, want %#v", got, want)
	}
	if got, want := stringSliceFromFrontmatter(data, "clean"), []string{"backend", "Go"}; !slices.Equal(got, want) {
		t.Fatalf("clean = %#v, want %#v", got, want)
	}

	maps := map[string]any{
		"seo":        map[string]string{"title": "Titulo SEO"},
		"jsonLd":     map[string]any{"@type": "Article"},
		"notAMap":    "texto",
		"emptyValue": nil,
	}
	if got := mapFromFrontmatter(maps, "seo"); got["title"] != "Titulo SEO" {
		t.Fatalf("mapFromFrontmatter(seo) = %#v, want converted map[string]string", got)
	}
	if got := mapFromFrontmatter(maps, "jsonLd"); got["@type"] != "Article" {
		t.Fatalf("mapFromFrontmatter(jsonLd) = %#v, want map[string]any", got)
	}
	for _, key := range []string{"notAMap", "emptyValue", "missing"} {
		if got := mapFromFrontmatter(maps, key); got != nil {
			t.Fatalf("mapFromFrontmatter(%s) = %#v, want nil", key, got)
		}
	}

	normalized := normalizeYAMLValue(map[any]any{
		"nested": map[any]any{"title": "Titulo"},
		"list":   []any{map[any]any{"name": "Go"}},
	})
	root, ok := normalized.(map[string]any)
	if !ok {
		t.Fatalf("normalizeYAMLValue() = %T, want map[string]any", normalized)
	}
	if nested, ok := root["nested"].(map[string]any); !ok || nested["title"] != "Titulo" {
		t.Fatalf("normalized nested map = %#v, want string-keyed map", root["nested"])
	}
	list, ok := root["list"].([]any)
	if !ok || len(list) != 1 {
		t.Fatalf("normalized list = %#v, want one item", root["list"])
	}
	if item, ok := list[0].(map[string]any); !ok || item["name"] != "Go" {
		t.Fatalf("normalized list item = %#v, want string-keyed map", list[0])
	}
}

func TestNormalizeSlug(t *testing.T) {
	tests := []struct {
		raw  string
		want string
	}{
		{raw: " Olá, mundo_em Go! ", want: "ola-mundo-em-go"},
		{raw: "Café com açúcar", want: "cafe-com-acucar"},
		{raw: "---", want: ""},
	}

	for _, test := range tests {
		t.Run(test.raw, func(t *testing.T) {
			if got := normalizeSlug(test.raw); got != test.want {
				t.Fatalf("normalizeSlug(%q) = %q, want %q", test.raw, got, test.want)
			}
		})
	}
}

func TestMarkdownIDsGenerateStableFallbacksAndDuplicates(t *testing.T) {
	ids := newMarkdownIDs()

	tests := []struct {
		name string
		raw  string
		kind ast.NodeKind
		want string
	}{
		{name: "normalized markdown text", raw: "Olá **Mundo**", kind: ast.KindHeading, want: "ola-mundo"},
		{name: "duplicate normalized text", raw: "Olá mundo", kind: ast.KindHeading, want: "ola-mundo-1"},
		{name: "empty heading", raw: "!!!", kind: ast.KindHeading, want: "heading"},
		{name: "empty non heading", raw: "???", kind: ast.KindParagraph, want: "id"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := string(ids.Generate([]byte(test.raw), test.kind)); got != test.want {
				t.Fatalf("Generate(%q) = %q, want %q", test.raw, got, test.want)
			}
		})
	}

	ids.Put([]byte("reserved"))
	if got := string(ids.Generate([]byte("reserved"), ast.KindHeading)); got != "reserved-1" {
		t.Fatalf("Generate(reserved) = %q, want reserved-1", got)
	}
}

func TestEmojiSequenceEndRecognizesKeycapRegionalAndIncompleteZWJ(t *testing.T) {
	tests := []struct {
		name     string
		text     string
		sequence string
	}{
		{name: "keycap", text: "A 1️⃣ ok", sequence: "1️⃣"},
		{name: "regional indicator pair", text: "A 🇧🇷 ok", sequence: "🇧🇷"},
		{name: "emoji with modifier", text: "A 👍🏽 ok", sequence: "👍🏽"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			start := strings.Index(test.text, test.sequence)
			if start < 0 {
				t.Fatalf("test text %q does not contain sequence %q", test.text, test.sequence)
			}
			if got := test.text[start:emojiSequenceEnd(test.text, start)]; got != test.sequence {
				t.Fatalf("emojiSequenceEnd() captured %q, want %q", got, test.sequence)
			}
		})
	}

	incomplete := "👨‍ texto"
	if got := incomplete[:emojiSequenceEnd(incomplete, 0)]; got != "👨" {
		t.Fatalf("emojiSequenceEnd(incomplete ZWJ) captured %q, want 👨", got)
	}
	if got := emojiSequenceEnd("texto", 0); got != 0 {
		t.Fatalf("emojiSequenceEnd(non emoji) = %d, want 0", got)
	}
}

func TestIsEmojiStarterCoversSupportedRanges(t *testing.T) {
	for _, value := range []rune{
		0x1f642,
		0x2600,
		0x231a,
		0x2b50,
		0x2194,
		0x2934,
		0x25aa,
		0x00a9,
	} {
		if !isEmojiStarter(value) {
			t.Fatalf("isEmojiStarter(%U) = false, want true", value)
		}
	}

	if isEmojiStarter('A') {
		t.Fatal("isEmojiStarter('A') = true, want false")
	}
}

func TestRewriteMarkdownAssetURL(t *testing.T) {
	tests := []struct {
		raw  string
		want string
	}{
		{raw: "./img/capa.jpg", want: "/content/img/capa.jpg"},
		{raw: "../img/capa.jpg", want: "/content/img/capa.jpg"},
		{raw: "content/img/capa.jpg", want: "/content/img/capa.jpg"},
		{raw: "/static/img/capa.jpg", want: "/static/img/capa.jpg"},
		{raw: "https://example.com/capa.jpg", want: "https://example.com/capa.jpg"},
		{raw: "mailto:guilherme@example.com", want: "mailto:guilherme@example.com"},
		{raw: "data:image/svg+xml;base64,abc", want: ""},
		{raw: "javascript:alert(1)", want: ""},
		{raw: "//example.com/capa.jpg", want: ""},
	}

	for _, test := range tests {
		t.Run(test.raw, func(t *testing.T) {
			if got := rewriteMarkdownAssetURL(test.raw); got != test.want {
				t.Fatalf("rewriteMarkdownAssetURL(%q) = %q, want %q", test.raw, got, test.want)
			}
		})
	}
}

func TestRewriteSrcset(t *testing.T) {
	raw := " ./cover.jpg 1x, ../cover@2x.jpg 2x, content/thumb.jpg 640w, /static/capa.jpg 1280w, https://cdn.example.com/capa.jpg 2x, javascript:alert(1) 3x "
	want := "/content/cover.jpg 1x, /content/cover@2x.jpg 2x, /content/thumb.jpg 640w, /static/capa.jpg 1280w, https://cdn.example.com/capa.jpg 2x"

	if got := rewriteSrcset(raw); got != want {
		t.Fatalf("rewriteSrcset() = %q, want %q", got, want)
	}
}
