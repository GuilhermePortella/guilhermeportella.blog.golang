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

	if !strings.Contains(body, `<link rel="stylesheet" href="/static/css/main.css?v=20260605-css-split">`) {
		t.Fatalf("body does not contain stylesheet")
	}

	if !strings.Contains(body, `<meta http-equiv="Content-Security-Policy"`) || !strings.Contains(body, `<meta name="referrer" content="no-referrer">`) {
		t.Fatalf("body does not contain static security metadata")
	}
	if strings.Contains(body, "img-src 'self' data: https:;") || strings.Contains(body, "style-src 'self' 'unsafe-inline'") {
		t.Fatalf("body contains overly broad static CSP")
	}

	if strings.Contains(body, "fonts.googleapis.com") || strings.Contains(body, "fonts.gstatic.com") {
		t.Fatalf("body contains external Google Fonts dependency")
	}

	if !strings.Contains(body, `<script src="/static/js/site.js?v=20260531-errors" defer></script>`) {
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
		{name: "games", path: "/jogos", wantActive: "Jogos"},
		{name: "game page", path: "/jogos/memoria-relampago", wantActive: "Jogos"},
		{name: "games alias", path: "/games/", wantActive: "Jogos"},
		{name: "about", path: "/about/", wantActive: "Sobre"},
		{name: "astronomy app", path: "/astronomia", wantActive: "Curiosidades"},
		{name: "trailing slash", path: "/curiosidades/", wantActive: "Curiosidades"},
		{name: "rick and morty curiosity", path: "/curiosidades/rick-and-morty", wantActive: "Curiosidades"},
		{name: "rick and morty app", path: "/rick-morty/personagem/1", wantActive: "Curiosidades"},
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

func TestNewRouterJogos(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/jogos", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	body := recorder.Body.String()
	for _, expected := range []string{
		`<div class="games-page" aria-label="Jogos">`,
		`<title>Jogos</title>`,
		`<link rel="canonical" href="/jogos/">`,
		`<a href="/jogos" class="active" aria-current="page">Jogos</a>`,
		`<h1 id="games-title">Um pequeno hub para jogar, testar ideias e descansar a cabeça.</h1>`,
		`href="/jogos/memoria-relampago"`,
		`Memória Relâmpago`,
		`Sequência de Cores`,
		`Clique Rápido`,
		`Soma Rápida`,
		`href="/jogos/soma-rapida"`,
		`Paciência Klondike`,
		`href="/jogos/paciencia-klondike"`,
		`Dama Brasileira`,
		`href="/jogos/dama-brasileira"`,
		`Snake Classic`,
		`href="/jogos/snake"`,
		`Jogar agora`,
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("body does not contain %q", expected)
		}
	}
}

func TestNewRouterGamesAlias(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/games/", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	body := recorder.Body.String()
	for _, expected := range []string{
		`<title>Jogos</title>`,
		`<link rel="canonical" href="/jogos/">`,
		`<a href="/jogos" class="active" aria-current="page">Jogos</a>`,
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("body does not contain %q", expected)
		}
	}
}

func TestNewRouterJogo(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/jogos/memoria-relampago", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	body := recorder.Body.String()
	for _, expected := range []string{
		`<div class="game-page game-page--teal" aria-label="Memória Relâmpago">`,
		`<title>Memória Relâmpago | Jogos</title>`,
		`<link rel="canonical" href="/jogos/memoria-relampago/">`,
		`<a href="/jogos" class="active" aria-current="page">Jogos</a>`,
		`<h1 id="game-title">Memória Relâmpago</h1>`,
		`data-game="memoria-relampago"`,
		`data-memory-game`,
		`data-memory-board`,
		`data-memory-restart`,
		`Voltar para jogos`,
		`Continue jogando`,
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("body does not contain %q", expected)
		}
	}
}

func TestNewRouterJogoMath(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/jogos/soma-rapida", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	body := recorder.Body.String()
	for _, expected := range []string{
		`<div class="game-page game-page--blue" aria-label="Soma Rápida">`,
		`<title>Soma Rápida | Jogos</title>`,
		`<link rel="canonical" href="/jogos/soma-rapida/">`,
		`<h1 id="game-title">Soma Rápida</h1>`,
		`data-game="soma-rapida"`,
		`data-math-game`,
		`data-math-question`,
		`data-math-answer`,
		`data-math-start`,
		`Clique em começar para iniciar uma rodada de 30 segundos.`,
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("body does not contain %q", expected)
		}
	}
}

func TestNewRouterJogoSolitaire(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/jogos/paciencia-klondike", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	body := recorder.Body.String()
	for _, expected := range []string{
		`<div class="game-page game-page--blue" aria-label="Paciência Klondike">`,
		`<title>Paciência Klondike | Jogos</title>`,
		`<link rel="canonical" href="/jogos/paciencia-klondike/">`,
		`<h1 id="game-title">Paciência Klondike</h1>`,
		`data-game="paciencia-klondike"`,
		`data-solitaire-game`,
		`data-solitaire-pile="stock"`,
		`data-solitaire-difficulty`,
		`data-solitaire-new`,
		`Paciência resolvida.`,
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("body does not contain %q", expected)
		}
	}
}

func TestNewRouterJogoSnake(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/jogos/snake", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	body := recorder.Body.String()
	for _, expected := range []string{
		`<div class="game-page game-page--green" aria-label="Snake Classic">`,
		`<title>Snake Classic | Jogos</title>`,
		`<link rel="canonical" href="/jogos/snake/">`,
		`<h1 id="game-title">Snake Classic</h1>`,
		`data-game="snake"`,
		`data-snake-game`,
		`data-snake-canvas`,
		`data-snake-start`,
		`Use setas ou WASD para virar.`,
		`No celular, deslize no tabuleiro.`,
		`Jogar novamente`,
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("body does not contain %q", expected)
		}
	}
}

func TestNewRouterJogoCheckers(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/jogos/dama-brasileira", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	body := recorder.Body.String()
	for _, expected := range []string{
		`<div class="game-page game-page--green" aria-label="Dama Brasileira">`,
		`<title>Dama Brasileira | Jogos</title>`,
		`<link rel="canonical" href="/jogos/dama-brasileira/">`,
		`<h1 id="game-title">Dama Brasileira</h1>`,
		`data-game="dama-brasileira"`,
		`data-checkers-game`,
		`data-checkers-board`,
		`data-checkers-ai-level`,
		`data-checkers-new`,
		`Vs máquina: ON`,
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("body does not contain %q", expected)
		}
	}
}

func TestNewRouterJogoNotFound(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/jogos/nao-existe", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusNotFound)
	}

	body := recorder.Body.String()
	for _, expected := range []string{
		`<title>Página não encontrada</title>`,
		`<h1 id="not-found-title">Esta página não existe.</h1>`,
		`<code data-not-found-path>/jogos/nao-existe</code>`,
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
		`id="apis"`,
		`Exploradores de dados`,
		`Pequenas interfaces para brincar com APIs publicas sem sair do site.`,
		`NASA APOD`,
		`href="/astronomia" target="_blank" rel="noopener noreferrer"`,
		`https://api.nasa.gov/planetary/apod`,
		`Rick and Morty API`,
		`id="colecao"`,
		`Interstellar (Nolan)`,
		`DEATH STRANDING 2: ON THE BEACH`,
		`YouTube: canais de programação e desenvolvimento`,
		`href="/rick-morty"`,
		`Portal para explorar personagens, locais e episodios consumidos da API publica oficial.`,
		`https://rickandmortyapi.com/api`,
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

	if got := recorder.Header().Get("Content-Security-Policy"); !strings.Contains(got, "script-src 'self';") {
		t.Fatalf("Content-Security-Policy = %q, want self-only script-src", got)
	}

	if got := recorder.Header().Get("Content-Security-Policy"); strings.Contains(got, "unsafe-eval") || strings.Contains(got, "embed-cdn.spotifycdn.com") {
		t.Fatalf("Content-Security-Policy = %q, should not relax script-src for Spotify iframe API", got)
	}

	if strings.Contains(body, `data-rick-and-morty`) {
		t.Fatalf("body contains Rick and Morty API widget on curiosity index")
	}
}

func TestNewRouterAstronomia(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/astronomia", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	body := recorder.Body.String()
	for _, expected := range []string{
		`class="astronomy-page"`,
		`data-nasa-apod-app`,
		`data-apod-today-url="/static/data/nasa/apod-today.json"`,
		`data-apod-random-url="/static/data/nasa/apod-random.json"`,
		`data-eonet-url="https://eonet.gsfc.nasa.gov/api/v3/events"`,
		`<title>Astronomia</title>`,
		`<link rel="canonical" href="/astronomia/">`,
		`<a href="/curiosidades" class="active" aria-current="page">Curiosidades</a>`,
		`/static/js/nasa-apod-app.js?v=20260625-apod-video-modal`,
		`Astronomy Picture of the Day`,
		`aria-describedby="apod-message" aria-controls="apod-feature"`,
		`id="apod-gallery"`,
		`EONET Natural Event Tracker`,
		`aria-describedby="eonet-summary" aria-controls="eonet-events"`,
		`data-eonet-category`,
		`data-eonet-event-status`,
		`id="eonet-events" class="astronomy-eonet-grid" data-eonet-events`,
		`Amostras recentes`,
		`Esta pagina precisa de JavaScript para consultar a API APOD da NASA.`,
		`connect-src 'self' https://api.github.com https://api.nasa.gov https://eonet.gsfc.nasa.gov`,
		`https://apod.nasa.gov`,
		`https://img.youtube.com`,
		`media-src 'self' data: https://apod.nasa.gov https://www.nasa.gov`,
		`frame-src https://open.spotify.com https://www.youtube.com https://www.youtube-nocookie.com`,
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("body does not contain %q", expected)
		}
	}

	for _, unwanted := range []string{
		"DEMO" + "_KEY",
		"data-apod-" + "key",
		"data-apod-save-" + "key",
		"API " + "key",
	} {
		if strings.Contains(body, unwanted) {
			t.Fatalf("body contains %q", unwanted)
		}
	}

	if got := recorder.Header().Get("Content-Security-Policy"); !strings.Contains(got, "https://api.nasa.gov") || !strings.Contains(got, "https://eonet.gsfc.nasa.gov") {
		t.Fatalf("Content-Security-Policy = %q, want NASA and EONET connect-src", got)
	}

	if got := recorder.Header().Get("Content-Security-Policy"); !strings.Contains(got, "https://apod.nasa.gov") || !strings.Contains(got, "https://www.nasa.gov") {
		t.Fatalf("Content-Security-Policy = %q, want NASA image domains", got)
	}

	if got := recorder.Header().Get("Content-Security-Policy"); !strings.Contains(got, "media-src 'self' data: https://apod.nasa.gov https://www.nasa.gov") {
		t.Fatalf("Content-Security-Policy = %q, want NASA media-src", got)
	}

	if got := recorder.Header().Get("Content-Security-Policy"); !strings.Contains(got, "frame-src https://open.spotify.com https://www.youtube.com https://www.youtube-nocookie.com") {
		t.Fatalf("Content-Security-Policy = %q, want YouTube frame-src", got)
	}
}

func TestNewRouterRickAndMorty(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/rick-morty", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	body := recorder.Body.String()
	for _, expected := range []string{
		`<div class="rick-app-root" data-rick-morty-app data-url="/rick-morty">`,
		`<title>Rick and Morty API</title>`,
		`<link rel="canonical" href="/rick-morty/">`,
		`https://rickandmortyapi.com`,
		`https://rickandmorty.fandom.com`,
		`<a href="/curiosidades" class="active" aria-current="page">Curiosidades</a>`,
		`/static/js/rick-and-morty-app.js?v=20260522-go-static`,
		`Rick and Morty API`,
		`Carregando o portal.`,
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("body does not contain %q", expected)
		}
	}

	if got := recorder.Header().Get("Content-Security-Policy"); !strings.Contains(got, "https://rickandmortyapi.com") || !strings.Contains(got, "https://rickandmorty.fandom.com") {
		t.Fatalf("Content-Security-Policy = %q, want Rick and Morty and Fandom connect-src", got)
	}
}

func TestNewRouterRickAndMortyDetailRoutes(t *testing.T) {
	handler := newTestRouter(t)

	for _, route := range []string{
		"/curiosidades/rick-and-morty",
		"/rick-morty/personagem/1",
		"/rick-morty/local/1",
		"/rick-morty/episodio/1",
	} {
		t.Run(route, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, route, nil)
			recorder := httptest.NewRecorder()

			handler.ServeHTTP(recorder, request)

			if recorder.Code != http.StatusOK {
				t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
			}

			if body := recorder.Body.String(); !strings.Contains(body, `data-rick-morty-app`) {
				t.Fatalf("body does not contain Rick and Morty app root")
			}
		})
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
		`<meta property="og:image" content="https://guilhermeportella.github.io/static/images/social-default.png?v=20260518">`,
		`<meta property="og:image:secure_url" content="https://guilhermeportella.github.io/static/images/social-default.png?v=20260518">`,
		`<meta property="og:image:type" content="image/png">`,
		`<meta property="og:image:width" content="1200">`,
		`<meta property="og:image:height" content="630">`,
		`<meta name="twitter:image" content="https://guilhermeportella.github.io/static/images/social-default.png?v=20260518">`,
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

func TestNewRouterImages(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/images/mcp_architecture.png", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	if recorder.Body.Len() == 0 {
		t.Fatal("image response body is empty")
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
		`<h2 id="um-comeco-que-nao-precisa-correr"><a class="heading-anchor" href="#um-comeco-que-nao-precisa-correr">Um começo que não precisa correr</a></h2>`,
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

	if got := recorder.Header().Get("Cross-Origin-Opener-Policy"); got != "same-origin" {
		t.Fatalf("Cross-Origin-Opener-Policy = %q, want same-origin", got)
	}

	if got := recorder.Header().Get("Cross-Origin-Resource-Policy"); got != "cross-origin" {
		t.Fatalf("Cross-Origin-Resource-Policy = %q, want cross-origin", got)
	}

	if got := recorder.Header().Get("Cross-Origin-Embedder-Policy"); got != "credentialless" {
		t.Fatalf("Cross-Origin-Embedder-Policy = %q, want credentialless", got)
	}

	if got := recorder.Header().Get("Permissions-Policy"); !strings.Contains(got, "geolocation=()") || !strings.Contains(got, "camera=()") {
		t.Fatalf("Permissions-Policy = %q, want disabled sensitive features", got)
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

func TestNewRouterErrorPreview(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/erro", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	body := recorder.Body.String()
	for _, expected := range []string{
		`<div class="not-found-page error-page" aria-label="Problema ao carregar">`,
		`erro 500`,
		`<h1 id="error-page-title" data-error-title>Não consegui carregar isso agora.</h1>`,
		`<code data-error-path>/erro</code>`,
		`Tentar de novo`,
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("body does not contain %q", expected)
		}
	}
}

func TestRecovererRendersUnexpectedErrorPage(t *testing.T) {
	root := filepath.Join("..", "..", "..")
	renderer, err := NewRenderer(filepath.Join(root, "web", "templates"))
	if err != nil {
		t.Fatalf("NewRenderer() error = %v", err)
	}

	handler := chain(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			panic("boom")
		}),
		requestID,
		recoverer(renderer, testLogger()),
	)
	request := httptest.NewRequest(http.MethodGet, "/explodiu", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusInternalServerError)
	}

	body := recorder.Body.String()
	for _, expected := range []string{
		`<div class="not-found-page error-page" aria-label="Problema ao carregar">`,
		`<code data-error-path>/explodiu</code>`,
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("body does not contain %q", expected)
		}
	}
}

func TestNewRouterServiceWorker(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/service-worker.js", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	if body := recorder.Body.String(); !strings.Contains(body, `guilherme-portella-site-`) {
		t.Fatalf("body does not contain service worker cache name")
	}
}

func TestRouterOptionsWithDefaults(t *testing.T) {
	options := RouterOptions{}.withDefaults()

	if options.ImagesDir != "public/images" {
		t.Fatalf("ImagesDir = %q, want public/images", options.ImagesDir)
	}
	if options.StaticDir != "web/static" {
		t.Fatalf("StaticDir = %q, want web/static", options.StaticDir)
	}
	if options.TemplatesDir != "web/templates" {
		t.Fatalf("TemplatesDir = %q, want web/templates", options.TemplatesDir)
	}
	if options.ContentDir != "content/articles" {
		t.Fatalf("ContentDir = %q, want content/articles", options.ContentDir)
	}
	if options.NotesDir != "content/notes" {
		t.Fatalf("NotesDir = %q, want content/notes", options.NotesDir)
	}
}

func TestRouterOptionsWithDefaultsKeepsCustomValues(t *testing.T) {
	options := RouterOptions{
		ImagesDir:    "custom/images",
		StaticDir:    "custom/static",
		TemplatesDir: "custom/templates",
		ContentDir:   "custom/articles",
		NotesDir:     "custom/notes",
	}.withDefaults()

	if options.ImagesDir != "custom/images" {
		t.Fatalf("ImagesDir = %q, want custom/images", options.ImagesDir)
	}
	if options.StaticDir != "custom/static" {
		t.Fatalf("StaticDir = %q, want custom/static", options.StaticDir)
	}
	if options.TemplatesDir != "custom/templates" {
		t.Fatalf("TemplatesDir = %q, want custom/templates", options.TemplatesDir)
	}
	if options.ContentDir != "custom/articles" {
		t.Fatalf("ContentDir = %q, want custom/articles", options.ContentDir)
	}
	if options.NotesDir != "custom/notes" {
		t.Fatalf("NotesDir = %q, want custom/notes", options.NotesDir)
	}
}

func newTestRouter(t *testing.T) http.Handler {
	t.Helper()

	root := filepath.Join("..", "..", "..")
	handler, err := NewRouter(RouterOptions{
		ImagesDir:    filepath.Join(root, "public", "images"),
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
