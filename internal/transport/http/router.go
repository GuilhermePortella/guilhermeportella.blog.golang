package httptransport

import (
	"fmt"
	"log/slog"
	"net/http"
)

type RouterOptions struct {
	ImagesDir    string
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
	mux.HandleFunc("GET /about", aboutHandler(renderer, logger))
	mux.HandleFunc("GET /about/{$}", aboutHandler(renderer, logger))
	mux.HandleFunc("GET /curiosidades", curiosidadesHandler(renderer, logger))
	mux.HandleFunc("GET /curiosidades/{$}", curiosidadesHandler(renderer, logger))
	rickAndMorty := rickAndMortyHandler(renderer, logger)
	mux.HandleFunc("GET /curiosidades/rick-and-morty", rickAndMorty)
	mux.HandleFunc("GET /curiosidades/rick-and-morty/{$}", rickAndMorty)
	mux.HandleFunc("GET /rick-morty", rickAndMorty)
	mux.HandleFunc("GET /rick-morty/{$}", rickAndMorty)
	mux.HandleFunc("GET /rick-morty/personagem/{id}", rickAndMorty)
	mux.HandleFunc("GET /rick-morty/personagem/{id}/{$}", rickAndMorty)
	mux.HandleFunc("GET /rick-morty/local/{id}", rickAndMorty)
	mux.HandleFunc("GET /rick-morty/local/{id}/{$}", rickAndMorty)
	mux.HandleFunc("GET /rick-morty/episodio/{id}", rickAndMorty)
	mux.HandleFunc("GET /rick-morty/episodio/{id}/{$}", rickAndMorty)
	mux.HandleFunc("GET /projetos", projetosHandler(renderer, logger))
	mux.HandleFunc("GET /projetos/{$}", projetosHandler(renderer, logger))
	mux.HandleFunc("GET /projects", projetosHandler(renderer, logger))
	mux.HandleFunc("GET /projects/{$}", projetosHandler(renderer, logger))
	mux.HandleFunc("GET /jogos", jogosHandler(renderer, logger))
	mux.HandleFunc("GET /jogos/{$}", jogosHandler(renderer, logger))
	mux.HandleFunc("GET /games", jogosHandler(renderer, logger))
	mux.HandleFunc("GET /games/{$}", jogosHandler(renderer, logger))
	mux.HandleFunc("GET /jogos/{slug}", jogoHandler(renderer, logger))
	mux.HandleFunc("GET /jogos/{slug}/{$}", jogoHandler(renderer, logger))
	mux.HandleFunc("GET /blog", blogHandler(renderer, logger, options.ContentDir))
	mux.HandleFunc("GET /blog/{$}", blogHandler(renderer, logger, options.ContentDir))
	mux.HandleFunc("GET /articles", blogHandler(renderer, logger, options.ContentDir))
	mux.HandleFunc("GET /articles/{$}", blogHandler(renderer, logger, options.ContentDir))
	mux.HandleFunc("GET /blog/{slug}", blogArticleHandler(renderer, logger, options.ContentDir))
	mux.HandleFunc("GET /blog/{slug}/{$}", blogArticleHandler(renderer, logger, options.ContentDir))
	mux.HandleFunc("GET /notas", notesHandler(renderer, logger, options.NotesDir))
	mux.HandleFunc("GET /notas/{$}", notesHandler(renderer, logger, options.NotesDir))
	mux.HandleFunc("GET /404", notFoundPreviewHandler(renderer, logger))
	mux.HandleFunc("GET /404/{$}", notFoundPreviewHandler(renderer, logger))
	mux.HandleFunc("GET /healthz", healthHandler)
	mux.HandleFunc("GET /readyz", readyHandler)
	mux.Handle("GET /images/", http.StripPrefix("/images/", newStaticFileServer(options.ImagesDir)))
	mux.Handle("GET /static/", http.StripPrefix("/static/", newStaticFileServer(options.StaticDir)))
	mux.HandleFunc("GET /", notFoundHandler(renderer, logger))

	return chain(
		mux,
		requestID,
		recoverer(logger),
		securityHeaders,
		requestLogger(logger),
	), nil
}

func (options RouterOptions) withDefaults() RouterOptions {
	if options.ImagesDir == "" {
		options.ImagesDir = "public/images"
	}

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
