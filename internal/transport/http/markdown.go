package httptransport

import (
	"errors"
	"fmt"
	"html"
	"html/template"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"unicode"
)

var errMarkdownArticleNotFound = errors.New("markdown article not found")

type articleFrontmatter struct {
	Title       string
	Summary     string
	Author      string
	PublishedAt string
	Tags        []string
	Keywords    []string
	Slug        string
	SEO         articleSEO
}

type articleSEO struct {
	Title        string
	Description  string
	CanonicalURL string
	Image        string
}

type markdownArticle struct {
	Slug        string
	Frontmatter articleFrontmatter
	Content     string
	HTML        template.HTML
	SourcePath  string
}

func getAllMarkdownArticles(contentDir string) ([]markdownArticle, error) {
	files, err := listMarkdownFiles(contentDir)
	if err != nil {
		return nil, err
	}

	articles := make([]markdownArticle, 0, len(files))
	for _, filePath := range files {
		article, err := readMarkdownArticle(filePath)
		if err != nil {
			return nil, err
		}
		articles = append(articles, article)
	}

	return articles, nil
}

func getMarkdownArticleBySlug(contentDir string, slug string) (markdownArticle, error) {
	files, err := listMarkdownFiles(contentDir)
	if err != nil {
		return markdownArticle{}, err
	}

	wanted := normalizeSlug(slug)
	if wanted == "" {
		return markdownArticle{}, errMarkdownArticleNotFound
	}

	for _, filePath := range files {
		baseSlug := normalizeSlug(fileBase(filepath.Base(filePath)))
		if baseSlug != wanted {
			continue
		}

		return readMarkdownArticle(filePath)
	}

	for _, filePath := range files {
		article, err := readMarkdownArticle(filePath)
		if err != nil {
			return markdownArticle{}, err
		}
		if article.Frontmatter.Slug != "" && normalizeSlug(article.Frontmatter.Slug) == wanted {
			return article, nil
		}
	}

	return markdownArticle{}, errMarkdownArticleNotFound
}

func listMarkdownFiles(dir string) ([]string, error) {
	var files []string

	err := filepath.WalkDir(dir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		if entry.Type().IsRegular() && strings.EqualFold(filepath.Ext(entry.Name()), ".md") {
			files = append(files, path)
		}
		return nil
	})
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("walk markdown dir %q: %w", dir, err)
	}

	slices.Sort(files)
	return files, nil
}

func readMarkdownArticle(filePath string) (markdownArticle, error) {
	raw, err := os.ReadFile(filePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return markdownArticle{}, errMarkdownArticleNotFound
		}
		return markdownArticle{}, fmt.Errorf("read markdown article %q: %w", filePath, err)
	}

	frontmatterRaw, content := splitFrontmatter(string(raw))
	fm := normalizeArticleFrontmatter(parseFrontmatter(frontmatterRaw))
	slug := normalizeSlug(fm.Slug)
	if slug == "" {
		slug = normalizeSlug(fileBase(filepath.Base(filePath)))
	}

	htmlContent := markdownToHTML(content)

	return markdownArticle{
		Slug:        slug,
		Frontmatter: fm,
		Content:     content,
		HTML:        htmlContent,
		SourcePath:  filePath,
	}, nil
}

func splitFrontmatter(raw string) (frontmatter string, content string) {
	raw = strings.ReplaceAll(raw, "\r\n", "\n")
	if !strings.HasPrefix(raw, "---\n") {
		return "", raw
	}

	rest := strings.TrimPrefix(raw, "---\n")
	index := strings.Index(rest, "\n---\n")
	if index < 0 {
		return "", raw
	}

	return rest[:index], rest[index+len("\n---\n"):]
}

func parseFrontmatter(raw string) map[string]any {
	out := make(map[string]any)
	var currentKey string

	for _, line := range strings.Split(raw, "\n") {
		if strings.TrimSpace(line) == "" || strings.HasPrefix(strings.TrimSpace(line), "#") {
			continue
		}

		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "- ") && currentKey != "" {
			out[currentKey] = appendStringValue(out[currentKey], strings.TrimSpace(strings.TrimPrefix(trimmed, "- ")))
			continue
		}

		if strings.HasPrefix(line, " ") && currentKey == "seo" {
			key, value, ok := strings.Cut(trimmed, ":")
			if !ok {
				continue
			}
			seoMap, _ := out["seo"].(map[string]string)
			if seoMap == nil {
				seoMap = make(map[string]string)
			}
			seoMap[strings.TrimSpace(key)] = cleanFrontmatterScalar(value)
			out["seo"] = seoMap
			continue
		}

		key, value, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}

		currentKey = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if value == "" {
			if currentKey == "seo" {
				out[currentKey] = map[string]string{}
			}
			continue
		}

		if strings.HasPrefix(value, "[") && strings.HasSuffix(value, "]") {
			out[currentKey] = parseInlineList(value)
			continue
		}

		out[currentKey] = cleanFrontmatterScalar(value)
	}

	return out
}

func appendStringValue(existing any, value string) []string {
	value = cleanFrontmatterScalar(value)
	if current, ok := existing.([]string); ok {
		return append(current, value)
	}
	return []string{value}
}

func parseInlineList(raw string) []string {
	raw = strings.TrimPrefix(strings.TrimSuffix(raw, "]"), "[")
	if strings.TrimSpace(raw) == "" {
		return nil
	}

	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		out = append(out, cleanFrontmatterScalar(part))
	}
	return out
}

func cleanFrontmatterScalar(raw string) string {
	raw = strings.TrimSpace(raw)
	raw = strings.Trim(raw, `"'`)
	return raw
}

func normalizeArticleFrontmatter(data map[string]any) articleFrontmatter {
	published := stringFromFrontmatter(data, "publishedAt")
	if published == "" {
		published = stringFromFrontmatter(data, "publishedDate")
	}

	return articleFrontmatter{
		Title:       fallbackString(stringFromFrontmatter(data, "title"), "Sem título"),
		Summary:     stringFromFrontmatter(data, "summary"),
		Author:      stringFromFrontmatter(data, "author"),
		PublishedAt: published,
		Tags:        stringSliceFromFrontmatter(data, "tags"),
		Keywords:    stringSliceFromFrontmatter(data, "keywords"),
		Slug:        normalizeSlug(stringFromFrontmatter(data, "slug")),
		SEO:         seoFromFrontmatter(data),
	}
}

func stringFromFrontmatter(data map[string]any, key string) string {
	value, ok := data[key]
	if !ok || value == nil {
		return ""
	}
	if text, ok := value.(string); ok {
		return text
	}
	return fmt.Sprint(value)
}

func stringSliceFromFrontmatter(data map[string]any, key string) []string {
	value, ok := data[key]
	if !ok || value == nil {
		return nil
	}

	switch typed := value.(type) {
	case []string:
		return typed
	case string:
		if typed == "" {
			return nil
		}
		return []string{typed}
	default:
		return []string{fmt.Sprint(typed)}
	}
}

func seoFromFrontmatter(data map[string]any) articleSEO {
	seoMap, _ := data["seo"].(map[string]string)
	if seoMap == nil {
		return articleSEO{}
	}

	return articleSEO{
		Title:        seoMap["title"],
		Description:  seoMap["description"],
		CanonicalURL: seoMap["canonicalUrl"],
		Image:        seoMap["image"],
	}
}

func fallbackString(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func fileBase(name string) string {
	return strings.TrimSuffix(name, filepath.Ext(name))
}

func normalizeSlug(input string) string {
	input = strings.TrimSpace(strings.ToLower(input))
	var builder strings.Builder
	lastDash := false

	for _, r := range input {
		r = foldSlugRune(r)
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
			builder.WriteRune(r)
			lastDash = false
			continue
		}

		if unicode.IsSpace(r) || r == '_' || r == '-' {
			if !lastDash && builder.Len() > 0 {
				builder.WriteByte('-')
				lastDash = true
			}
		}
	}

	return strings.Trim(builder.String(), "-")
}

func foldSlugRune(r rune) rune {
	switch r {
	case 'á', 'à', 'ã', 'â', 'ä':
		return 'a'
	case 'é', 'è', 'ê', 'ë':
		return 'e'
	case 'í', 'ì', 'î', 'ï':
		return 'i'
	case 'ó', 'ò', 'õ', 'ô', 'ö':
		return 'o'
	case 'ú', 'ù', 'û', 'ü':
		return 'u'
	case 'ç':
		return 'c'
	case 'ñ':
		return 'n'
	default:
		return r
	}
}

func markdownToHTML(md string) template.HTML {
	lines := strings.Split(strings.ReplaceAll(md, "\r\n", "\n"), "\n")
	var out strings.Builder
	var paragraph []string
	var listItems []string
	inCode := false
	var codeLines []string

	flushParagraph := func() {
		if len(paragraph) == 0 {
			return
		}
		text := strings.Join(paragraph, " ")
		out.WriteString("<p>")
		out.WriteString(renderInlineMarkdown(text))
		out.WriteString("</p>\n")
		paragraph = nil
	}

	flushList := func() {
		if len(listItems) == 0 {
			return
		}
		out.WriteString("<ul>\n")
		for _, item := range listItems {
			out.WriteString("<li>")
			out.WriteString(renderInlineMarkdown(item))
			out.WriteString("</li>\n")
		}
		out.WriteString("</ul>\n")
		listItems = nil
	}

	flushCode := func() {
		out.WriteString("<pre><code>")
		out.WriteString(html.EscapeString(strings.Join(codeLines, "\n")))
		out.WriteString("</code></pre>\n")
		codeLines = nil
	}

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "```") {
			if inCode {
				flushCode()
				inCode = false
			} else {
				flushParagraph()
				flushList()
				inCode = true
			}
			continue
		}

		if inCode {
			codeLines = append(codeLines, line)
			continue
		}

		if trimmed == "" {
			flushParagraph()
			flushList()
			continue
		}

		if headingLevel, headingText, ok := parseHeading(trimmed); ok {
			flushParagraph()
			flushList()
			id := normalizeSlug(stripInlineMarkdown(headingText))
			out.WriteString(fmt.Sprintf("<h%d id=\"%s\">%s</h%d>\n", headingLevel, html.EscapeString(id), renderInlineMarkdown(headingText), headingLevel))
			continue
		}

		if strings.HasPrefix(trimmed, "- ") || strings.HasPrefix(trimmed, "* ") {
			flushParagraph()
			listItems = append(listItems, strings.TrimSpace(trimmed[2:]))
			continue
		}

		if strings.HasPrefix(trimmed, ">") {
			flushParagraph()
			flushList()
			quote := strings.TrimSpace(strings.TrimPrefix(trimmed, ">"))
			out.WriteString("<blockquote><p>")
			out.WriteString(renderInlineMarkdown(quote))
			out.WriteString("</p></blockquote>\n")
			continue
		}

		if trimmed == "---" || trimmed == "***" {
			flushParagraph()
			flushList()
			out.WriteString("<hr>\n")
			continue
		}

		paragraph = append(paragraph, trimmed)
	}

	if inCode {
		flushCode()
	}
	flushParagraph()
	flushList()

	return template.HTML(out.String())
}

func parseHeading(line string) (level int, text string, ok bool) {
	for level < len(line) && level < 6 && line[level] == '#' {
		level++
	}
	if level == 0 || level >= len(line) || line[level] != ' ' {
		return 0, "", false
	}
	return level, strings.TrimSpace(line[level:]), true
}

func stripInlineMarkdown(input string) string {
	input = regexp.MustCompile("!\\[([^\\]]*)\\]\\([^)]+\\)").ReplaceAllString(input, "$1")
	input = regexp.MustCompile("\\[([^\\]]+)\\]\\([^)]+\\)").ReplaceAllString(input, "$1")
	input = strings.ReplaceAll(input, "`", "")
	input = strings.ReplaceAll(input, "*", "")
	input = strings.ReplaceAll(input, "_", "")
	return input
}

func renderInlineMarkdown(input string) string {
	escaped := html.EscapeString(input)
	escaped = renderInlineCode(escaped)
	escaped = renderImages(escaped)
	escaped = renderLinks(escaped)
	escaped = regexp.MustCompile("\\*\\*([^*]+)\\*\\*").ReplaceAllString(escaped, "<strong>$1</strong>")
	escaped = regexp.MustCompile("\\*([^*]+)\\*").ReplaceAllString(escaped, "<em>$1</em>")
	return escaped
}

func renderInlineCode(input string) string {
	return regexp.MustCompile("`([^`]+)`").ReplaceAllString(input, "<code>$1</code>")
}

func renderImages(input string) string {
	re := regexp.MustCompile("!\\[([^\\]]*)\\]\\(([^)]+)\\)")
	return re.ReplaceAllStringFunc(input, func(match string) string {
		parts := re.FindStringSubmatch(match)
		if len(parts) != 3 {
			return match
		}
		alt := html.EscapeString(parts[1])
		src := html.EscapeString(rewriteMarkdownAssetURL(parts[2]))
		return fmt.Sprintf(`<img src="%s" alt="%s" loading="lazy" decoding="async">`, src, alt)
	})
}

func renderLinks(input string) string {
	re := regexp.MustCompile("\\[([^\\]]+)\\]\\(([^)]+)\\)")
	return re.ReplaceAllStringFunc(input, func(match string) string {
		parts := re.FindStringSubmatch(match)
		if len(parts) != 3 {
			return match
		}
		href := sanitizeMarkdownURL(parts[2])
		if href == "" {
			return parts[1]
		}
		return fmt.Sprintf(`<a href="%s">%s</a>`, html.EscapeString(href), parts[1])
	})
}

func sanitizeMarkdownURL(raw string) string {
	raw = strings.TrimSpace(html.UnescapeString(raw))
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	if parsed.Scheme == "" || parsed.Scheme == "http" || parsed.Scheme == "https" || parsed.Scheme == "mailto" {
		return raw
	}
	return ""
}

func rewriteMarkdownAssetURL(raw string) string {
	raw = strings.TrimSpace(html.UnescapeString(raw))
	if strings.HasPrefix(raw, "/") || strings.HasPrefix(raw, "http://") || strings.HasPrefix(raw, "https://") || strings.HasPrefix(raw, "data:") {
		return raw
	}
	if strings.HasPrefix(raw, "./") {
		return "/content/" + strings.TrimPrefix(raw, "./")
	}
	if strings.HasPrefix(raw, "../") {
		return "/content/" + strings.TrimLeft(raw, "../")
	}
	if strings.HasPrefix(raw, "content/") {
		return "/" + raw
	}
	return "/content/" + raw
}

func stripMarkdown(md string) string {
	text := regexp.MustCompile("```[\\s\\S]*?```").ReplaceAllString(md, " ")
	text = regexp.MustCompile("`[^`]*`").ReplaceAllString(text, " ")
	text = regexp.MustCompile("!\\[[^\\]]*\\]\\([^)]+\\)").ReplaceAllString(text, " ")
	text = regexp.MustCompile("\\[([^\\]]+)\\]\\([^)]+\\)").ReplaceAllString(text, "$1")
	text = regexp.MustCompile("(?m)^\\s{0,3}(#{1,6}|\\*|-|\\+|>|\\d+\\.)\\s+").ReplaceAllString(text, "")
	text = regexp.MustCompile("[_*~>#+=|]").ReplaceAllString(text, " ")
	text = regexp.MustCompile("\\s+").ReplaceAllString(text, " ")
	return strings.TrimSpace(text)
}
