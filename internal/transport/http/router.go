package httptransport

import (
	"fmt"
	"log/slog"
	"net/http"
)

type RouterOptions struct {
	StaticDir    string
	TemplatesDir string
	ContentDir   string
	NotesDir     string
}

func NewRouter(options RouterOptions, logger *slog.Logger) (http.Handler, error) {
	if logger == nil {
		logger = slog.Default()
	}

	options = options.withDefaults()
	renderer, err := NewRenderer(options.TemplatesDir)
	if err != nil {
		return nil, fmt.Errorf("create renderer: %w", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /{$}", homeHandler(renderer, logger))
	mux.HandleFunc("GET /blog", blogHandler(renderer, logger, options.ContentDir))
	mux.HandleFunc("GET /blog/{$}", blogHandler(renderer, logger, options.ContentDir))
	mux.HandleFunc("GET /blog/{slug}", blogArticleHandler(renderer, logger, options.ContentDir))
	mux.HandleFunc("GET /blog/{slug}/{$}", blogArticleHandler(renderer, logger, options.ContentDir))
	mux.HandleFunc("GET /notas", notesHandler(renderer, logger, options.NotesDir))
	mux.HandleFunc("GET /notas/{$}", notesHandler(renderer, logger, options.NotesDir))
	mux.HandleFunc("GET /healthz", healthHandler)
	mux.HandleFunc("GET /readyz", readyHandler)
	mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServer(http.Dir(options.StaticDir))))

	return chain(
		mux,
		requestID,
		recoverer(logger),
		securityHeaders,
		requestLogger(logger),
	), nil
}

func (options RouterOptions) withDefaults() RouterOptions {
	if options.StaticDir == "" {
		options.StaticDir = "web/static"
	}

	if options.TemplatesDir == "" {
		options.TemplatesDir = "web/templates"
	}

	if options.ContentDir == "" {
		options.ContentDir = "content/articles"
	}

	if options.NotesDir == "" {
		options.NotesDir = "content/notes"
	}

	return options
}
