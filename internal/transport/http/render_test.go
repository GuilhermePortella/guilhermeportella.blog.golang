package httptransport

import (
	"html/template"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPageTitle(t *testing.T) {
	tests := []struct {
		name     string
		title    string
		siteName string
		want     string
	}{
		{
			name:     "adds site name",
			title:    "Projetos",
			siteName: "Guilherme Portella",
			want:     "Projetos | Guilherme Portella",
		},
		{
			name:     "keeps home title",
			title:    "Guilherme Portella",
			siteName: "Guilherme Portella",
			want:     "Guilherme Portella",
		},
		{
			name:     "keeps title with site name",
			title:    "Blog | Guilherme Portella",
			siteName: "Guilherme Portella",
			want:     "Blog | Guilherme Portella",
		},
		{
			name:     "uses site name when title is empty",
			title:    " ",
			siteName: "Guilherme Portella",
			want:     "Guilherme Portella",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := pageTitle(test.title, test.siteName); got != test.want {
				t.Fatalf("pageTitle(%q, %q) = %q, want %q", test.title, test.siteName, got, test.want)
			}
		})
	}
}

func TestNewRendererRejectsDirectoryWithoutTemplates(t *testing.T) {
	_, err := NewRenderer(t.TempDir())
	if err == nil {
		t.Fatal("NewRenderer() error = nil, want error")
	}
	if !strings.Contains(err.Error(), "no html templates found") {
		t.Fatalf("NewRenderer() error = %q, want missing templates error", err)
	}
}

func TestRendererRenderStatusRejectsUnknownTemplate(t *testing.T) {
	renderer := &Renderer{templates: map[string]*template.Template{}}
	recorder := httptest.NewRecorder()

	err := renderer.RenderStatus(recorder, "missing", nil, http.StatusCreated)
	if err == nil {
		t.Fatal("RenderStatus() error = nil, want error")
	}
	if recorder.Code != http.StatusOK || recorder.Body.Len() != 0 {
		t.Fatalf("response was committed on error: status=%d body=%q", recorder.Code, recorder.Body.String())
	}
}

func TestRendererRenderStatusDoesNotCommitTemplateExecutionErrors(t *testing.T) {
	broken := template.Must(template.New("broken").Parse(`{{define "broken"}}{{call .}}{{end}}`))
	renderer := &Renderer{templates: map[string]*template.Template{"broken": broken}}
	recorder := httptest.NewRecorder()

	err := renderer.RenderStatus(recorder, "broken", "not a function", http.StatusCreated)
	if err == nil {
		t.Fatal("RenderStatus() error = nil, want execution error")
	}
	if recorder.Code != http.StatusOK || recorder.Body.Len() != 0 {
		t.Fatalf("response was committed on error: status=%d body=%q", recorder.Code, recorder.Body.String())
	}
}
