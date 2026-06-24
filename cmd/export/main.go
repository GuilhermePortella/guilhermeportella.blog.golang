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
	"time"

	"github.com/guilhermeportella/guilhermeportella.github.io/internal/config"
	httptransport "github.com/guilhermeportella/guilhermeportella.github.io/internal/transport/http"
	"golang.org/x/net/html"
)

var staticPageRoutes = map[string]struct{}{
	"/":                            {},
	"/404":                         {},
	"/about":                       {},
	"/astronomia":                  {},
	"/articles":                    {},
	"/blog":                        {},
	"/curiosidades":                {},
	"/curiosidades/rick-and-morty": {},
	"/erro":                        {},
	"/rick-morty":                  {},
	"/games":                       {},
	"/jogos":                       {},
	"/notas":                       {},
	"/projects":                    {},
	"/projetos":                    {},
}

const (
	publicDirMode  os.FileMode = 0o755
	publicFileMode os.FileMode = 0o644
)

type exportOptions struct {
	outputDir string
	basePath  string
	siteURL   string
}

type exporter struct {
	handler    http.Handler
	outputDir  string
	imagesDir  string
	contentDir string
	staticDir  string
	basePath   string
	siteURL    string
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
		handler:    handler,
		outputDir:  options.outputDir,
		imagesDir:  cfg.Paths.ImagesDir,
		contentDir: cfg.Paths.ContentDir,
		staticDir:  cfg.Paths.StaticDir,
		basePath:   options.basePath,
		siteURL:    options.siteURL,
	}

	return exporter.Export()
}

func parseOptions(args []string) (exportOptions, error) {
	flags := flag.NewFlagSet("export", flag.ContinueOnError)
	flags.SetOutput(io.Discard)

	outputDir := flags.String("output", envString("EXPORT_DIR", "dist"), "directory that receives the static site")
	basePath := flags.String("base-path", envString("SITE_BASE_PATH", ""), "base path used when publishing under a GitHub Pages project URL")
	siteURL := flags.String("site-url", envString("SITE_URL", defaultSiteURL), "absolute site origin used for sitemap, robots.txt, and feed.xml")

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
	normalizedSiteURL, err := normalizeSiteURL(*siteURL)
	if err != nil {
		return exportOptions{}, err
	}

	return exportOptions{
		outputDir: cleanOutputDir,
		basePath:  normalizedBasePath,
		siteURL:   normalizedSiteURL,
	}, nil
}

func (exporter exporter) Export() error {
	if err := resetOutputDir(exporter.outputDir); err != nil {
		return err
	}

	if err := copyDir(exporter.staticDir, filepath.Join(exporter.outputDir, "static")); err != nil {
		return fmt.Errorf("copy static assets: %w", err)
	}

	if err := copyFileIfExists(filepath.Join(exporter.staticDir, "service-worker.js"), filepath.Join(exporter.outputDir, "service-worker.js")); err != nil {
		return fmt.Errorf("copy service worker: %w", err)
	}

	if err := copyDirIfExists(exporter.imagesDir, filepath.Join(exporter.outputDir, "images")); err != nil {
		return fmt.Errorf("copy image assets: %w", err)
	}

	if err := writePublicFile(filepath.Join(exporter.outputDir, ".nojekyll"), nil); err != nil {
		return fmt.Errorf("write .nojekyll: %w", err)
	}

	if err := exporter.writeNASAData(); err != nil {
		return err
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
		if err := writePublicFile(outputPath, body); err != nil {
			return fmt.Errorf("write %q: %w", outputPath, err)
		}
	}

	if err := exporter.writeSitemap(routes); err != nil {
		return err
	}
	if err := exporter.writeRobots(); err != nil {
		return err
	}
	if err := exporter.writeFeed(); err != nil {
		return err
	}

	return nil
}

func (exporter exporter) writeNASAData() error {
	apiKey := strings.TrimSpace(os.Getenv("NASA_API_KEY"))
	if apiKey == "" {
		return nil
	}

	outputDir := filepath.Join(exporter.outputDir, "static", "data", "nasa")
	client := &http.Client{Timeout: 30 * time.Second}
	today := time.Now().UTC()
	startDate := today.AddDate(0, 0, -5).Format("2006-01-02")
	endDate := today.Format("2006-01-02")

	requests := []struct {
		name   string
		path   string
		params url.Values
	}{
		{
			name: "today",
			path: filepath.Join(outputDir, "apod-today.json"),
			params: url.Values{
				"thumbs": {"true"},
			},
		},
		{
			name: "random",
			path: filepath.Join(outputDir, "apod-random.json"),
			params: url.Values{
				"end_date":   {endDate},
				"start_date": {startDate},
				"thumbs":     {"true"},
			},
		},
	}

	for _, item := range requests {
		item.params.Set("api_key", apiKey)
		body, err := fetchNASAData(client, item.name, item.params)
		if err != nil {
			return err
		}
		if err := writePublicFile(item.path, body); err != nil {
			return fmt.Errorf("write NASA APOD %s data: %w", item.name, err)
		}
	}

	return nil
}

func fetchNASAData(client *http.Client, name string, params url.Values) ([]byte, error) {
	endpoint := url.URL{
		Scheme:   "https",
		Host:     "api.nasa.gov",
		Path:     "/planetary/apod",
		RawQuery: params.Encode(),
	}

	request, err := http.NewRequest(http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("build NASA APOD %s request: %w", name, err)
	}
	request.Header.Set("Accept", "application/json")

	var lastErr error
	for attempt := 1; attempt <= 3; attempt++ {
		response, err := client.Do(request.Clone(request.Context()))
		if err != nil {
			lastErr = err
			time.Sleep(time.Duration(attempt) * time.Second)
			continue
		}

		body, readErr := io.ReadAll(io.LimitReader(response.Body, 2<<20))
		closeErr := response.Body.Close()
		if readErr != nil {
			return nil, fmt.Errorf("read NASA APOD %s data: %w", name, readErr)
		}
		if closeErr != nil {
			return nil, fmt.Errorf("close NASA APOD %s response: %w", name, closeErr)
		}
		if response.StatusCode == http.StatusOK {
			return body, nil
		}

		lastErr = fmt.Errorf("unexpected status %d", response.StatusCode)
		if response.StatusCode != http.StatusTooManyRequests && response.StatusCode < http.StatusInternalServerError {
			break
		}
		time.Sleep(time.Duration(attempt) * time.Second)
	}

	return nil, fmt.Errorf("fetch NASA APOD %s data: %w", name, lastErr)
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
	return filepath.Join(outputDir, routeOutputRelativePath(route))
}

func routeOutputRelativePath(route string) string {
	switch route {
	case "/":
		return "index.html"
	case "/404":
		return "404.html"
	default:
		parts := strings.Split(strings.TrimPrefix(path.Clean(route), "/"), "/")
		return filepath.Join(append(parts, "index.html")...)
	}
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
		return strings.HasPrefix(key, "data-") && strings.HasSuffix(key, "-url")
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
	if err := mkdirPublicAll(cleanedOutputDir); err != nil {
		return fmt.Errorf("create output dir %q: %w", cleanedOutputDir, err)
	}
	return nil
}

func copyDir(source string, destination string) error {
	info, err := os.Lstat(source)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return fmt.Errorf("%q is not a directory", source)
	}

	if err := mkdirPublicAll(destination); err != nil {
		return err
	}

	sourceRoot, err := os.OpenRoot(source)
	if err != nil {
		return err
	}
	defer sourceRoot.Close()

	destinationRoot, err := os.OpenRoot(destination)
	if err != nil {
		return err
	}
	defer destinationRoot.Close()

	return filepath.WalkDir(source, func(sourcePath string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}

		relativePath, err := filepath.Rel(source, sourcePath)
		if err != nil {
			return err
		}
		if relativePath == "." {
			return nil
		}

		if entry.IsDir() {
			return mkdirPublicRootAll(destinationRoot, relativePath)
		}

		if !entry.Type().IsRegular() {
			return nil
		}

		return copyRootFile(sourceRoot, relativePath, destinationRoot, relativePath)
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

func copyFileIfExists(source string, destination string) error {
	info, err := os.Lstat(source)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	if info.IsDir() {
		return fmt.Errorf("%q is a directory", source)
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("%q is not a regular file", source)
	}

	return copyFile(source, destination)
}

func copyFile(source string, destination string) error {
	source = filepath.Clean(source)
	destination = filepath.Clean(destination)

	sourceRoot, err := os.OpenRoot(filepath.Dir(source))
	if err != nil {
		return err
	}
	defer sourceRoot.Close()

	if err := mkdirPublicAll(filepath.Dir(destination)); err != nil {
		return err
	}

	destinationRoot, err := os.OpenRoot(filepath.Dir(destination))
	if err != nil {
		return err
	}
	defer destinationRoot.Close()

	return copyRootFile(sourceRoot, filepath.Base(source), destinationRoot, filepath.Base(destination))
}

func copyRootFile(sourceRoot *os.Root, source string, destinationRoot *os.Root, destination string) error {
	source = filepath.Clean(source)
	destination = filepath.Clean(destination)

	info, err := sourceRoot.Lstat(source)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("%q is not a regular file", source)
	}

	if err := mkdirPublicRootAll(destinationRoot, filepath.Dir(destination)); err != nil {
		return err
	}

	sourceFile, err := sourceRoot.Open(source)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destinationFile, err := destinationRoot.OpenFile(destination, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, publicFileMode) // #nosec G304 G306 -- Root confines the path and exported site artifacts are intentionally public.
	if err != nil {
		return err
	}
	defer destinationFile.Close()

	_, err = io.Copy(destinationFile, sourceFile)
	return err
}

func writePublicFile(filePath string, body []byte) error {
	cleanedPath := filepath.Clean(filePath)
	if err := mkdirPublicAll(filepath.Dir(cleanedPath)); err != nil {
		return err
	}

	root, err := os.OpenRoot(filepath.Dir(cleanedPath))
	if err != nil {
		return err
	}
	defer root.Close()

	return root.WriteFile(filepath.Base(cleanedPath), body, publicFileMode) // #nosec G306 -- exported site artifacts are intentionally public.
}

func mkdirPublicAll(dir string) error {
	return os.MkdirAll(dir, publicDirMode) // #nosec G301 -- exported site directories must be readable by GitHub Pages.
}

func mkdirPublicRootAll(root *os.Root, dir string) error {
	return root.MkdirAll(filepath.Clean(dir), publicDirMode) // #nosec G301 -- exported site directories must be readable by GitHub Pages.
}

func envString(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}
