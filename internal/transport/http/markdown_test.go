package httptransport

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
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
