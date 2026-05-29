package main

import (
	"bytes"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strings"

	"github.com/guilhermeportella/guilhermeportella.github.io/internal/config"
	httptransport "github.com/guilhermeportella/guilhermeportella.github.io/internal/transport/http"
	"golang.org/x/net/html"
)

var staticPageRoutes = map[string]struct{}{
	"/":                            {},
	"/404":                         {},
	"/about":                       {},
	"/articles":                    {},
	"/blog":                        {},
	"/curiosidades":                {},
	"/curiosidades/rick-and-morty": {},
	"/rick-morty":                  {},
	"/games":                       {},
	"/jogos":                       {},
	"/notas":                       {},
	"/projects":                    {},
	"/projetos":                    {},
}

type exportOptions struct {
	outputDir string
	basePath  string
}

type exporter struct {
	handler   http.Handler
	outputDir string
	imagesDir string
	staticDir string
	basePath  string
}

func main() {
	if err := run(os.Args[1:]); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "export: %v\n", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	options, err := parseOptions(args)
	if err != nil {
		return err
	}

	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	handler, err := httptransport.NewRouter(httptransport.RouterOptions{
		ImagesDir:    cfg.Paths.ImagesDir,
		StaticDir:    cfg.Paths.StaticDir,
		TemplatesDir: cfg.Paths.TemplatesDir,
		ContentDir:   cfg.Paths.ContentDir,
		NotesDir:     cfg.Paths.NotesDir,
	}, logger)
	if err != nil {
		return fmt.Errorf("build router: %w", err)
	}

	exporter := exporter{
		handler:   handler,
		outputDir: options.outputDir,
		imagesDir: cfg.Paths.ImagesDir,
		staticDir: cfg.Paths.StaticDir,
		basePath:  options.basePath,
	}

	return exporter.Export()
}

func parseOptions(args []string) (exportOptions, error) {
	flags := flag.NewFlagSet("export", flag.ContinueOnError)
	flags.SetOutput(io.Discard)

	outputDir := flags.String("output", envString("EXPORT_DIR", "dist"), "directory that receives the static site")
	basePath := flags.String("base-path", envString("SITE_BASE_PATH", ""), "base path used when publishing under a GitHub Pages project URL")

	if err := flags.Parse(args); err != nil {
		return exportOptions{}, err
	}

	cleanOutputDir, err := cleanOutputDir(*outputDir)
	if err != nil {
		return exportOptions{}, err
	}

	normalizedBasePath, err := normalizeBasePath(*basePath)
	if err != nil {
		return exportOptions{}, err
	}

	return exportOptions{
		outputDir: cleanOutputDir,
		basePath:  normalizedBasePath,
	}, nil
}

func (exporter exporter) Export() error {
	if err := resetOutputDir(exporter.outputDir); err != nil {
		return err
	}

	if err := copyDir(exporter.staticDir, filepath.Join(exporter.outputDir, "static")); err != nil {
		return fmt.Errorf("copy static assets: %w", err)
	}

	if err := copyDirIfExists(exporter.imagesDir, filepath.Join(exporter.outputDir, "images")); err != nil {
		return fmt.Errorf("copy image assets: %w", err)
	}

	if err := os.WriteFile(filepath.Join(exporter.outputDir, ".nojekyll"), nil, 0o644); err != nil {
		return fmt.Errorf("write .nojekyll: %w", err)
	}

	routes, err := exporter.collectRoutes()
	if err != nil {
		return err
	}

	for _, route := range routes {
		body, err := exporter.renderRoute(route)
		if err != nil {
			return err
		}

		if exporter.basePath != "" {
			body, err = rewriteRootRelativeURLs(body, exporter.basePath)
			if err != nil {
				return fmt.Errorf("rewrite URLs for %q: %w", route, err)
			}
		}

		outputPath := routeOutputPath(exporter.outputDir, route)
		if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil {
			return fmt.Errorf("create output dir for %q: %w", route, err)
		}

		if err := os.WriteFile(outputPath, body, 0o644); err != nil {
			return fmt.Errorf("write %q: %w", outputPath, err)
		}
	}

	return nil
}

func (exporter exporter) collectRoutes() ([]string, error) {
	seen := make(map[string]struct{}, len(staticPageRoutes))
	for route := range staticPageRoutes {
		seen[route] = struct{}{}

		body, err := exporter.renderRoute(route)
		if err != nil {
			return nil, err
		}

		for _, link := range extractLinks(body) {
			route, ok := normalizeInternalRoute(link)
			if !ok || !shouldExportRoute(route) {
				continue
			}
			seen[route] = struct{}{}
		}
	}

	routes := make([]string, 0, len(seen))
	for route := range seen {
		routes = append(routes, route)
	}
	slices.Sort(routes)
	return routes, nil
}

func (exporter exporter) renderRoute(route string) ([]byte, error) {
	request := httptest.NewRequest(http.MethodGet, "https://example.test"+route, nil)
	recorder := httptest.NewRecorder()

	exporter.handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		return nil, fmt.Errorf("render %q: unexpected status %d", route, recorder.Code)
	}

	return recorder.Body.Bytes(), nil
}

func extractLinks(body []byte) []string {
	root, err := html.Parse(bytes.NewReader(body))
	if err != nil {
		return nil
	}

	var links []string
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node == nil {
			return
		}

		for _, attr := range node.Attr {
			if attr.Key == "href" {
				links = append(links, attr.Val)
			}
		}

		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(root)

	return links
}

func normalizeInternalRoute(raw string) (string, bool) {
	value := strings.TrimSpace(raw)
	if value == "" || strings.HasPrefix(value, "#") {
		return "", false
	}

	parsed, err := url.Parse(value)
	if err != nil {
		return "", false
	}

	if parsed.Scheme != "" || parsed.Host != "" {
		if parsed.Host != "guilhermeportella.github.io" {
			return "", false
		}
	}

	if parsed.Path == "" || !strings.HasPrefix(parsed.Path, "/") || strings.HasPrefix(parsed.Path, "//") {
		return "", false
	}

	route := path.Clean(parsed.Path)
	if route == "." {
		route = "/"
	}

	return route, true
}

func shouldExportRoute(route string) bool {
	if _, ok := staticPageRoutes[route]; ok {
		return true
	}

	if strings.HasPrefix(route, "/blog/") && !strings.Contains(strings.TrimPrefix(route, "/blog/"), "/") {
		return true
	}

	return strings.HasPrefix(route, "/jogos/") && !strings.Contains(strings.TrimPrefix(route, "/jogos/"), "/")
}

func routeOutputPath(outputDir string, route string) string {
	if route == "/" {
		return filepath.Join(outputDir, "index.html")
	}
	if route == "/404" {
		return filepath.Join(outputDir, "404.html")
	}

	parts := strings.Split(strings.TrimPrefix(path.Clean(route), "/"), "/")
	return filepath.Join(append([]string{outputDir}, append(parts, "index.html")...)...)
}

func rewriteRootRelativeURLs(body []byte, basePath string) ([]byte, error) {
	root, err := html.Parse(bytes.NewReader(body))
	if err != nil {
		return nil, err
	}

	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node == nil {
			return
		}

		for index := range node.Attr {
			attr := &node.Attr[index]
			if shouldRewriteAttribute(node, attr.Key) {
				attr.Val = withBasePath(attr.Val, basePath)
			}
		}

		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(root)

	var buffer bytes.Buffer
	if err := html.Render(&buffer, root); err != nil {
		return nil, err
	}

	return buffer.Bytes(), nil
}

func shouldRewriteAttribute(node *html.Node, key string) bool {
	switch key {
	case "href", "src", "poster", "action", "data-url":
		return true
	case "content":
		return node.Data == "meta"
	default:
		return false
	}
}

func withBasePath(value string, basePath string) string {
	if !strings.HasPrefix(value, "/") || strings.HasPrefix(value, "//") {
		return value
	}
	if value == "/" {
		return basePath + "/"
	}
	return basePath + value
}

func cleanOutputDir(outputDir string) (string, error) {
	value := strings.TrimSpace(outputDir)
	if value == "" {
		return "", errors.New("output directory must be a non-root directory")
	}

	cleaned := filepath.Clean(value)
	if cleaned == "." || cleaned == string(filepath.Separator) {
		return "", errors.New("output directory must be a non-root directory")
	}

	absoluteOutputDir, err := filepath.Abs(cleaned)
	if err != nil {
		return "", fmt.Errorf("resolve output directory %q: %w", outputDir, err)
	}

	projectRoot, err := findProjectRoot()
	if err != nil {
		return "", err
	}

	relativeOutputDir, err := filepath.Rel(projectRoot, absoluteOutputDir)
	if err != nil {
		return "", fmt.Errorf("compare output directory %q with project root: %w", outputDir, err)
	}

	if relativeOutputDir == "." || relativeOutputDir == ".." || strings.HasPrefix(relativeOutputDir, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("output directory must stay inside the project, got %q", outputDir)
	}

	root := strings.Split(filepath.ToSlash(relativeOutputDir), "/")[0]
	if isProtectedOutputRoot(root) {
		return "", fmt.Errorf("output directory %q would overwrite project source directory %q", outputDir, root)
	}

	if info, err := os.Stat(absoluteOutputDir); err == nil {
		if !info.IsDir() {
			return "", fmt.Errorf("output directory %q points to a file", outputDir)
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", fmt.Errorf("inspect output directory %q: %w", outputDir, err)
	}

	return cleaned, nil
}

func isProtectedOutputRoot(root string) bool {
	switch root {
	case ".git", ".github", "cmd", "configs", "content", "docs", "internal", "migrations", "scripts", "web":
		return true
	default:
		return strings.HasPrefix(root, ".")
	}
}

func findProjectRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("resolve working directory: %w", err)
	}

	for {
		if info, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil && !info.IsDir() {
			return dir, nil
		} else if err != nil && !errors.Is(err, os.ErrNotExist) {
			return "", fmt.Errorf("inspect project root candidate %q: %w", dir, err)
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			return "", errors.New("could not find project root containing go.mod")
		}
		dir = parent
	}
}

func normalizeBasePath(basePath string) (string, error) {
	value := strings.TrimSpace(basePath)
	if value == "" || value == "/" {
		return "", nil
	}

	if strings.Contains(value, "://") {
		return "", fmt.Errorf("base path must be a path, got %q", basePath)
	}

	value = "/" + strings.Trim(value, "/")
	cleaned := path.Clean(value)
	if cleaned == "/" {
		return "", nil
	}

	return cleaned, nil
}

func resetOutputDir(outputDir string) error {
	cleanedOutputDir, err := cleanOutputDir(outputDir)
	if err != nil {
		return err
	}

	if err := os.RemoveAll(cleanedOutputDir); err != nil {
		return fmt.Errorf("remove output dir %q: %w", cleanedOutputDir, err)
	}
	if err := os.MkdirAll(cleanedOutputDir, 0o755); err != nil {
		return fmt.Errorf("create output dir %q: %w", cleanedOutputDir, err)
	}
	return nil
}

func copyDir(source string, destination string) error {
	return filepath.WalkDir(source, func(sourcePath string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}

		relativePath, err := filepath.Rel(source, sourcePath)
		if err != nil {
			return err
		}

		destinationPath := filepath.Join(destination, relativePath)
		if entry.IsDir() {
			return os.MkdirAll(destinationPath, 0o755)
		}

		if !entry.Type().IsRegular() {
			return nil
		}

		return copyFile(sourcePath, destinationPath)
	})
}

func copyDirIfExists(source string, destination string) error {
	info, err := os.Stat(source)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	if !info.IsDir() {
		return fmt.Errorf("%q is not a directory", source)
	}

	return copyDir(source, destination)
}

func copyFile(source string, destination string) error {
	if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
		return err
	}

	sourceFile, err := os.Open(source)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	info, err := sourceFile.Stat()
	if err != nil {
		return err
	}

	destinationFile, err := os.OpenFile(destination, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, info.Mode().Perm())
	if err != nil {
		return err
	}
	defer destinationFile.Close()

	_, err = io.Copy(destinationFile, sourceFile)
	return err
}

func envString(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}
