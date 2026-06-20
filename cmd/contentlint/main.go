package main

import (
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"

	"gopkg.in/yaml.v3"
)

type options struct {
	articlesDir string
	notesDir    string
}

type lintIssue struct {
	path    string
	message string
}

type lintIssues []lintIssue

func main() {
	if err := run(os.Args[1:]); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "contentlint: %v\n", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	opts, err := parseOptions(args)
	if err != nil {
		return err
	}

	var issues lintIssues
	articleSlugs := make(map[string]string)

	articleIssues, err := lintMarkdownDir(opts.articlesDir, func(path string, frontmatter map[string]any, body string) lintIssues {
		return validateArticle(path, frontmatter, body, articleSlugs)
	})
	if err != nil {
		return err
	}
	issues = append(issues, articleIssues...)

	noteIssues, err := lintMarkdownDir(opts.notesDir, validateNote)
	if err != nil {
		return err
	}
	issues = append(issues, noteIssues...)

	if len(issues) > 0 {
		return issues
	}
	return nil
}

func parseOptions(args []string) (options, error) {
	flags := flag.NewFlagSet("contentlint", flag.ContinueOnError)
	flags.SetOutput(os.Stderr)

	articlesDir := flags.String("articles", "content/articles", "directory containing article Markdown files")
	notesDir := flags.String("notes", "content/notes", "directory containing note Markdown files")

	if err := flags.Parse(args); err != nil {
		return options{}, err
	}

	return options{
		articlesDir: strings.TrimSpace(*articlesDir),
		notesDir:    strings.TrimSpace(*notesDir),
	}, nil
}

func lintMarkdownDir(dir string, validate func(path string, frontmatter map[string]any, body string) lintIssues) (lintIssues, error) {
	if strings.TrimSpace(dir) == "" {
		return nil, errors.New("markdown directory is required")
	}

	root, err := os.OpenRoot(dir)
	if err != nil {
		return nil, fmt.Errorf("open %q: %w", dir, err)
	}
	defer root.Close()

	var issues lintIssues
	var count int
	err = filepath.WalkDir(dir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || !entry.Type().IsRegular() || !strings.EqualFold(filepath.Ext(entry.Name()), ".md") {
			return nil
		}

		count++
		relativePath, err := filepath.Rel(dir, path)
		if err != nil {
			return err
		}

		frontmatter, body, fileIssues := readFrontmatter(root, path, relativePath)
		issues = append(issues, fileIssues...)
		if len(fileIssues) > 0 {
			return nil
		}

		issues = append(issues, validate(path, frontmatter, body)...)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("walk %q: %w", dir, err)
	}
	if count == 0 {
		issues = append(issues, lintIssue{path: dir, message: "no Markdown files found"})
	}

	return issues, nil
}

func readFrontmatter(root *os.Root, path string, relativePath string) (map[string]any, string, lintIssues) {
	raw, err := root.ReadFile(relativePath)
	if err != nil {
		return nil, "", lintIssues{{path: path, message: fmt.Sprintf("read file: %v", err)}}
	}

	frontmatterRaw, body, ok := splitFrontmatter(string(raw))
	if !ok {
		return nil, body, lintIssues{{path: path, message: "missing YAML frontmatter block"}}
	}

	var frontmatter map[string]any
	if err := yaml.Unmarshal([]byte(frontmatterRaw), &frontmatter); err != nil {
		return nil, body, lintIssues{{path: path, message: fmt.Sprintf("decode YAML frontmatter: %v", err)}}
	}
	if frontmatter == nil {
		frontmatter = make(map[string]any)
	}

	return frontmatter, body, nil
}

func splitFrontmatter(raw string) (frontmatter string, body string, ok bool) {
	raw = strings.ReplaceAll(raw, "\r\n", "\n")
	if !strings.HasPrefix(raw, "---\n") {
		return "", raw, false
	}

	rest := strings.TrimPrefix(raw, "---\n")
	index := strings.Index(rest, "\n---\n")
	if index < 0 {
		return "", raw, false
	}

	return rest[:index], rest[index+len("\n---\n"):], true
}

func validateArticle(path string, frontmatter map[string]any, body string, seenSlugs map[string]string) lintIssues {
	var issues lintIssues

	issues = appendRequiredString(issues, path, frontmatter, "title")
	issues = appendRequiredString(issues, path, frontmatter, "summary")
	issues = appendRequiredString(issues, path, frontmatter, "author")
	issues = appendRequiredBody(issues, path, body)

	published := firstNonEmpty(fieldString(frontmatter, "publishedAt"), fieldString(frontmatter, "publishedDate"))
	if published == "" {
		issues = append(issues, lintIssue{path: path, message: "publishedAt or publishedDate is required"})
	} else if !validContentDate(published) {
		issues = append(issues, lintIssue{path: path, message: "publishedAt/publishedDate must be YYYY-MM-DD or RFC3339"})
	}

	slug := normalizeSlug(fieldString(frontmatter, "slug"))
	if slug == "" {
		slug = normalizeSlug(fileBase(filepath.Base(path)))
	}
	if slug == "" {
		issues = append(issues, lintIssue{path: path, message: "article slug is empty after normalization"})
	} else if previousPath, exists := seenSlugs[slug]; exists {
		issues = append(issues, lintIssue{path: path, message: fmt.Sprintf("article slug %q duplicates %s", slug, previousPath)})
	} else {
		seenSlugs[slug] = path
	}

	return issues
}

func validateNote(path string, frontmatter map[string]any, body string) lintIssues {
	var issues lintIssues

	issues = appendRequiredString(issues, path, frontmatter, "title")
	issues = appendRequiredString(issues, path, frontmatter, "date")
	issues = appendRequiredBody(issues, path, body)

	if date := fieldString(frontmatter, "date"); date != "" && !validContentDate(date) {
		issues = append(issues, lintIssue{path: path, message: "date must be YYYY-MM-DD or RFC3339"})
	}

	return issues
}

func appendRequiredString(issues lintIssues, path string, frontmatter map[string]any, key string) lintIssues {
	if fieldString(frontmatter, key) == "" {
		return append(issues, lintIssue{path: path, message: key + " is required"})
	}
	return issues
}

func appendRequiredBody(issues lintIssues, path string, body string) lintIssues {
	if strings.TrimSpace(body) == "" {
		return append(issues, lintIssue{path: path, message: "body is required"})
	}
	return issues
}

func validContentDate(value string) bool {
	if _, err := time.Parse("2006-01-02", value); err == nil {
		return true
	}
	if _, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return true
	}
	return false
}

func fieldString(data map[string]any, key string) string {
	value, ok := data[key]
	if !ok || value == nil {
		return ""
	}

	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case time.Time:
		if typed.Hour() == 0 && typed.Minute() == 0 && typed.Second() == 0 && typed.Nanosecond() == 0 {
			return typed.Format("2006-01-02")
		}
		return typed.Format(time.RFC3339Nano)
	default:
		return strings.TrimSpace(fmt.Sprint(typed))
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
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

func (issues lintIssues) Error() string {
	var builder strings.Builder
	_, _ = fmt.Fprintf(&builder, "%d content issue(s) found:", len(issues))
	for _, issue := range issues {
		_, _ = fmt.Fprintf(&builder, "\n- %s: %s", issue.path, issue.message)
	}
	return builder.String()
}
