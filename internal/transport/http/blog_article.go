package httptransport

import (
	"encoding/json"
	"errors"
	"html/template"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"
)

type blogArticlePageData struct {
	Title          string
	Description    string
	CanonicalURL   string
	OpenGraphImage string
	TwitterCard    string
	SiteName       string
	CurrentYear    int

	Navigation []siteNavLink
	Article    blogArticleFull
}

type blogArticleFull struct {
	Slug           string
	Title          string
	Summary        string
	Author         string
	PublishedAt    string
	DateLabel      string
	DateAttr       string
	Tags           []string
	Keywords       []string
	HTML           template.HTML
	ReadingMinutes int
	JSONLD         template.JS
}

func blogArticleHandler(renderer *Renderer, logger *slog.Logger, contentDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data, err := newBlogArticlePageData(time.Now(), r.URL.Path, contentDir, r.PathValue("slug"))
		if err != nil {
			if errors.Is(err, errMarkdownArticleNotFound) {
				http.NotFound(w, r)
				return
			}
			logger.Error("load blog article", "error", err, "request_id", getRequestID(r.Context()))
			http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
			return
		}

		if err := renderer.Render(w, "blog_article", data); err != nil {
			logger.Error("render blog article", "error", err, "request_id", getRequestID(r.Context()))
			http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		}
	}
}

func newBlogArticlePageData(now time.Time, currentPath string, contentDir string, slug string) (blogArticlePageData, error) {
	article, err := getMarkdownArticleBySlug(contentDir, slug)
	if err != nil {
		return blogArticlePageData{}, err
	}

	fm := article.Frontmatter
	title := fallbackString(fm.SEO.Title, fm.Title)
	description := fallbackString(fm.SEO.Description, fallbackString(fm.Summary, "Texto do blog."))
	canonicalURL := fallbackString(fm.SEO.CanonicalURL, "https://guilhermeportella.github.io/blog/"+article.Slug)
	parsed, hasDate := parseBlogDate(fm.PublishedAt)
	dateLabel := "Sem data"
	dateAttr := ""
	if hasDate {
		dateLabel = formatBlogDateLabel(parsed.Date, parsed.DateOnly)
		dateAttr = parsed.Attr
	}

	full := blogArticleFull{
		Slug:           article.Slug,
		Title:          fm.Title,
		Summary:        fm.Summary,
		Author:         fallbackString(fm.Author, "Guilherme Portella"),
		PublishedAt:    fm.PublishedAt,
		DateLabel:      dateLabel,
		DateAttr:       dateAttr,
		Tags:           fm.Tags,
		Keywords:       fm.Keywords,
		HTML:           article.HTML,
		ReadingMinutes: readingTimeFromHTML(article.HTML),
	}
	full.JSONLD = buildArticleJSONLD(full, description, canonicalURL, fm.SEO.Image)

	return blogArticlePageData{
		Title:          title,
		Description:    description,
		CanonicalURL:   canonicalURL,
		OpenGraphImage: fm.SEO.Image,
		TwitterCard:    "summary_large_image",
		SiteName:       "Guilherme Portella",
		CurrentYear:    now.Year(),
		Navigation:     newSiteNavigation(currentPath),
		Article:        full,
	}, nil
}

func readingTimeFromHTML(value template.HTML) int {
	text := regexp.MustCompile("<[^>]+>").ReplaceAllString(string(value), " ")
	text = regexp.MustCompile("\\s+").ReplaceAllString(strings.TrimSpace(text), " ")
	if text == "" {
		return 1
	}

	words := len(strings.Fields(text))
	minutes := (words + 100) / 200
	if minutes < 1 {
		return 1
	}
	return minutes
}

func buildArticleJSONLD(article blogArticleFull, description string, canonicalURL string, image string) template.JS {
	data := map[string]any{
		"@context":         "https://schema.org",
		"@type":            "Article",
		"headline":         article.Title,
		"description":      description,
		"mainEntityOfPage": canonicalURL,
		"author": map[string]string{
			"@type": "Person",
			"name":  article.Author,
		},
		"publisher": map[string]string{
			"@type": "Organization",
			"name":  "Guilherme Portella",
		},
	}

	if article.DateAttr != "" {
		data["datePublished"] = article.DateAttr
		data["dateModified"] = article.DateAttr
	}
	if image != "" {
		data["image"] = image
	}

	raw, err := json.Marshal(data)
	if err != nil {
		return ""
	}

	return template.JS(raw)
}
