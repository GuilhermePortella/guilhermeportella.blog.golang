package httptransport

import (
	"log/slog"
	"net/http"
	"time"
)

type errorPageData struct {
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
	StatusLabel string
}

func errorPreviewHandler(renderer *Renderer, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		renderUnexpectedErrorPage(w, r, renderer, logger, http.StatusOK)
	}
}

func renderUnexpectedErrorPage(w http.ResponseWriter, r *http.Request, renderer *Renderer, logger *slog.Logger, statusCode int) {
	data := newErrorPageData(time.Now(), r.URL.Path)

	if err := renderer.RenderStatus(w, "error_page", data, statusCode); err != nil {
		logger.Error("render error page", "error", err, "request_id", getRequestID(r.Context()))
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
	}
}

func newErrorPageData(now time.Time, currentPath string) errorPageData {
	requestPath := currentPath
	if requestPath == "" {
		requestPath = "/"
	}

	return errorPageData{
		Title:         "Problema ao carregar",
		Description:   "Uma página de apoio para erros inesperados ou falhas de conexão.",
		CanonicalURL:  publicSiteURL + "/erro",
		OpenGraphType: "website",
		TwitterCard:   "summary",
		Locale:        "pt_BR",
		SiteName:      "Guilherme Portella",
		CurrentYear:   now.Year(),
		Navigation:    newSiteNavigation(currentPath),
		RequestPath:   requestPath,
		StatusLabel:   "erro 500",
	}
}
