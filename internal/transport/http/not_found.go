package httptransport

import (
	"log/slog"
	"net/http"
	"time"
)

type notFoundPageData struct {
	Title          string
	Description    string
	CanonicalURL   string
	OpenGraphImage string
	OpenGraphType  string
	TwitterCard    string
	Keywords       string
	Locale         string
	SiteName       string
	CurrentYear    int

	Navigation  []siteNavLink
	RequestPath string
}

func notFoundPreviewHandler(renderer *Renderer, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		renderNotFoundPage(w, r, renderer, logger, http.StatusOK)
	}
}

func notFoundHandler(renderer *Renderer, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		renderNotFoundPage(w, r, renderer, logger, http.StatusNotFound)
	}
}

func renderNotFoundPage(w http.ResponseWriter, r *http.Request, renderer *Renderer, logger *slog.Logger, statusCode int) {
	data := newNotFoundPageData(time.Now(), r.URL.Path)

	if err := renderer.RenderStatus(w, "not_found", data, statusCode); err != nil {
		logger.Error("render not found page", "error", err, "request_id", getRequestID(r.Context()))
		renderUnexpectedErrorPage(w, r, renderer, logger, http.StatusInternalServerError)
	}
}

func newNotFoundPageData(now time.Time, currentPath string) notFoundPageData {
	requestPath := currentPath
	if requestPath == "" {
		requestPath = "/"
	}

	return notFoundPageData{
		Title:         "Página não encontrada",
		Description:   "A página solicitada não existe ou mudou de endereço.",
		CanonicalURL:  "/404",
		OpenGraphType: "website",
		TwitterCard:   "summary",
		Locale:        "pt_BR",
		SiteName:      "Guilherme Portella",
		CurrentYear:   now.Year(),
		Navigation:    newSiteNavigation(currentPath),
		RequestPath:   requestPath,
	}
}
