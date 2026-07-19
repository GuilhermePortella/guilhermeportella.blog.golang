package main

import (
	"bytes"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"golang.org/x/net/html"
)

var exportedSiteOnce struct {
	sync.Once
	outputDir string
	err       error
}

func TestNormalizeInternalRoute(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want string
		ok   bool
	}{
		{name: "root", raw: "/", want: "/", ok: true},
		{name: "trailing slash", raw: "/blog/um-post/", want: "/blog/um-post", ok: true},
		{name: "query and fragment", raw: "/blog/um-post?utm=1#titulo", want: "/blog/um-post", ok: true},
		{name: "same site absolute", raw: "https://guilhermeportella.github.io/notas", want: "/notas", ok: true},
		{name: "external absolute", raw: "https://example.com/notas", ok: false},
		{name: "anchor", raw: "#blog", ok: false},
		{name: "relative", raw: "blog/um-post", ok: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, ok := normalizeInternalRoute(test.raw)
			if ok != test.ok {
				t.Fatalf("ok = %v, want %v", ok, test.ok)
			}
			if got != test.want {
				t.Fatalf("route = %q, want %q", got, test.want)
			}
		})
	}
}

func TestShouldExportRoute(t *testing.T) {
	tests := []struct {
		route string
		want  bool
	}{
		{route: "/", want: true},
		{route: "/404", want: true},
		{route: "/erro", want: true},
		{route: "/astronomia", want: true},
		{route: "/blog", want: true},
		{route: "/blog/um-post", want: true},
		{route: "/jogos", want: true},
		{route: "/jogos/memoria-relampago", want: true},
		{route: "/jogos/paciencia-klondike", want: true},
		{route: "/jogos/dama-brasileira", want: true},
		{route: "/jogos/snake", want: true},
		{route: "/jogos/soma-rapida", want: true},
		{route: "/games", want: true},
		{route: "/projetos", want: true},
		{route: "/projects", want: true},
		{route: "/rick-morty", want: true},
		{route: "/blog/um/post", want: false},
		{route: "/jogos/memoria/extra", want: false},
		{route: "/rick-morty/personagem/1", want: false},
		{route: "/static/css/main.css", want: false},
		{route: "/estado-de-espirito", want: false},
	}

	for _, test := range tests {
		t.Run(test.route, func(t *testing.T) {
			if got := shouldExportRoute(test.route); got != test.want {
				t.Fatalf("shouldExportRoute(%q) = %v, want %v", test.route, got, test.want)
			}
		})
	}
}

func TestRouteOutputPath(t *testing.T) {
	tests := []struct {
		route string
		want  string
	}{
		{route: "/", want: filepath.Join("dist", "index.html")},
		{route: "/404", want: filepath.Join("dist", "404.html")},
		{route: "/erro", want: filepath.Join("dist", "erro", "index.html")},
		{route: "/astronomia", want: filepath.Join("dist", "astronomia", "index.html")},
		{route: "/blog", want: filepath.Join("dist", "blog", "index.html")},
		{route: "/blog/um-post", want: filepath.Join("dist", "blog", "um-post", "index.html")},
		{route: "/jogos", want: filepath.Join("dist", "jogos", "index.html")},
		{route: "/jogos/memoria-relampago", want: filepath.Join("dist", "jogos", "memoria-relampago", "index.html")},
		{route: "/jogos/paciencia-klondike", want: filepath.Join("dist", "jogos", "paciencia-klondike", "index.html")},
		{route: "/jogos/dama-brasileira", want: filepath.Join("dist", "jogos", "dama-brasileira", "index.html")},
		{route: "/jogos/snake", want: filepath.Join("dist", "jogos", "snake", "index.html")},
		{route: "/jogos/soma-rapida", want: filepath.Join("dist", "jogos", "soma-rapida", "index.html")},
		{route: "/projetos", want: filepath.Join("dist", "projetos", "index.html")},
		{route: "/projects", want: filepath.Join("dist", "projects", "index.html")},
		{route: "/rick-morty", want: filepath.Join("dist", "rick-morty", "index.html")},
	}

	for _, test := range tests {
		t.Run(test.route, func(t *testing.T) {
			if got := routeOutputPath("dist", test.route); got != test.want {
				t.Fatalf("routeOutputPath(%q) = %q, want %q", test.route, got, test.want)
			}
		})
	}
}

func TestRewriteRootRelativeURLs(t *testing.T) {
	raw := []byte(`<html><head><link rel="canonical" href="/blog"></head><body><a href="/">Home</a><img src="/static/img.png"><section data-apod-today-url="/static/data/nasa/apod-today.json"></section><a data-url="/blog/post" href="#fim">Fim</a></body></html>`)
	got, err := rewriteRootRelativeURLs(raw, "/repo")
	if err != nil {
		t.Fatal(err)
	}

	output := string(got)
	for _, want := range []string{`href="/repo/blog"`, `href="/repo/"`, `src="/repo/static/img.png"`, `data-apod-today-url="/repo/static/data/nasa/apod-today.json"`, `data-url="/repo/blog/post"`, `href="#fim"`} {
		if !strings.Contains(output, want) {
			t.Fatalf("rewritten HTML does not contain %q: %s", want, output)
		}
	}
}

func TestWriteNASADataSkipsWhenAPIKeyIsMissing(t *testing.T) {
	t.Setenv("NASA_API_KEY", "")
	outputDir := t.TempDir()
	exporter := exporter{outputDir: outputDir}

	if err := exporter.writeNASAData(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(outputDir, "static", "data", "nasa", "apod-today.json")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("apod-today.json stat error = %v, want not exist", err)
	}
}

func TestWriteNASADataWritesStaticAPODPayloads(t *testing.T) {
	t.Setenv("NASA_API_KEY", "secret-test-key")

	var requests []url.Values
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Accept"); got != "application/json" {
			t.Fatalf("Accept = %q, want application/json", got)
		}
		requests = append(requests, r.URL.Query())
		w.Header().Set("Content-Type", "application/json")

		if r.URL.Query().Get("start_date") != "" {
			_, _ = w.Write([]byte(`[{"title":"Recent APOD","date":"2026-06-20"}]`))
			return
		}
		_, _ = w.Write([]byte(`{"title":"Today APOD","date":"2026-06-24"}`))
	}))
	defer server.Close()
	restore := withNASAAPODEndpoint(t, server.URL)

	outputDir := t.TempDir()
	exporter := exporter{outputDir: outputDir}
	if err := exporter.writeNASAData(); err != nil {
		t.Fatal(err)
	}
	restore()

	assertFileContent(t, filepath.Join(outputDir, "static", "data", "nasa", "apod-today.json"), `{"title":"Today APOD","date":"2026-06-24"}`)
	assertFileContent(t, filepath.Join(outputDir, "static", "data", "nasa", "apod-random.json"), `[{"title":"Recent APOD","date":"2026-06-20"}]`)

	if len(requests) != 2 {
		t.Fatalf("requests = %d, want 2", len(requests))
	}
	for _, query := range requests {
		if got := query.Get("api_key"); got != "secret-test-key" {
			t.Fatalf("api_key = %q, want secret-test-key", got)
		}
		if got := query.Get("thumbs"); got != "true" {
			t.Fatalf("thumbs = %q, want true", got)
		}
	}
	if got := requests[1].Get("start_date"); got == "" {
		t.Fatal("second NASA request did not include start_date")
	}
	if got := requests[1].Get("end_date"); got == "" {
		t.Fatal("second NASA request did not include end_date")
	}
}

func TestFetchNASADataReturnsStatusError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "forbidden", http.StatusForbidden)
	}))
	defer server.Close()
	withNASAAPODEndpoint(t, server.URL)

	_, err := fetchNASAData(server.Client(), "today", url.Values{"api_key": {"secret"}})
	if err == nil {
		t.Fatal("fetchNASAData() error = nil, want error")
	}
	if !strings.Contains(err.Error(), "unexpected status 403") {
		t.Fatalf("fetchNASAData() error = %v, want status 403", err)
	}
}

func TestExportedSiteHasNoBrokenLocalReferences(t *testing.T) {
	outputDir := exportSiteForTest(t)
	for _, generatedFile := range []string{"feed.xml", "robots.txt", "sitemap.xml"} {
		if _, err := os.Stat(filepath.Join(outputDir, generatedFile)); err != nil {
			t.Fatalf("export did not write %s: %v", generatedFile, err)
		}
	}

	var checked int
	err := filepath.WalkDir(outputDir, func(filePath string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || filepath.Ext(filePath) != ".html" {
			return nil
		}

		raw, err := os.ReadFile(filePath)
		if err != nil {
			return err
		}

		for _, legacy := range []string{
			"https://guilhermeportella.github.io/guilhermeportella.blog.golang",
			"estado-de-espirito",
		} {
			if bytes.Contains(raw, []byte(legacy)) {
				t.Fatalf("%s contains legacy reference %q", filePath, legacy)
			}
		}

		root, err := html.Parse(bytes.NewReader(raw))
		if err != nil {
			return err
		}

		for _, ref := range localHTMLReferences(root) {
			targetPath, ok := localReferencePath(ref)
			if !ok {
				continue
			}
			checked++

			outputPath := localReferenceOutputPath(outputDir, targetPath)
			info, err := os.Stat(outputPath)
			if err != nil {
				t.Fatalf("%s references missing local target %q (%s)", filePath, ref, outputPath)
			}
			if info.IsDir() {
				t.Fatalf("%s references directory target %q (%s)", filePath, ref, outputPath)
			}
		}

		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if checked == 0 {
		t.Fatal("checked 0 local references")
	}
}

func TestExportedSiteHasSEOContracts(t *testing.T) {
	outputDir := exportSiteForTest(t)
	sitemapLocations := readSitemapLocations(t, filepath.Join(outputDir, "sitemap.xml"))

	err := filepath.WalkDir(outputDir, func(filePath string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || filepath.Ext(filePath) != ".html" {
			return nil
		}

		route := routeFromExportedHTML(t, outputDir, filePath)
		raw, err := os.ReadFile(filePath)
		if err != nil {
			return err
		}
		root, err := html.Parse(bytes.NewReader(raw))
		if err != nil {
			return fmt.Errorf("parse %s: %w", filePath, err)
		}

		meta := extractSEOMetadata(root)
		if meta.Lang != "pt-BR" {
			t.Fatalf("%s lang = %q, want pt-BR", filePath, meta.Lang)
		}
		if strings.TrimSpace(meta.Title) == "" {
			t.Fatalf("%s is missing <title>", filePath)
		}
		if strings.TrimSpace(meta.Description) == "" {
			t.Fatalf("%s is missing meta description", filePath)
		}
		if meta.H1Count != 1 {
			t.Fatalf("%s has %d h1 elements, want 1", filePath, meta.H1Count)
		}

		requiredSocial := map[string]string{
			"og:type":             meta.OpenGraphType,
			"og:site_name":        meta.OpenGraphSiteName,
			"og:title":            meta.OpenGraphTitle,
			"og:description":      meta.OpenGraphDescription,
			"og:url":              meta.OpenGraphURL,
			"og:image":            meta.OpenGraphImage,
			"twitter:card":        meta.TwitterCard,
			"twitter:title":       meta.TwitterTitle,
			"twitter:description": meta.TwitterDescription,
			"twitter:image":       meta.TwitterImage,
		}
		for name, value := range requiredSocial {
			if strings.TrimSpace(value) == "" {
				t.Fatalf("%s is missing %s metadata", filePath, name)
			}
		}

		canonical, err := url.Parse(meta.CanonicalURL)
		if err != nil || canonical.Scheme != "https" || canonical.Host != "guilhermeportella.github.io" {
			t.Fatalf("%s canonical = %q, want absolute production HTTPS URL", filePath, meta.CanonicalURL)
		}
		if meta.OpenGraphURL != meta.CanonicalURL {
			t.Fatalf("%s og:url = %q, want canonical %q", filePath, meta.OpenGraphURL, meta.CanonicalURL)
		}
		if shouldIndexRoute(route) && !sitemapLocations[meta.CanonicalURL] {
			t.Fatalf("%s canonical %q is missing from sitemap.xml", filePath, meta.CanonicalURL)
		}
		if route == "/404" || route == "/erro" {
			if meta.Robots != "noindex, nofollow" {
				t.Fatalf("%s robots = %q, want noindex, nofollow", filePath, meta.Robots)
			}
		}

		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestExportedBlogArticlesHaveValidJSONLD(t *testing.T) {
	outputDir := exportSiteForTest(t)
	var checked int

	err := filepath.WalkDir(filepath.Join(outputDir, "blog"), func(filePath string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || filepath.Base(filePath) != "index.html" || filepath.Dir(filePath) == filepath.Join(outputDir, "blog") {
			return nil
		}

		raw, err := os.ReadFile(filePath)
		if err != nil {
			return err
		}
		root, err := html.Parse(bytes.NewReader(raw))
		if err != nil {
			return fmt.Errorf("parse %s: %w", filePath, err)
		}

		scripts := jsonLDScripts(root)
		if len(scripts) != 1 {
			t.Fatalf("%s has %d JSON-LD scripts, want 1", filePath, len(scripts))
		}

		var data map[string]any
		if err := json.Unmarshal([]byte(scripts[0]), &data); err != nil {
			t.Fatalf("%s has invalid JSON-LD: %v\n%s", filePath, err, scripts[0])
		}

		for key, want := range map[string]string{
			"@context": "https://schema.org",
			"@type":    "Article",
		} {
			if data[key] != want {
				t.Fatalf("%s JSON-LD[%s] = %#v, want %q", filePath, key, data[key], want)
			}
		}
		for _, key := range []string{"headline", "description", "mainEntityOfPage", "datePublished"} {
			if strings.TrimSpace(stringFromJSONLD(data[key])) == "" {
				t.Fatalf("%s JSON-LD is missing %s: %#v", filePath, key, data)
			}
		}

		author, ok := data["author"].(map[string]any)
		if !ok || strings.TrimSpace(stringFromJSONLD(author["name"])) == "" {
			t.Fatalf("%s JSON-LD author is missing name: %#v", filePath, data["author"])
		}
		checked++
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if checked == 0 {
		t.Fatal("checked 0 blog article JSON-LD scripts")
	}
}

func TestNormalizeBasePath(t *testing.T) {
	tests := []struct {
		raw  string
		want string
	}{
		{raw: "", want: ""},
		{raw: "/", want: ""},
		{raw: "repo", want: "/repo"},
		{raw: "/repo/", want: "/repo"},
		{raw: "/repo/site", want: "/repo/site"},
	}

	for _, test := range tests {
		t.Run(test.raw, func(t *testing.T) {
			got, err := normalizeBasePath(test.raw)
			if err != nil {
				t.Fatal(err)
			}
			if got != test.want {
				t.Fatalf("normalizeBasePath(%q) = %q, want %q", test.raw, got, test.want)
			}
		})
	}
}

func TestNormalizeSiteURL(t *testing.T) {
	tests := []struct {
		raw     string
		want    string
		wantErr bool
	}{
		{raw: "https://guilhermeportella.github.io", want: "https://guilhermeportella.github.io"},
		{raw: "https://guilhermeportella.github.io/", want: "https://guilhermeportella.github.io"},
		{raw: "https://example.com/site/", want: "https://example.com/site"},
		{raw: "", wantErr: true},
		{raw: "guilhermeportella.github.io", wantErr: true},
		{raw: "ftp://example.com", wantErr: true},
		{raw: "https://example.com?utm=1", wantErr: true},
	}

	for _, test := range tests {
		t.Run(test.raw, func(t *testing.T) {
			got, err := normalizeSiteURL(test.raw)
			if test.wantErr {
				if err == nil {
					t.Fatalf("normalizeSiteURL(%q) = %q, want error", test.raw, got)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got != test.want {
				t.Fatalf("normalizeSiteURL(%q) = %q, want %q", test.raw, got, test.want)
			}
		})
	}
}

func TestShouldIndexRoute(t *testing.T) {
	tests := []struct {
		route string
		want  bool
	}{
		{route: "/", want: true},
		{route: "/blog", want: true},
		{route: "/blog/um-post", want: true},
		{route: "/jogos/snake", want: true},
		{route: "/404", want: false},
		{route: "/erro", want: false},
		{route: "/articles", want: false},
		{route: "/games", want: false},
		{route: "/projects", want: false},
		{route: "/curiosidades/rick-and-morty", want: false},
	}

	for _, test := range tests {
		t.Run(test.route, func(t *testing.T) {
			if got := shouldIndexRoute(test.route); got != test.want {
				t.Fatalf("shouldIndexRoute(%q) = %v, want %v", test.route, got, test.want)
			}
		})
	}
}

func TestCanonicalSitemapRoute(t *testing.T) {
	tests := []struct {
		route string
		want  string
	}{
		{route: "/", want: "/"},
		{route: "/about", want: "/about/"},
		{route: "/astronomia", want: "/astronomia/"},
		{route: "/curiosidades", want: "/curiosidades/"},
		{route: "/jogos", want: "/jogos/"},
		{route: "/jogos/snake", want: "/jogos/snake/"},
		{route: "/projetos", want: "/projetos/"},
		{route: "/rick-morty", want: "/rick-morty/"},
		{route: "/blog", want: "/blog"},
		{route: "/blog/um-comeco-sem-pressa", want: "/blog/um-comeco-sem-pressa"},
		{route: "/notas", want: "/notas"},
	}

	for _, test := range tests {
		t.Run(test.route, func(t *testing.T) {
			if got := canonicalSitemapRoute(test.route); got != test.want {
				t.Fatalf("canonicalSitemapRoute(%q) = %q, want %q", test.route, got, test.want)
			}
		})
	}
}

func TestWriteSitemapAndRobots(t *testing.T) {
	outputDir := t.TempDir()
	exporter := exporter{
		outputDir: outputDir,
		basePath:  "/repo",
		siteURL:   "https://example.com",
	}

	routes := []string{
		"/",
		"/404",
		"/about",
		"/astronomia",
		"/articles",
		"/blog",
		"/blog/um-comeco-sem-pressa",
		"/curiosidades/rick-and-morty",
		"/erro",
		"/games",
		"/jogos/snake",
		"/notas",
		"/projects",
	}

	if err := exporter.writeSitemap(routes); err != nil {
		t.Fatal(err)
	}
	if err := exporter.writeRobots(); err != nil {
		t.Fatal(err)
	}

	robots, err := os.ReadFile(filepath.Join(outputDir, "robots.txt"))
	if err != nil {
		t.Fatal(err)
	}
	if want := "Sitemap: https://example.com/repo/sitemap.xml"; !strings.Contains(string(robots), want) {
		t.Fatalf("robots.txt does not contain %q:\n%s", want, robots)
	}

	sitemap, err := os.ReadFile(filepath.Join(outputDir, "sitemap.xml"))
	if err != nil {
		t.Fatal(err)
	}

	var parsed struct {
		URLs []struct {
			Location string `xml:"loc"`
		} `xml:"url"`
	}
	if err := xml.Unmarshal(sitemap, &parsed); err != nil {
		t.Fatalf("parse sitemap.xml: %v\n%s", err, sitemap)
	}

	locations := make(map[string]bool, len(parsed.URLs))
	for _, item := range parsed.URLs {
		locations[item.Location] = true
	}
	for _, want := range []string{
		"https://example.com/repo/",
		"https://example.com/repo/astronomia/",
		"https://example.com/repo/blog",
		"https://example.com/repo/blog/um-comeco-sem-pressa",
		"https://example.com/repo/jogos/snake/",
	} {
		if !locations[want] {
			t.Fatalf("sitemap.xml does not contain %q; locations=%v", want, locations)
		}
	}
	for _, unwanted := range []string{
		"https://example.com/repo/404",
		"https://example.com/repo/erro",
		"https://example.com/repo/articles",
		"https://example.com/repo/games",
		"https://example.com/repo/projects",
		"https://example.com/repo/curiosidades/rick-and-morty",
	} {
		if locations[unwanted] {
			t.Fatalf("sitemap.xml contains non-canonical route %q", unwanted)
		}
	}
}

func TestWriteFeed(t *testing.T) {
	projectRoot, err := findProjectRoot()
	if err != nil {
		t.Fatal(err)
	}

	outputDir := t.TempDir()
	exporter := exporter{
		outputDir:  outputDir,
		contentDir: filepath.Join(projectRoot, "content", "articles"),
		basePath:   "/repo",
		siteURL:    "https://example.com",
	}

	if err := exporter.writeFeed(); err != nil {
		t.Fatal(err)
	}

	raw, err := os.ReadFile(filepath.Join(outputDir, "feed.xml"))
	if err != nil {
		t.Fatal(err)
	}

	var parsed struct {
		XMLName xml.Name `xml:"rss"`
	}
	if err := xml.Unmarshal(raw, &parsed); err != nil {
		t.Fatalf("parse feed.xml: %v\n%s", err, raw)
	}

	output := string(raw)
	for _, want := range []string{
		`<title>Guilherme Portella - artigos</title>`,
		`<link>https://example.com/repo/blog</link>`,
		`<atom:link href="https://example.com/repo/feed.xml" rel="self" type="application/rss+xml"></atom:link>`,
		`<title>Estruturando um serviço Go para crescer com segurança</title>`,
		`<link>https://example.com/repo/blog/um-comeco-sem-pressa</link>`,
		`<guid isPermaLink="true">https://example.com/repo/blog/um-comeco-sem-pressa</guid>`,
		`<pubDate>Sun, 03 May 2026 00:00:00 +0000</pubDate>`,
		`<category>Go</category>`,
	} {
		if !strings.Contains(output, want) {
			t.Fatalf("feed.xml does not contain %q:\n%s", want, output)
		}
	}
	if strings.Count(output, "<item>") == 0 {
		t.Fatalf("feed.xml has no items:\n%s", output)
	}
}

func TestRSSPubDateSupportsRFC3339AndInvalidValues(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want string
	}{
		{name: "date only", raw: "2026-05-04", want: "Mon, 04 May 2026 00:00:00 +0000"},
		{name: "rfc3339", raw: "2026-05-04T18:20:30-03:00", want: "Mon, 04 May 2026 21:20:30 +0000"},
		{name: "invalid", raw: "sem data", want: ""},
		{name: "blank", raw: " ", want: ""},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := rssPubDate(test.raw); got != test.want {
				t.Fatalf("rssPubDate(%q) = %q, want %q", test.raw, got, test.want)
			}
		})
	}
}

func TestCopyHelpersCopyFilesAndDirectories(t *testing.T) {
	root := t.TempDir()
	sourceDir := filepath.Join(root, "source")
	if err := os.MkdirAll(filepath.Join(sourceDir, "nested"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sourceDir, "nested", "file.txt"), []byte("conteudo"), 0o644); err != nil {
		t.Fatal(err)
	}

	destinationDir := filepath.Join(root, "destination")
	if err := copyDir(sourceDir, destinationDir); err != nil {
		t.Fatalf("copyDir() error = %v", err)
	}
	assertFileContent(t, filepath.Join(destinationDir, "nested", "file.txt"), "conteudo")

	if err := copyDirIfExists(filepath.Join(root, "missing-dir"), filepath.Join(root, "unused")); err != nil {
		t.Fatalf("copyDirIfExists(missing) error = %v", err)
	}
	if err := copyDirIfExists(filepath.Join(sourceDir, "nested", "file.txt"), filepath.Join(root, "bad-dir")); err == nil {
		t.Fatal("copyDirIfExists(file) error = nil, want error")
	}

	sourceFile := filepath.Join(root, "source-file.txt")
	if err := os.WriteFile(sourceFile, []byte("arquivo"), 0o644); err != nil {
		t.Fatal(err)
	}
	destinationFile := filepath.Join(root, "copied", "file.txt")
	if err := copyFile(sourceFile, destinationFile); err != nil {
		t.Fatalf("copyFile() error = %v", err)
	}
	assertFileContent(t, destinationFile, "arquivo")

	if err := copyFileIfExists(filepath.Join(root, "missing-file.txt"), filepath.Join(root, "unused-file.txt")); err != nil {
		t.Fatalf("copyFileIfExists(missing) error = %v", err)
	}
	if err := copyFileIfExists(sourceDir, filepath.Join(root, "bad-file.txt")); err == nil {
		t.Fatal("copyFileIfExists(directory) error = nil, want error")
	}
}

func TestResetOutputDirRecreatesDirectoryAndRejectsFiles(t *testing.T) {
	projectRoot, err := findProjectRoot()
	if err != nil {
		t.Fatal(err)
	}
	tmpRoot := filepath.Join(projectRoot, "tmp")
	if err := os.MkdirAll(tmpRoot, 0o755); err != nil {
		t.Fatal(err)
	}

	outputDir, err := os.MkdirTemp(tmpRoot, "reset-output-*")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := os.RemoveAll(outputDir); err != nil {
			t.Fatalf("remove output dir: %v", err)
		}
	})

	staleFile := filepath.Join(outputDir, "stale.txt")
	if err := os.WriteFile(staleFile, []byte("stale"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := resetOutputDir(outputDir); err != nil {
		t.Fatalf("resetOutputDir() error = %v", err)
	}
	if _, err := os.Stat(staleFile); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("stale file stat error = %v, want not exist", err)
	}
	if info, err := os.Stat(outputDir); err != nil || !info.IsDir() {
		t.Fatalf("output dir stat = (%v, %v), want existing dir", info, err)
	}

	outputFile := filepath.Join(tmpRoot, "reset-output-file")
	if err := os.WriteFile(outputFile, []byte("not a dir"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := os.Remove(outputFile); err != nil && !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("remove output file: %v", err)
		}
	})

	if err := resetOutputDir(outputFile); err == nil {
		t.Fatal("resetOutputDir(file) error = nil, want error")
	}
}

func localHTMLReferences(root *html.Node) []string {
	var refs []string
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node == nil {
			return
		}

		for _, attr := range node.Attr {
			if isReferenceAttr(node, attr.Key) {
				refs = append(refs, attr.Val)
			}
		}

		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(root)

	return refs
}

type seoMetadata struct {
	Lang                 string
	Title                string
	Description          string
	Robots               string
	CanonicalURL         string
	OpenGraphType        string
	OpenGraphSiteName    string
	OpenGraphTitle       string
	OpenGraphDescription string
	OpenGraphURL         string
	OpenGraphImage       string
	TwitterCard          string
	TwitterTitle         string
	TwitterDescription   string
	TwitterImage         string
	H1Count              int
}

func exportSiteForTest(t *testing.T) string {
	t.Helper()

	if raceDetectorEnabled {
		t.Skip("export contract tests run without -race via cover-check; full static export is too slow under the race detector")
	}

	exportedSiteOnce.Do(func() {
		projectRoot, err := findProjectRoot()
		if err != nil {
			exportedSiteOnce.err = err
			return
		}

		setExportTestEnv(projectRoot)

		tmpRoot := filepath.Join(projectRoot, "tmp")
		if err := os.MkdirAll(tmpRoot, 0o755); err != nil {
			exportedSiteOnce.err = err
			return
		}
		outputDir, err := os.MkdirTemp(tmpRoot, "export-contract-*")
		if err != nil {
			exportedSiteOnce.err = err
			return
		}

		if err := run([]string{"-output", outputDir, "-base-path", "/"}); err != nil {
			_ = os.RemoveAll(outputDir)
			exportedSiteOnce.err = err
			return
		}

		exportedSiteOnce.outputDir = outputDir
	})

	if exportedSiteOnce.err != nil {
		t.Fatal(exportedSiteOnce.err)
	}
	return exportedSiteOnce.outputDir
}

func setExportTestEnv(projectRoot string) {
	_ = os.Setenv("CONTENT_DIR", filepath.Join(projectRoot, "content", "articles"))
	_ = os.Setenv("IMAGES_DIR", filepath.Join(projectRoot, "public", "images"))
	_ = os.Setenv("NASA_API_KEY", "")
	_ = os.Setenv("NOTES_DIR", filepath.Join(projectRoot, "content", "notes"))
	_ = os.Setenv("STATIC_DIR", filepath.Join(projectRoot, "web", "static"))
	_ = os.Setenv("TEMPLATES_DIR", filepath.Join(projectRoot, "web", "templates"))
}

func readSitemapLocations(t *testing.T, sitemapPath string) map[string]bool {
	t.Helper()

	raw, err := os.ReadFile(sitemapPath)
	if err != nil {
		t.Fatal(err)
	}

	var parsed struct {
		URLs []struct {
			Location string `xml:"loc"`
		} `xml:"url"`
	}
	if err := xml.Unmarshal(raw, &parsed); err != nil {
		t.Fatalf("parse sitemap.xml: %v\n%s", err, raw)
	}

	locations := make(map[string]bool, len(parsed.URLs))
	for _, item := range parsed.URLs {
		locations[item.Location] = true
	}
	return locations
}

func routeFromExportedHTML(t *testing.T, outputDir string, filePath string) string {
	t.Helper()

	relative, err := filepath.Rel(outputDir, filePath)
	if err != nil {
		t.Fatal(err)
	}
	relative = filepath.ToSlash(relative)
	switch {
	case relative == "index.html":
		return "/"
	case relative == "404.html":
		return "/404"
	case strings.HasSuffix(relative, "/index.html"):
		return "/" + strings.TrimSuffix(relative, "/index.html")
	default:
		return "/" + strings.TrimSuffix(relative, ".html")
	}
}

func extractSEOMetadata(root *html.Node) seoMetadata {
	var metadata seoMetadata
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node == nil {
			return
		}
		if node.Type == html.ElementNode {
			switch node.Data {
			case "html":
				metadata.Lang = attrValue(node, "lang")
			case "title":
				metadata.Title = strings.TrimSpace(nodeText(node))
			case "meta":
				applySEOMeta(&metadata, node)
			case "link":
				if linkRelContains(node, "canonical") {
					metadata.CanonicalURL = attrValue(node, "href")
				}
			case "h1":
				metadata.H1Count++
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(root)
	return metadata
}

func applySEOMeta(metadata *seoMetadata, node *html.Node) {
	content := attrValue(node, "content")
	switch attrValue(node, "name") {
	case "description":
		metadata.Description = content
	case "robots":
		metadata.Robots = content
	case "twitter:card":
		metadata.TwitterCard = content
	case "twitter:title":
		metadata.TwitterTitle = content
	case "twitter:description":
		metadata.TwitterDescription = content
	case "twitter:image":
		metadata.TwitterImage = content
	}
	switch attrValue(node, "property") {
	case "og:type":
		metadata.OpenGraphType = content
	case "og:site_name":
		metadata.OpenGraphSiteName = content
	case "og:title":
		metadata.OpenGraphTitle = content
	case "og:description":
		metadata.OpenGraphDescription = content
	case "og:url":
		metadata.OpenGraphURL = content
	case "og:image":
		metadata.OpenGraphImage = content
	}
}

func jsonLDScripts(root *html.Node) []string {
	var scripts []string
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node == nil {
			return
		}
		if node.Type == html.ElementNode && node.Data == "script" && attrValue(node, "type") == "application/ld+json" {
			scripts = append(scripts, strings.TrimSpace(nodeText(node)))
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(root)
	return scripts
}

func stringFromJSONLD(value any) string {
	if value == nil {
		return ""
	}
	if text, ok := value.(string); ok {
		return text
	}
	return fmt.Sprint(value)
}

func attrValue(node *html.Node, name string) string {
	for _, attr := range node.Attr {
		if attr.Key == name {
			return strings.TrimSpace(attr.Val)
		}
	}
	return ""
}

func linkRelContains(node *html.Node, rel string) bool {
	for _, item := range strings.Fields(attrValue(node, "rel")) {
		if item == rel {
			return true
		}
	}
	return false
}

func nodeText(node *html.Node) string {
	var builder strings.Builder
	var walk func(*html.Node)
	walk = func(current *html.Node) {
		if current == nil {
			return
		}
		if current.Type == html.TextNode {
			builder.WriteString(current.Data)
		}
		for child := current.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(node)
	return builder.String()
}

func assertFileContent(t *testing.T, path string, want string) {
	t.Helper()

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile(%q) error = %v", path, err)
	}
	if string(raw) != want {
		t.Fatalf("ReadFile(%q) = %q, want %q", path, raw, want)
	}
}

func isReferenceAttr(node *html.Node, key string) bool {
	switch key {
	case "href", "src", "poster", "data-url":
		return true
	case "content":
		return node.Type == html.ElementNode && node.Data == "meta"
	default:
		return false
	}
}

func localReferencePath(raw string) (string, bool) {
	value := strings.TrimSpace(raw)
	if value == "" || strings.HasPrefix(value, "#") {
		return "", false
	}

	parsed, err := url.Parse(value)
	if err != nil {
		return "", false
	}
	if parsed.Scheme != "" || parsed.Host != "" {
		if parsed.Scheme != "https" || parsed.Host != "guilhermeportella.github.io" {
			return "", false
		}
	}
	if parsed.Path == "" || !strings.HasPrefix(parsed.Path, "/") || strings.HasPrefix(parsed.Path, "//") {
		return "", false
	}

	return path.Clean(parsed.Path), true
}

func localReferenceOutputPath(outputDir string, targetPath string) string {
	if filepath.Ext(targetPath) != "" {
		return filepath.Join(outputDir, filepath.FromSlash(strings.TrimPrefix(targetPath, "/")))
	}
	return routeOutputPath(outputDir, targetPath)
}

func TestCleanOutputDirAcceptsSafeProjectPaths(t *testing.T) {
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	projectRoot, err := findProjectRoot()
	if err != nil {
		t.Fatal(err)
	}
	relativeDist, err := filepath.Rel(cwd, filepath.Join(projectRoot, "dist"))
	if err != nil {
		t.Fatal(err)
	}
	relativeTmpExport, err := filepath.Rel(cwd, filepath.Join(projectRoot, "tmp", "export"))
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		raw  string
		want string
	}{
		{raw: relativeDist, want: filepath.Clean(relativeDist)},
		{raw: relativeTmpExport, want: filepath.Clean(relativeTmpExport)},
		{raw: filepath.Join(projectRoot, "dist-absolute"), want: filepath.Join(projectRoot, "dist-absolute")},
	}

	for _, test := range tests {
		t.Run(test.raw, func(t *testing.T) {
			got, err := cleanOutputDir(test.raw)
			if err != nil {
				t.Fatal(err)
			}
			if got != test.want {
				t.Fatalf("cleanOutputDir(%q) = %q, want %q", test.raw, got, test.want)
			}
		})
	}
}

func TestCleanOutputDirRejectsDangerousPaths(t *testing.T) {
	projectRoot, err := findProjectRoot()
	if err != nil {
		t.Fatal(err)
	}

	tests := []string{
		"",
		".",
		"..",
		filepath.Join("..", "dist"),
		filepath.Dir(projectRoot),
		".cache",
		filepath.Join(projectRoot, ".github"),
		filepath.Join(projectRoot, "content"),
		filepath.Join(projectRoot, "web", "static"),
	}

	for _, raw := range tests {
		t.Run(raw, func(t *testing.T) {
			if got, err := cleanOutputDir(raw); err == nil {
				t.Fatalf("cleanOutputDir(%q) = %q, want error", raw, got)
			}
		})
	}
}

func TestCleanOutputDirRejectsExistingFile(t *testing.T) {
	projectRoot, err := findProjectRoot()
	if err != nil {
		t.Fatal(err)
	}

	filePath := filepath.Join(projectRoot, "export-output-file-test")
	if err := os.WriteFile(filePath, []byte("not a directory"), 0o644); err != nil {
		t.Fatal(err)
	}
	defer os.Remove(filePath)

	if got, err := cleanOutputDir(filePath); err == nil {
		t.Fatalf("cleanOutputDir(%q) = %q, want error", filePath, got)
	}
}

func TestCopyDirSkipsSymlinkedFiles(t *testing.T) {
	sourceDir := t.TempDir()
	destinationDir := filepath.Join(t.TempDir(), "public")
	outsideDir := t.TempDir()

	if err := os.WriteFile(filepath.Join(sourceDir, "site.css"), []byte("body{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	secretPath := filepath.Join(outsideDir, "secret.txt")
	if err := os.WriteFile(secretPath, []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(secretPath, filepath.Join(sourceDir, "leak.txt")); err != nil {
		t.Skipf("symlinks are not available: %v", err)
	}

	if err := copyDir(sourceDir, destinationDir); err != nil {
		t.Fatal(err)
	}

	if _, err := os.Stat(filepath.Join(destinationDir, "site.css")); err != nil {
		t.Fatalf("copied regular file missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(destinationDir, "leak.txt")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("symlinked file was copied, err=%v", err)
	}
}

func TestCopyFileIfExistsRejectsSymlink(t *testing.T) {
	sourceDir := t.TempDir()
	destination := filepath.Join(t.TempDir(), "copied.txt")
	target := filepath.Join(sourceDir, "target.txt")
	link := filepath.Join(sourceDir, "link.txt")

	if err := os.WriteFile(target, []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, link); err != nil {
		t.Skipf("symlinks are not available: %v", err)
	}

	if err := copyFileIfExists(link, destination); err == nil {
		t.Fatal("copyFileIfExists(symlink) error = nil, want error")
	}
	if _, err := os.Stat(destination); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("symlink destination was written, err=%v", err)
	}
}

func withNASAAPODEndpoint(t *testing.T, endpoint string) func() {
	t.Helper()
	previous := nasaAPODEndpoint
	nasaAPODEndpoint = endpoint
	restore := func() {
		nasaAPODEndpoint = previous
	}
	t.Cleanup(restore)
	return restore
}
