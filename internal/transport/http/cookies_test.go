package httptransport

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCookiesRoutes(t *testing.T) {
	handler := newTestRouter(t)
	for _, route := range []string{"/cookies", "/cookies/"} {
		t.Run(route, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, route, nil))
			if response.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200", response.Code)
			}
			for _, expected := range []string{
				`<h1 id="cookies-title">Política de cookies</h1>`,
				`<link rel="canonical" href="https://guilhermeportella.github.io/cookies/">`,
				`href="/privacidade/"`,
			} {
				if !strings.Contains(response.Body.String(), expected) {
					t.Errorf("page missing %q", expected)
				}
			}
		})
	}
}
