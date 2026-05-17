package httptransport

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNewRouterHome(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	if got := recorder.Header().Get("Content-Type"); got != "text/html; charset=utf-8" {
		t.Fatalf("Content-Type = %q, want text/html; charset=utf-8", got)
	}

	body := recorder.Body.String()
	if !strings.Contains(body, `<h1 id="home-title">Engenharia de software, backend e arquitetura em notas práticas.</h1>`) {
		t.Fatalf("body does not contain expected home title")
	}

	for _, expected := range []string{
		"guia técnico",
		"Por onde começar",
		"Áreas técnicas",
		"Publicações recentes",
		"Estruturando um serviço Go para crescer com segurança",
		"Sobre este espaço técnico",
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("body does not contain %q", expected)
		}
	}

	if !strings.Contains(body, `<link rel="stylesheet" href="/static/css/main.css?v=20260515-projects">`) {
		t.Fatalf("body does not contain stylesheet")
	}

	if !strings.Contains(body, `<meta http-equiv="Content-Security-Policy"`) || !strings.Contains(body, `<meta name="referrer" content="no-referrer">`) {
		t.Fatalf("body does not contain static security metadata")
	}

	if !strings.Contains(body, `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">`) {
		t.Fatalf("body does not contain Google Fonts stylesheet")
	}

	if !strings.Contains(body, `<script src="/static/js/site.js?v=20260515-projects" defer></script>`) {
		t.Fatalf("body does not contain footer script")
	}

	if !strings.Contains(body, `<nav class="site-nav sticky-top" aria-label="Primary">`) {
		t.Fatalf("body does not contain site navigation")
	}

	if !strings.Contains(body, `<a class="site-brand" href="/" aria-label="Página inicial">Guilherme Portella</a>`) {
		t.Fatalf("body does not contain site brand")
	}

	if !strings.Contains(body, `<a href="/" class="active" aria-current="page">Início</a>`) {
		t.Fatalf("body does not mark home navigation link as active")
	}

	if strings.Contains(body, "HomeAboutSection") {
		t.Fatalf("body contains old analysis content")
	}
}

func TestNewSiteNavigationActiveRoutes(t *testing.T) {
	tests := []struct {
		name       string
		path       string
		wantActive string
	}{
		{name: "home", path: "/", wantActive: "Início"},
		{name: "blog", path: "/blog", wantActive: "Cadernos"},
		{name: "blog slug", path: "/blog/um-post", wantActive: "Cadernos"},
		{name: "articles alias", path: "/articles/", wantActive: "Cadernos"},
		{name: "projects", path: "/projetos", wantActive: "Projetos"},
		{name: "projects alias", path: "/projects/", wantActive: "Projetos"},
		{name: "about", path: "/about/", wantActive: "Sobre"},
		{name: "trailing slash", path: "/curiosidades/", wantActive: "Curiosidades"},
		{name: "notes", path: "/notas", wantActive: "Notas"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var gotActive []string
			for _, link := range newSiteNavigation(test.path) {
				if link.Active {
					gotActive = append(gotActive, link.Label)
				}
			}

			if len(gotActive) != 1 || gotActive[0] != test.wantActive {
				t.Fatalf("active links = %v, want [%s]", gotActive, test.wantActive)
			}
		})
	}
}

func TestNewRouterBlog(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/blog", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	body := recorder.Body.String()
	for _, expected := range []string{
		`<div class="blog-page" aria-label="Blog">`,
		`<a href="/blog" class="active" aria-current="page">Cadernos</a>`,
		"Textos longos sobre engenharia, arquitetura e decisões que merecem ficar.",
		"Ir para curiosidades",
		`class="link-arrow" aria-hidden="true">-&gt;</span>`,
		`data-blog-browser`,
		"Encontrar textos",
		"Filtro de ano e meses",
		"2026 - Maio",
		"2026 - Abril",
		"Estruturando um serviço Go para crescer com segurança",
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("body does not contain %q", expected)
		}
	}

	if strings.Contains(body, "/articles") {
		t.Fatalf("body contains old articles route")
	}

	if strings.Contains(body, "Ir para referências") {
		t.Fatalf("body contains old references label")
	}
}

func TestNewRouterProjetos(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/projetos", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	body := recorder.Body.String()
	for _, expected := range []string{
		`<div class="projects-page" aria-label="Projetos">`,
		`<title>Projetos</title>`,
		`<link rel="canonical" href="/projetos/">`,
		`<a href="/projetos" class="active" aria-current="page">Projetos</a>`,
		`<h1 id="projects-title">Repositórios públicos, experimentos e ferramentas em construção.</h1>`,
		`data-projects-catalog`,
		`data-projects-url="https://api.github.com/users/guilhermeportella/repos?sort=pushed&amp;per_page=100"`,
		`data-projects-page-size="8"`,
		`Filtrar projetos por linguagem`,
		`Atividade recente`,
		`Abrir perfil`,
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("body does not contain %q", expected)
		}
	}

	if got := recorder.Header().Get("Content-Security-Policy"); !strings.Contains(got, "connect-src 'self' https://api.github.com") {
		t.Fatalf("Content-Security-Policy = %q, want GitHub connect-src", got)
	}
}

func TestNewRouterProjectsAlias(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/projects/", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	body := recorder.Body.String()
	for _, expected := range []string{
		`<title>Projetos</title>`,
		`<link rel="canonical" href="/projetos/">`,
		`<a href="/projetos" class="active" aria-current="page">Projetos</a>`,
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("body does not contain %q", expected)
		}
	}
}

func TestNewRouterCuriosidades(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/curiosidades/", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	body := recorder.Body.String()
	for _, expected := range []string{
		`<div class="curiosity-page" aria-label="Curiosidades">`,
		`<title>Curiosidades</title>`,
		`<link rel="canonical" href="/curiosidades/">`,
		`<a href="/curiosidades" class="active" aria-current="page">Curiosidades</a>`,
		`<h1 id="curiosity-title">Um inventário de gostos para lembrar quem eu sou quando fecho o notebook.</h1>`,
		`id="mapa"`,
		`Ver a coleção completa`,
		`id="colecao"`,
		`Interstellar (Nolan)`,
		`DEATH STRANDING 2: ON THE BEACH`,
		`YouTube: canais de programação e desenvolvimento`,
		`data-spotify-resource="spotify:track:44AyOl4qVkzS48vBsbNXaC"`,
		`https://open.spotify.com/embed/track/44AyOl4qVkzS48vBsbNXaC`,
		`https://open.spotify.com/embed/track/3YRCqOhFifThpSRFJ1VWFM`,
		`data-spotify-resource="spotify:playlist:25cIH9UZsoIYdLxLu3F2jw"`,
		`Minha trilha sonora pessoal`,
		`Playlist 1`,
		`Playlist 2`,
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("body does not contain %q", expected)
		}
	}

	if got := recorder.Header().Get("Content-Security-Policy"); !strings.Contains(got, "frame-src https://open.spotify.com") {
		t.Fatalf("Content-Security-Policy = %q, want Spotify frame-src", got)
	}

	if got := recorder.Header().Get("Content-Security-Policy"); !strings.Contains(got, "script-src 'self' https://open.spotify.com") {
		t.Fatalf("Content-Security-Policy = %q, want Spotify script-src", got)
	}
}

func TestPrepareBlogArticlesSearchTextExcludesTags(t *testing.T) {
	articles := prepareBlogArticles([]blogArticle{
		{
			Title:       "Titulo simples",
			Summary:     "Resumo curto",
			Content:     "Conteudo do artigo",
			PublishedAt: "2026-05-04",
			Tags:        []string{"tag-apenas-metadado"},
		},
	})

	if len(articles) != 1 {
		t.Fatalf("len(articles) = %d, want 1", len(articles))
	}

	if strings.Contains(articles[0].SearchText, "tag-apenas-metadado") {
		t.Fatalf("SearchText = %q, want tags excluded", articles[0].SearchText)
	}

	for _, expected := range []string{"Titulo simples", "Resumo curto", "Conteudo do artigo"} {
		if !strings.Contains(articles[0].SearchText, expected) {
			t.Fatalf("SearchText = %q, want %q", articles[0].SearchText, expected)
		}
	}
}

func TestNewRouterBlogTrailingSlash(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/blog/", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
}

func TestNewRouterAbout(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/about/", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	body := recorder.Body.String()
	for _, expected := range []string{
		`<div class="about-page" aria-label="Sobre">`,
		`<title>Sobre</title>`,
		`<meta name="description" content="Perfil técnico de Guilherme Portella, com foco em carreira, engenharia de software e aprendizados de desenvolvimento web.">`,
		`<link rel="canonical" href="/about/">`,
		`<meta property="og:type" content="website">`,
		`<meta property="og:locale" content="pt_BR">`,
		`<meta property="og:image" content="https://guilhermeportella.github.io/guilhermeportella.blog.golang/static/images/social-default.png">`,
		`<meta property="og:image:width" content="1200">`,
		`<meta property="og:image:height" content="630">`,
		`<meta name="twitter:image" content="https://guilhermeportella.github.io/guilhermeportella.blog.golang/static/images/social-default.png">`,
		`<meta name="twitter:card" content="summary_large_image">`,
		`<a href="/about" class="active" aria-current="page">Sobre</a>`,
		`<h1 id="about-title">Guilherme Portella em modo carreira.</h1>`,
		`src="https://avatars.githubusercontent.com/u/59876059?v=4"`,
		`Ler artigos técnicos`,
		`Pilares de trabalho`,
		`Hábitos que deixam o código menos dramático`,
		`guilhermeportella.dev@gmail.com`,
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("body does not contain %q", expected)
		}
	}

	if strings.Contains(body, "<select") {
		t.Fatalf("body contains unexpected select element")
	}
}

func TestNewRouterNotes(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/notas", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	body := recorder.Body.String()
	for _, expected := range []string{
		`<div class="notes-page" aria-label="Notas">`,
		`<a href="/notas" class="active" aria-current="page">Notas</a>`,
		`data-notes-wall`,
		`data-notes-per-page="21"`,
		`data-note-filter="all"`,
		`Parede inteira`,
		`data-note-filter="Go"`,
		`data-note-filter="nota"`,
		`Primeira nota da parede`,
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("body does not contain %q", expected)
		}
	}

	for _, unwanted := range []string{
		`data-blog-search-input`,
		`Buscar por título`,
	} {
		if strings.Contains(body, unwanted) {
			t.Fatalf("body contains unwanted notes search UI %q", unwanted)
		}
	}
}

func TestNewRouterNotesTrailingSlash(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/notas/", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
}

func TestLoadNotesTagFallbackAndSort(t *testing.T) {
	notes, err := loadNotes(filepath.Join("..", "..", "..", "content", "notes"))
	if err != nil {
		t.Fatalf("loadNotes() error = %v", err)
	}

	if len(notes) == 0 {
		t.Fatal("len(notes) = 0, want notes")
	}

	if notes[0].Title != "Primeira nota da parede" {
		t.Fatalf("notes[0].Title = %q, want Primeira nota da parede", notes[0].Title)
	}

	var foundFallback bool
	for _, note := range notes {
		if note.Tag == "nota" {
			foundFallback = true
			break
		}
	}
	if !foundFallback {
		t.Fatal("notes do not include fallback tag nota")
	}

	stats := noteTagStats(notes)
	if len(stats) == 0 || stats[0].Tag != "arquitetura" {
		t.Fatalf("stats = %#v, want first tag arquitetura", stats)
	}
}

func TestNewRouterBlogArticle(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/blog/um-comeco-sem-pressa", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	body := recorder.Body.String()
	for _, expected := range []string{
		`<article class="article-page" aria-labelledby="article-title">`,
		`<a href="/blog" class="active" aria-current="page">Cadernos</a>`,
		`<h1 id="article-title">Estruturando um serviço Go para crescer com segurança</h1>`,
		`<h2 id="um-comeco-que-nao-precisa-correr"><a href="#um-comeco-que-nao-precisa-correr" class="heading-anchor">Um começo que não precisa correr</a></h2>`,
		`data-article-toc`,
		`application/ld+json`,
		"1 min de leitura",
		"Voltar para blog",
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("body does not contain %q", expected)
		}
	}
}

func TestNewRouterBlogArticleFrontmatterSlug(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/blog/separando-camadas", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	if body := recorder.Body.String(); !strings.Contains(body, `<h1 id="article-title">Separando domínio, transporte e infraestrutura</h1>`) {
		t.Fatalf("body does not contain article matched by frontmatter slug")
	}
}

func TestNewRouterBlogArticleNotFound(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/blog/nao-existe", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusNotFound)
	}

	body := recorder.Body.String()
	for _, expected := range []string{
		`<title>Página não encontrada</title>`,
		`<h1 id="not-found-title">Esta página não existe.</h1>`,
		`<code data-not-found-path>/blog/nao-existe</code>`,
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("body does not contain %q", expected)
		}
	}
}

func TestMarkdownArticleLookupAndConversion(t *testing.T) {
	article, err := getMarkdownArticleBySlug(filepath.Join("..", "..", "..", "content", "articles"), "Um Começo sem Pressa")
	if err != nil {
		t.Fatalf("getMarkdownArticleBySlug() error = %v", err)
	}

	if article.Slug != "um-comeco-sem-pressa" {
		t.Fatalf("Slug = %q, want um-comeco-sem-pressa", article.Slug)
	}

	if !strings.Contains(string(article.HTML), `<h2 id="um-comeco-que-nao-precisa-correr">`) {
		t.Fatalf("HTML does not contain heading id")
	}

	if !strings.Contains(stripMarkdown(article.Content), "Um começo que não precisa correr") {
		t.Fatalf("stripMarkdown() did not preserve searchable text")
	}
}

func TestGroupBlogArticlesByMonth(t *testing.T) {
	articles := prepareBlogArticles([]blogArticle{
		{Title: "Old", Slug: "old", PublishedAt: "2025-12-03"},
		{Title: "Recent", Slug: "recent", PublishedAt: "2026-05-03"},
		{Title: "Same month", Slug: "same-month", PublishedAt: "2026-05-01"},
		{Title: "Middle", Slug: "middle", PublishedAt: "2026-04-29"},
	})

	groups := groupBlogArticlesByMonth(articles)
	if len(groups) != 3 {
		t.Fatalf("len(groups) = %d, want 3", len(groups))
	}

	if groups[0].ID != "2026-05" || groups[0].Label != "2026 - Maio" {
		t.Fatalf("groups[0] = %#v, want 2026-05 / 2026 - Maio", groups[0])
	}

	if len(groups[0].Items) != 2 {
		t.Fatalf("len(groups[0].Items) = %d, want 2", len(groups[0].Items))
	}

	if groups[1].ID != "2026-04" || groups[2].ID != "2025-12" {
		t.Fatalf("group order = %s, %s, %s; want 2026-05, 2026-04, 2025-12", groups[0].ID, groups[1].ID, groups[2].ID)
	}

	if articles[0].DateLabel != "3 de maio de 2026" {
		t.Fatalf("DateLabel = %q, want 3 de maio de 2026", articles[0].DateLabel)
	}
}

func TestNewRouterHealthz(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	if got := recorder.Header().Get("Content-Type"); got != "application/json; charset=utf-8" {
		t.Fatalf("Content-Type = %q, want application/json; charset=utf-8", got)
	}

	if got := recorder.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("X-Content-Type-Options = %q, want nosniff", got)
	}

	if got := recorder.Header().Get("X-Request-ID"); got == "" {
		t.Fatal("X-Request-ID is empty")
	}
}

func TestStaticFileServerBlocksDirectoryListingAndHiddenFiles(t *testing.T) {
	staticDir := t.TempDir()
	if err := os.Mkdir(filepath.Join(staticDir, "css"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(staticDir, "css", "main.css"), []byte("body{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(staticDir, ".env"), []byte("SECRET=value"), 0o644); err != nil {
		t.Fatal(err)
	}

	handler := http.StripPrefix("/static/", newStaticFileServer(staticDir))
	tests := []struct {
		path string
		want int
	}{
		{path: "/static/css/main.css", want: http.StatusOK},
		{path: "/static/", want: http.StatusNotFound},
		{path: "/static/css/", want: http.StatusNotFound},
		{path: "/static/.env", want: http.StatusNotFound},
	}

	for _, test := range tests {
		t.Run(test.path, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, test.path, nil)
			recorder := httptest.NewRecorder()

			handler.ServeHTTP(recorder, request)

			if recorder.Code != test.want {
				t.Fatalf("status = %d, want %d", recorder.Code, test.want)
			}
		})
	}
}

func TestNewRouterNotFound(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/missing", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusNotFound)
	}

	if got := recorder.Header().Get("Content-Type"); got != "text/html; charset=utf-8" {
		t.Fatalf("Content-Type = %q, want text/html; charset=utf-8", got)
	}

	body := recorder.Body.String()
	for _, expected := range []string{
		`<div class="not-found-page" aria-label="Página não encontrada">`,
		`erro 404`,
		`<h1 id="not-found-title">Esta página não existe.</h1>`,
		`<code data-not-found-path>/missing</code>`,
		`Voltar ao início`,
		`Ver artigos`,
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("body does not contain %q", expected)
		}
	}
}

func TestNewRouterNotFoundPreview(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/404", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	if body := recorder.Body.String(); !strings.Contains(body, `<code data-not-found-path>/404</code>`) {
		t.Fatalf("body does not contain preview path")
	}
}

func newTestRouter(t *testing.T) http.Handler {
	t.Helper()

	root := filepath.Join("..", "..", "..")
	handler, err := NewRouter(RouterOptions{
		StaticDir:    filepath.Join(root, "web", "static"),
		TemplatesDir: filepath.Join(root, "web", "templates"),
		ContentDir:   filepath.Join(root, "content", "articles"),
		NotesDir:     filepath.Join(root, "content", "notes"),
	}, testLogger())
	if err != nil {
		t.Fatalf("NewRouter() error = %v", err)
	}

	return handler
}

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}
