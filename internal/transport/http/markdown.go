package httptransport

import (
	"bytes"
	"errors"
	"fmt"
	stdhtml "html"
	"html/template"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	katex "github.com/FurqanSoftware/goldmark-katex"
	"github.com/microcosm-cc/bluemonday"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	goldhtml "github.com/yuin/goldmark/renderer/html"
	nethtml "golang.org/x/net/html"
	"golang.org/x/net/html/atom"
	"gopkg.in/yaml.v3"
)

var errMarkdownArticleNotFound = errors.New("markdown article not found")

const twemojiBaseURL = "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/"

var articleMarkdown = goldmark.New(
	goldmark.WithExtensions(extension.GFM),
	goldmark.WithParserOptions(parser.WithAutoHeadingID()),
	goldmark.WithRendererOptions(
		goldhtml.WithHardWraps(),
		goldhtml.WithUnsafe(),
	),
)

type articleFrontmatter struct {
	Title       string
	Summary     string
	Author      string
	PublishedAt string
	Tags        []string
	Keywords    []string
	Slug        string
	SEO         articleSEO
	JSONLD      map[string]any
}

type articleSEO struct {
	Title        string
	Description  string
	CanonicalURL string
	Image        string
	Locale       string
}

type markdownArticle struct {
	Slug            string
	Frontmatter     articleFrontmatter
	FrontmatterData map[string]any
	Content         string
	HTML            template.HTML
	SourcePath      string
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
	frontmatterData, err := parseFrontmatter(frontmatterRaw)
	if err != nil {
		return markdownArticle{}, fmt.Errorf("parse markdown frontmatter %q: %w", filePath, err)
	}

	fm := normalizeArticleFrontmatter(frontmatterData)
	slug := normalizeSlug(fm.Slug)
	if slug == "" {
		slug = normalizeSlug(fileBase(filepath.Base(filePath)))
	}

	htmlContent := markdownToHTML(content)

	return markdownArticle{
		Slug:            slug,
		Frontmatter:     fm,
		FrontmatterData: frontmatterData,
		Content:         content,
		HTML:            htmlContent,
		SourcePath:      filePath,
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

func parseFrontmatter(raw string) (map[string]any, error) {
	out := make(map[string]any)
	if strings.TrimSpace(raw) == "" {
		return out, nil
	}

	if err := yaml.Unmarshal([]byte(raw), &out); err != nil {
		return nil, fmt.Errorf("decode YAML: %w", err)
	}

	return normalizeYAMLMap(out), nil
}

func normalizeYAMLMap(data map[string]any) map[string]any {
	out := make(map[string]any, len(data))
	for key, value := range data {
		out[key] = normalizeYAMLValue(value)
	}
	return out
}

func normalizeYAMLValue(value any) any {
	switch typed := value.(type) {
	case map[string]any:
		return normalizeYAMLMap(typed)
	case map[any]any:
		out := make(map[string]any, len(typed))
		for key, value := range typed {
			out[fmt.Sprint(key)] = normalizeYAMLValue(value)
		}
		return out
	case []any:
		out := make([]any, 0, len(typed))
		for _, item := range typed {
			out = append(out, normalizeYAMLValue(item))
		}
		return out
	default:
		return value
	}
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
		JSONLD:      jsonLDFromFrontmatter(data),
	}
}

func stringFromFrontmatter(data map[string]any, key string) string {
	value, ok := data[key]
	if !ok || value == nil {
		return ""
	}
	return stringFromAny(value)
}

func stringFromAny(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(typed)
	case time.Time:
		if typed.Hour() == 0 && typed.Minute() == 0 && typed.Second() == 0 && typed.Nanosecond() == 0 {
			return typed.Format("2006-01-02")
		}
		return typed.Format(time.RFC3339)
	default:
		return strings.TrimSpace(fmt.Sprint(typed))
	}
}

func stringSliceFromFrontmatter(data map[string]any, key string) []string {
	value, ok := data[key]
	if !ok || value == nil {
		return nil
	}

	switch typed := value.(type) {
	case []string:
		return cleanStringSlice(typed)
	case []any:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			if text := stringFromAny(item); text != "" {
				out = append(out, text)
			}
		}
		return out
	case string:
		if typed == "" {
			return nil
		}
		return []string{strings.TrimSpace(typed)}
	default:
		text := stringFromAny(typed)
		if text == "" {
			return nil
		}
		return []string{text}
	}
}

func cleanStringSlice(values []string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			out = append(out, value)
		}
	}
	return out
}

func seoFromFrontmatter(data map[string]any) articleSEO {
	seoMap := mapFromFrontmatter(data, "seo")

	return articleSEO{
		Title:        firstNonEmpty(stringFromMap(seoMap, "title"), stringFromFrontmatter(data, "seoTitle")),
		Description:  firstNonEmpty(stringFromMap(seoMap, "description"), stringFromFrontmatter(data, "seoDescription")),
		CanonicalURL: firstNonEmpty(stringFromMap(seoMap, "canonicalUrl"), stringFromFrontmatter(data, "canonicalUrl")),
		Image:        firstNonEmpty(stringFromMap(seoMap, "image"), stringFromFrontmatter(data, "image")),
		Locale:       firstNonEmpty(stringFromMap(seoMap, "locale"), stringFromFrontmatter(data, "locale")),
	}
}

func jsonLDFromFrontmatter(data map[string]any) map[string]any {
	if jsonLD := mapFromFrontmatter(data, "jsonLd"); len(jsonLD) > 0 {
		return jsonLD
	}
	return mapFromFrontmatter(data, "jsonLD")
}

func mapFromFrontmatter(data map[string]any, key string) map[string]any {
	value, ok := data[key]
	if !ok || value == nil {
		return nil
	}

	switch typed := value.(type) {
	case map[string]any:
		return typed
	case map[string]string:
		out := make(map[string]any, len(typed))
		for key, value := range typed {
			out[key] = value
		}
		return out
	default:
		return nil
	}
}

func stringFromMap(data map[string]any, key string) string {
	if len(data) == 0 {
		return ""
	}
	return stringFromAny(data[key])
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
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
	case 'á', 'à', 'ã', 'â', 'ä', 'å', 'ā':
		return 'a'
	case 'é', 'è', 'ê', 'ë', 'ē':
		return 'e'
	case 'í', 'ì', 'î', 'ï', 'ī':
		return 'i'
	case 'ó', 'ò', 'õ', 'ô', 'ö', 'ō':
		return 'o'
	case 'ú', 'ù', 'û', 'ü', 'ū':
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
	var out bytes.Buffer
	source := protectDisplayMathBlocks(md)
	context := parser.NewContext(parser.WithIDs(newMarkdownIDs()))
	if err := articleMarkdown.Convert([]byte(source), &out, parser.WithContext(context)); err != nil {
		return ""
	}

	htmlContent := out.String()
	htmlContent = rewriteHTMLAssetURLs(htmlContent)
	htmlContent = renderTwemoji(htmlContent)
	htmlContent = autolinkHeadings(htmlContent)
	htmlContent = sanitizeArticleHTML(htmlContent)
	htmlContent = renderKatex(htmlContent)

	return template.HTML(htmlContent)
}

type markdownIDs struct {
	used map[string]int
}

func newMarkdownIDs() *markdownIDs {
	return &markdownIDs{used: make(map[string]int)}
}

func (ids *markdownIDs) Generate(value []byte, kind ast.NodeKind) []byte {
	base := normalizeSlug(stripInlineMarkdown(string(value)))
	if base == "" {
		if kind == ast.KindHeading {
			base = "heading"
		} else {
			base = "id"
		}
	}

	if count, ok := ids.used[base]; ok {
		count++
		for {
			next := fmt.Sprintf("%s-%d", base, count)
			if _, exists := ids.used[next]; !exists {
				ids.used[base] = count
				ids.used[next] = 0
				return []byte(next)
			}
			count++
		}
	}

	ids.used[base] = 0
	return []byte(base)
}

func (ids *markdownIDs) Put(value []byte) {
	ids.used[string(value)] = 0
}

func protectDisplayMathBlocks(md string) string {
	lines := strings.Split(strings.ReplaceAll(md, "\r\n", "\n"), "\n")
	out := make([]string, 0, len(lines))
	var mathLines []string
	inCode := false
	inMath := false

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "```") || strings.HasPrefix(trimmed, "~~~") {
			if !inMath {
				inCode = !inCode
			}
			out = append(out, line)
			continue
		}

		if !inCode && trimmed == "$$" {
			if inMath {
				equation := strings.Join(mathLines, "\n")
				out = append(out, `<div data-katex-display="`+stdhtml.EscapeString(equation)+`"></div>`)
				mathLines = nil
				inMath = false
				continue
			}
			inMath = true
			mathLines = nil
			continue
		}

		if inMath {
			mathLines = append(mathLines, line)
			continue
		}

		out = append(out, line)
	}

	if inMath {
		out = append(out, "$$")
		out = append(out, mathLines...)
	}

	return strings.Join(out, "\n")
}

func sanitizeArticleHTML(raw string) string {
	policy := bluemonday.UGCPolicy()
	policy.AllowStandardURLs()
	policy.AllowRelativeURLs(true)
	policy.AllowDataURIImages()
	policy.RequireNoFollowOnLinks(false)
	policy.RequireNoFollowOnFullyQualifiedLinks(false)

	policy.AllowElements(
		"div", "span", "code", "pre",
		"table", "thead", "tbody", "tr", "th", "td",
		"figure", "figcaption",
		"img", "source", "video", "audio",
		"a", "input",
	)

	policy.AllowAttrs("class", "id").Globally()
	policy.AllowAttrs("href", "target", "rel", "class", "id").OnElements("a")
	policy.AllowAttrs("data-katex-display").OnElements("div")
	policy.AllowAttrs("colspan", "rowspan").Matching(bluemonday.Integer).OnElements("th", "td")
	policy.AllowAttrs("scope").OnElements("th")
	policy.AllowAttrs("src", "alt", "class", "id", "width", "height", "loading", "decoding", "srcset", "sizes", "draggable", "aria-label", "role").OnElements("img")
	policy.AllowAttrs("src", "srcset", "type").OnElements("source")
	policy.AllowAttrs("src", "controls", "poster", "width", "height", "class", "id").OnElements("video")
	policy.AllowAttrs("src", "controls", "class", "id").OnElements("audio")
	policy.AllowAttrs("type", "checked", "disabled", "class", "id").OnElements("input")

	return policy.Sanitize(raw)
}

func parseHTMLFragment(raw string) (*nethtml.Node, error) {
	container := &nethtml.Node{Type: nethtml.ElementNode, DataAtom: atom.Div, Data: "div"}
	nodes, err := nethtml.ParseFragment(strings.NewReader(raw), container)
	if err != nil {
		return nil, err
	}
	for _, node := range nodes {
		container.AppendChild(node)
	}
	return container, nil
}

func renderHTMLFragment(container *nethtml.Node) string {
	var out strings.Builder
	for child := container.FirstChild; child != nil; child = child.NextSibling {
		_ = nethtml.Render(&out, child)
	}
	return out.String()
}

func walkHTML(node *nethtml.Node, visit func(*nethtml.Node)) {
	visit(node)
	for child := node.FirstChild; child != nil; {
		next := child.NextSibling
		walkHTML(child, visit)
		child = next
	}
}

func rewriteHTMLAssetURLs(raw string) string {
	container, err := parseHTMLFragment(raw)
	if err != nil {
		return raw
	}

	assetTags := map[string]bool{
		"img": true, "source": true, "video": true, "audio": true, "a": true,
	}
	attrs := map[string]bool{
		"src": true, "srcset": true, "poster": true, "data-src": true, "href": true,
	}

	walkHTML(container, func(node *nethtml.Node) {
		if node.Type != nethtml.ElementNode || !assetTags[strings.ToLower(node.Data)] {
			return
		}
		for index := range node.Attr {
			attr := strings.ToLower(node.Attr[index].Key)
			if attrs[attr] {
				node.Attr[index].Val = rewriteAssetAttribute(attr, node.Attr[index].Val)
			}
		}
	})

	return renderHTMLFragment(container)
}

func rewriteAssetAttribute(attr string, value string) string {
	if attr == "srcset" {
		return rewriteSrcset(value)
	}
	return rewriteMarkdownAssetURL(value)
}

func rewriteSrcset(value string) string {
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		fields := strings.Fields(strings.TrimSpace(part))
		if len(fields) == 0 {
			continue
		}
		url := rewriteMarkdownAssetURL(fields[0])
		if len(fields) == 1 {
			out = append(out, url)
			continue
		}
		out = append(out, url+" "+strings.Join(fields[1:], " "))
	}
	return strings.Join(out, ", ")
}

func rewriteMarkdownAssetURL(raw string) string {
	raw = strings.TrimSpace(stdhtml.UnescapeString(raw))
	if raw == "" {
		return raw
	}
	if strings.HasPrefix(raw, "/") || strings.HasPrefix(raw, "http://") || strings.HasPrefix(raw, "https://") || strings.HasPrefix(raw, "data:") {
		return raw
	}
	if strings.HasPrefix(raw, "./") {
		return "/content/" + strings.TrimPrefix(raw, "./")
	}
	if strings.HasPrefix(raw, "../") {
		for strings.HasPrefix(raw, "../") {
			raw = strings.TrimPrefix(raw, "../")
		}
		return "/content/" + raw
	}
	if strings.HasPrefix(raw, "content/") {
		return "/" + raw
	}
	return "/content/" + raw
}

func renderTwemoji(raw string) string {
	container, err := parseHTMLFragment(raw)
	if err != nil {
		return raw
	}

	walkHTML(container, func(node *nethtml.Node) {
		if node.Type != nethtml.TextNode || shouldSkipTextTransform(node) {
			return
		}

		replacement := emojiNodes(node.Data)
		if len(replacement) == 0 {
			return
		}
		replaceNode(node, replacement)
	})

	return renderHTMLFragment(container)
}

func shouldSkipTextTransform(node *nethtml.Node) bool {
	for parent := node.Parent; parent != nil; parent = parent.Parent {
		switch strings.ToLower(parent.Data) {
		case "code", "pre", "script", "style":
			return true
		}
	}
	return false
}

func emojiNodes(text string) []*nethtml.Node {
	var nodes []*nethtml.Node
	textStart := 0
	for index := 0; index < len(text); {
		end := emojiSequenceEnd(text, index)
		if end == index {
			_, size := utf8.DecodeRuneInString(text[index:])
			index += size
			continue
		}

		if index > textStart {
			nodes = append(nodes, &nethtml.Node{Type: nethtml.TextNode, Data: text[textStart:index]})
		}

		emoji := text[index:end]
		nodes = append(nodes, &nethtml.Node{
			Type: nethtml.ElementNode,
			Data: "img",
			Attr: []nethtml.Attribute{
				{Key: "class", Val: "emoji"},
				{Key: "draggable", Val: "false"},
				{Key: "alt", Val: emoji},
				{Key: "aria-label", Val: emoji},
				{Key: "src", Val: twemojiBaseURL + twemojiCodepoint(emoji) + ".svg"},
				{Key: "loading", Val: "lazy"},
				{Key: "decoding", Val: "async"},
			},
		})

		index = end
		textStart = index
	}

	if len(nodes) == 0 {
		return nil
	}
	if textStart < len(text) {
		nodes = append(nodes, &nethtml.Node{Type: nethtml.TextNode, Data: text[textStart:]})
	}
	return nodes
}

func emojiSequenceEnd(text string, start int) int {
	if end := keycapSequenceEnd(text, start); end > start {
		return end
	}

	r, size := utf8.DecodeRuneInString(text[start:])
	if !isEmojiStarter(r) {
		return start
	}

	end := start + size
	if isRegionalIndicator(r) {
		if next, nextSize := utf8.DecodeRuneInString(text[end:]); isRegionalIndicator(next) {
			end += nextSize
		}
		return end
	}

	for end < len(text) {
		r, size = utf8.DecodeRuneInString(text[end:])
		if isEmojiContinuation(r) {
			end += size
			continue
		}
		if r == 0x200d {
			zwjStart := end
			end += size
			if end < len(text) {
				next, nextSize := utf8.DecodeRuneInString(text[end:])
				if isEmojiStarter(next) {
					end += nextSize
					continue
				}
			}
			return zwjStart
		}
		break
	}

	return end
}

func keycapSequenceEnd(text string, start int) int {
	r, size := utf8.DecodeRuneInString(text[start:])
	if !(r >= '0' && r <= '9' || r == '#' || r == '*') {
		return start
	}

	end := start + size
	if end < len(text) {
		next, nextSize := utf8.DecodeRuneInString(text[end:])
		if isVariationSelector(next) {
			end += nextSize
		}
	}
	if end < len(text) {
		next, nextSize := utf8.DecodeRuneInString(text[end:])
		if next == 0x20e3 {
			return end + nextSize
		}
	}
	return start
}

func isEmojiStarter(r rune) bool {
	switch {
	case r >= 0x1f000 && r <= 0x1faff:
		return true
	case r >= 0x2600 && r <= 0x27bf:
		return true
	case r >= 0x2300 && r <= 0x23ff:
		return true
	case r >= 0x2b00 && r <= 0x2bff:
		return true
	case r >= 0x2194 && r <= 0x21aa:
		return true
	case r >= 0x2934 && r <= 0x2935:
		return true
	case r >= 0x25aa && r <= 0x25fe:
		return true
	default:
		return r == 0x00a9 || r == 0x00ae || r == 0x203c || r == 0x2049 || r == 0x2122 || r == 0x2139 || r == 0x3030 || r == 0x303d || r == 0x3297 || r == 0x3299
	}
}

func isEmojiContinuation(r rune) bool {
	return isVariationSelector(r) ||
		isEmojiModifier(r) ||
		(r >= 0xe0020 && r <= 0xe007f)
}

func isVariationSelector(r rune) bool {
	return r == 0xfe0e || r == 0xfe0f
}

func isEmojiModifier(r rune) bool {
	return r >= 0x1f3fb && r <= 0x1f3ff
}

func isRegionalIndicator(r rune) bool {
	return r >= 0x1f1e6 && r <= 0x1f1ff
}

func twemojiCodepoint(emoji string) string {
	var parts []string
	for _, r := range emoji {
		if isVariationSelector(r) {
			continue
		}
		parts = append(parts, fmt.Sprintf("%x", r))
	}
	return strings.Join(parts, "-")
}

func autolinkHeadings(raw string) string {
	container, err := parseHTMLFragment(raw)
	if err != nil {
		return raw
	}

	walkHTML(container, func(node *nethtml.Node) {
		if node.Type != nethtml.ElementNode {
			return
		}
		tag := strings.ToLower(node.Data)
		if tag != "h2" && tag != "h3" {
			return
		}
		id := attrValue(node, "id")
		if id == "" || hasDescendantTag(node, "a") {
			return
		}

		link := &nethtml.Node{
			Type: nethtml.ElementNode,
			Data: "a",
			Attr: []nethtml.Attribute{
				{Key: "href", Val: "#" + id},
				{Key: "class", Val: "heading-anchor"},
			},
		}
		for child := node.FirstChild; child != nil; {
			next := child.NextSibling
			node.RemoveChild(child)
			link.AppendChild(child)
			child = next
		}
		node.AppendChild(link)
	})

	return renderHTMLFragment(container)
}

func attrValue(node *nethtml.Node, key string) string {
	for _, attr := range node.Attr {
		if strings.EqualFold(attr.Key, key) {
			return attr.Val
		}
	}
	return ""
}

func hasDescendantTag(node *nethtml.Node, tag string) bool {
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if child.Type == nethtml.ElementNode && strings.EqualFold(child.Data, tag) {
			return true
		}
		if hasDescendantTag(child, tag) {
			return true
		}
	}
	return false
}

func renderKatex(raw string) string {
	container, err := parseHTMLFragment(raw)
	if err != nil {
		return raw
	}

	walkHTML(container, func(node *nethtml.Node) {
		if node.Type == nethtml.ElementNode && strings.EqualFold(node.Data, "div") {
			if equation := attrValue(node, "data-katex-display"); equation != "" {
				replaceNode(node, katexNodes(equation, true, "$$"+equation+"$$"))
			}
			return
		}
		if node.Type != nethtml.TextNode || shouldSkipTextTransform(node) {
			return
		}
		replacement := inlineKatexNodes(node.Data)
		if len(replacement) > 0 {
			replaceNode(node, replacement)
		}
	})

	return renderHTMLFragment(container)
}

func inlineKatexNodes(text string) []*nethtml.Node {
	var nodes []*nethtml.Node
	textStart := 0
	for index := 0; index < len(text); {
		if text[index] != '$' || isEscaped(text, index) {
			index++
			continue
		}
		if index+1 < len(text) && text[index+1] == '$' {
			closeIndex := findClosingDisplayMathDelimiter(text, index+2)
			if closeIndex < 0 {
				index += 2
				continue
			}

			equation := text[index+2 : closeIndex]
			if strings.TrimSpace(equation) == "" {
				index = closeIndex + 2
				continue
			}

			if index > textStart {
				nodes = append(nodes, &nethtml.Node{Type: nethtml.TextNode, Data: text[textStart:index]})
			}
			nodes = append(nodes, katexNodes(equation, true, text[index:closeIndex+2])...)
			index = closeIndex + 2
			textStart = index
			continue
		}

		closeIndex := findClosingMathDelimiter(text, index+1)
		if closeIndex < 0 {
			index++
			continue
		}

		equation := text[index+1 : closeIndex]
		if strings.TrimSpace(equation) == "" {
			index = closeIndex + 1
			continue
		}

		if index > textStart {
			nodes = append(nodes, &nethtml.Node{Type: nethtml.TextNode, Data: text[textStart:index]})
		}
		nodes = append(nodes, katexNodes(equation, false, text[index:closeIndex+1])...)
		index = closeIndex + 1
		textStart = index
	}

	if len(nodes) == 0 {
		return nil
	}
	if textStart < len(text) {
		nodes = append(nodes, &nethtml.Node{Type: nethtml.TextNode, Data: text[textStart:]})
	}
	return nodes
}

func findClosingMathDelimiter(text string, start int) int {
	for index := start; index < len(text); index++ {
		if text[index] == '$' && !isEscaped(text, index) {
			return index
		}
	}
	return -1
}

func findClosingDisplayMathDelimiter(text string, start int) int {
	for index := start; index+1 < len(text); index++ {
		if text[index] == '$' && text[index+1] == '$' && !isEscaped(text, index) {
			return index
		}
	}
	return -1
}

func isEscaped(text string, index int) bool {
	backslashes := 0
	for i := index - 1; i >= 0 && text[i] == '\\'; i-- {
		backslashes++
	}
	return backslashes%2 == 1
}

func katexNodes(equation string, display bool, fallback string) []*nethtml.Node {
	var out bytes.Buffer
	if err := katex.Render(&out, []byte(equation), display, false); err != nil {
		return []*nethtml.Node{{Type: nethtml.TextNode, Data: fallback}}
	}

	container, err := parseHTMLFragment(out.String())
	if err != nil {
		return []*nethtml.Node{{Type: nethtml.TextNode, Data: fallback}}
	}

	var nodes []*nethtml.Node
	for child := container.FirstChild; child != nil; {
		next := child.NextSibling
		container.RemoveChild(child)
		nodes = append(nodes, child)
		child = next
	}
	return nodes
}

func replaceNode(old *nethtml.Node, nodes []*nethtml.Node) {
	parent := old.Parent
	if parent == nil {
		return
	}
	for _, node := range nodes {
		if node.Parent != nil {
			node.Parent.RemoveChild(node)
		}
		parent.InsertBefore(node, old)
	}
	parent.RemoveChild(old)
}

func stripInlineMarkdown(input string) string {
	input = regexp.MustCompile("!\\[([^\\]]*)\\]\\([^)]+\\)").ReplaceAllString(input, "$1")
	input = regexp.MustCompile("\\[([^\\]]+)\\]\\([^)]+\\)").ReplaceAllString(input, "$1")
	input = strings.ReplaceAll(input, "`", "")
	input = strings.ReplaceAll(input, "*", "")
	input = strings.ReplaceAll(input, "_", "")
	return input
}

func stripMarkdown(md string) string {
	text := regexp.MustCompile("(?s)```.*?```").ReplaceAllString(md, " ")
	text = regexp.MustCompile("`[^`]*`").ReplaceAllString(text, " ")
	text = regexp.MustCompile("!\\[[^\\]]*\\]\\([^)]+\\)").ReplaceAllString(text, " ")
	text = regexp.MustCompile("\\[([^\\]]+)\\]\\([^)]+\\)").ReplaceAllString(text, "$1")
	text = regexp.MustCompile("(?m)^\\s{0,3}(#{1,6}|\\*|-|\\+|>|\\d+\\.)\\s+").ReplaceAllString(text, "")
	text = regexp.MustCompile("(?s)<[^>]*>").ReplaceAllString(text, " ")
	text = regexp.MustCompile("[_*~>#+=|]").ReplaceAllString(text, " ")
	text = regexp.MustCompile("\\s+").ReplaceAllString(text, " ")
	return strings.TrimSpace(text)
}
