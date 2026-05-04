package httptransport

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
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

	if !strings.Contains(body, `<script src="/static/js/site.js" defer></script>`) {
		t.Fatalf("body does not contain footer script")
	}

	if strings.Contains(body, "HomeAboutSection") {
		t.Fatalf("body contains old analysis content")
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

func TestNewRouterNotFound(t *testing.T) {
	handler := newTestRouter(t)
	request := httptest.NewRequest(http.MethodGet, "/missing", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusNotFound)
	}
}

func newTestRouter(t *testing.T) http.Handler {
	t.Helper()

	root := filepath.Join("..", "..", "..")
	handler, err := NewRouter(RouterOptions{
		StaticDir:    filepath.Join(root, "web", "static"),
		TemplatesDir: filepath.Join(root, "web", "templates"),
	}, testLogger())
	if err != nil {
		t.Fatalf("NewRouter() error = %v", err)
	}

	return handler
}

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}
