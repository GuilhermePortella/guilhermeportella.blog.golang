package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

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
		{route: "/blog", want: true},
		{route: "/blog/um-post", want: true},
		{route: "/jogos", want: true},
		{route: "/jogos/memoria-relampago", want: true},
		{route: "/games", want: true},
		{route: "/projetos", want: true},
		{route: "/projects", want: true},
		{route: "/blog/um/post", want: false},
		{route: "/jogos/memoria/extra", want: false},
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
		{route: "/blog", want: filepath.Join("dist", "blog", "index.html")},
		{route: "/blog/um-post", want: filepath.Join("dist", "blog", "um-post", "index.html")},
		{route: "/jogos", want: filepath.Join("dist", "jogos", "index.html")},
		{route: "/jogos/memoria-relampago", want: filepath.Join("dist", "jogos", "memoria-relampago", "index.html")},
		{route: "/projetos", want: filepath.Join("dist", "projetos", "index.html")},
		{route: "/projects", want: filepath.Join("dist", "projects", "index.html")},
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
	raw := []byte(`<html><head><link rel="canonical" href="/blog"></head><body><a href="/">Home</a><img src="/static/img.png"><a data-url="/blog/post" href="#fim">Fim</a></body></html>`)
	got, err := rewriteRootRelativeURLs(raw, "/repo")
	if err != nil {
		t.Fatal(err)
	}

	output := string(got)
	for _, want := range []string{`href="/repo/blog"`, `href="/repo/"`, `src="/repo/static/img.png"`, `data-url="/repo/blog/post"`, `href="#fim"`} {
		if !strings.Contains(output, want) {
			t.Fatalf("rewritten HTML does not contain %q: %s", want, output)
		}
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
