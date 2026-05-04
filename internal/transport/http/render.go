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

type Renderer struct {
	templates *template.Template
}

func NewRenderer(templatesDir string) (*Renderer, error) {
	files, err := templateFiles(templatesDir)
	if err != nil {
		return nil, err
	}

	if len(files) == 0 {
		return nil, fmt.Errorf("no html templates found in %q", templatesDir)
	}

	templates, err := template.ParseFiles(files...)
	if err != nil {
		return nil, fmt.Errorf("parse templates: %w", err)
	}

	return &Renderer{
		templates: templates,
	}, nil
}

func (renderer *Renderer) Render(w http.ResponseWriter, name string, data any) error {
	var buffer bytes.Buffer
	if err := renderer.templates.ExecuteTemplate(&buffer, name, data); err != nil {
		return fmt.Errorf("execute template %q: %w", name, err)
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
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
