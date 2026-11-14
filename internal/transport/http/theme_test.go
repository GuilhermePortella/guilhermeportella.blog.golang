package httptransport

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestThemeSwitchContract(t *testing.T) {
	handler := newTestRouter(t)

	// Páginas de tipos diferentes compartilham o layout base e o header.
	for _, route := range []string{"/", "/blog", "/jogos", "/about", "/cookies/", "/rota-inexistente"} {
		t.Run(route, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, route, nil))
			body := response.Body.String()

			// theme.js precisa ser síncrono e anteceder o CSS para evitar flash do tema errado.
			script := strings.Index(body, `<script src="/static/js/theme.js?v=`)
			stylesheet := strings.Index(body, `<link rel="stylesheet" href="/static/css/main.css`)
			if script < 0 || stylesheet < 0 || script > stylesheet {
				t.Fatalf("theme.js deve vir antes de main.css (script=%d, css=%d)", script, stylesheet)
			}
			if tag := body[script : script+strings.Index(body[script:], ">")]; strings.Contains(tag, "defer") || strings.Contains(tag, "async") {
				t.Fatalf("theme.js não pode ser defer/async: %s", tag)
			}

			for _, expected := range []string{
				`<link rel="stylesheet" href="/static/css/main.css?v=20261113-cls">`,
				`data-theme-switch hidden`,
				`aria-label="Tema do site"`,
				`data-theme-option="light" aria-pressed="false"`,
				`data-theme-option="gta" aria-pressed="true"`,
				`data-theme-option="dark"`,
			} {
				if !strings.Contains(body, expected) {
					t.Errorf("página sem %q", expected)
				}
			}
			if strings.Count(body, `data-theme-switch`) != 1 {
				t.Errorf("esperava exatamente um seletor de tema")
			}
		})
	}
}

func TestThemeStylesheetServesLayoutReservation(t *testing.T) {
	handler := newTestRouter(t)
	for _, asset := range []struct {
		url      string
		expected []string
	}{
		{
			url:      "/static/css/main.css?v=20261113-cls",
			expected: []string{`@import url("./components/theme-switch.css?v=20261113-cls")`},
		},
		{
			url: "/static/css/components/theme-switch.css?v=20261113-cls",
			expected: []string{
				".theme-switch[hidden] {",
				"display: inline-flex !important;",
				"visibility: hidden;",
			},
		},
	} {
		t.Run(asset.url, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, asset.url, nil))
			if response.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200", response.Code)
			}
			for _, expected := range asset.expected {
				if !strings.Contains(response.Body.String(), expected) {
					t.Errorf("CSS servido sem %q", expected)
				}
			}
		})
	}
}

func TestThemeAssetsAreServed(t *testing.T) {
	handler := newTestRouter(t)
	for _, asset := range []string{
		"/static/js/theme.js",
		"/static/css/themes.css",
		"/static/css/themes-overrides.css",
		"/static/css/components/theme-switch.css",
	} {
		t.Run(asset, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, asset, nil))
			if response.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200", response.Code)
			}
			if response.Body.Len() == 0 {
				t.Fatal("asset vazio")
			}
		})
	}
}

func TestThemeScriptCompliesWithContentSecurityPolicy(t *testing.T) {
	handler := newTestRouter(t)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/", nil))
	body := response.Body.String()

	// A CSP só permite script-src 'self': o tema não pode depender de script inline.
	if !strings.Contains(body, "script-src 'self';") {
		t.Fatal("CSP deveria restringir scripts à própria origem")
	}
	if strings.Contains(body, "unsafe-inline'") && strings.Contains(body, "script-src 'self' 'unsafe-inline'") {
		t.Fatal("CSP não deve liberar scripts inline")
	}
	if strings.Contains(body, "<script>") {
		t.Fatal("a página não deve conter scripts inline")
	}
}
