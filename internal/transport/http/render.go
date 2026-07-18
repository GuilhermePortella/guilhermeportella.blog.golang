package httptransport

import (
	"bytes"
	"fmt"
	"html/template"
	"io/fs"
	"net/http"
	"path/filepath"
	"slices"
	"strings"
)

const publicSiteURL = "https://guilhermeportella.github.io"

type Renderer struct {
	templates map[string]*template.Template
}

func NewRenderer(templatesDir string) (*Renderer, error) {
	files, err := templateFiles(templatesDir)
	if err != nil {
		return nil, err
	}

	if len(files) == 0 {
		return nil, fmt.Errorf("no html templates found in %q", templatesDir)
	}

	shared, pages := splitTemplateFiles(files)
	if len(pages) == 0 {
		return nil, fmt.Errorf("no page templates found in %q", templatesDir)
	}

	templatesByName := make(map[string]*template.Template, len(pages))
	for _, page := range pages {
		name := strings.TrimSuffix(filepath.Base(page), filepath.Ext(page))
		pageFiles := append([]string(nil), shared...)
		pageFiles = append(pageFiles, page)

		templates, err := template.New("").Funcs(template.FuncMap{
			"pageTitle": pageTitle,
		}).ParseFiles(pageFiles...)
		if err != nil {
			return nil, fmt.Errorf("parse template page %q: %w", name, err)
		}

		if templates.Lookup(name) == nil {
			return nil, fmt.Errorf("template page %q does not define %q", page, name)
		}

		templatesByName[name] = templates
	}

	return &Renderer{
		templates: templatesByName,
	}, nil
}

func pageTitle(title string, siteName string) string {
	title = strings.TrimSpace(title)
	siteName = strings.TrimSpace(siteName)

	if title == "" {
		return siteName
	}
	if siteName == "" || title == siteName || strings.HasSuffix(title, " | "+siteName) {
		return title
	}

	return title + " | " + siteName
}

func (renderer *Renderer) Render(w http.ResponseWriter, name string, data any) error {
	return renderer.RenderStatus(w, name, data, http.StatusOK)
}

func (renderer *Renderer) RenderStatus(w http.ResponseWriter, name string, data any, statusCode int) error {
	templates, ok := renderer.templates[name]
	if !ok {
		return fmt.Errorf("template %q not found", name)
	}

	var buffer bytes.Buffer
	if err := templates.ExecuteTemplate(&buffer, name, data); err != nil {
		return fmt.Errorf("execute template %q: %w", name, err)
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(statusCode)
	_, err := w.Write(buffer.Bytes())
	return err
}

func templateFiles(templatesDir string) ([]string, error) {
	var files []string

	err := filepath.WalkDir(templatesDir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".html") {
			return nil
		}

		files = append(files, path)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("walk templates dir %q: %w", templatesDir, err)
	}

	slices.Sort(files)
	return files, nil
}

func splitTemplateFiles(files []string) (shared []string, pages []string) {
	for _, file := range files {
		path := filepath.ToSlash(file)
		if strings.Contains(path, "/pages/") {
			pages = append(pages, file)
			continue
		}

		shared = append(shared, file)
	}

	return shared, pages
}
