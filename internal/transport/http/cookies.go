package httptransport

import (
	"log/slog"
	"net/http"
	"time"
)

func cookiesHandler(renderer *Renderer, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data := policyPageData{
			Title:         "Política de cookies",
			Description:   "Conheça os cookies de terceiros, o armazenamento local e o cache do blog, suas finalidades e como gerenciar os dados no navegador.",
			CanonicalURL:  publicSiteURL + "/cookies/",
			OpenGraphType: "website",
			TwitterCard:   "summary_large_image",
			Locale:        "pt_BR",
			SiteName:      "Guilherme Portella",
			CurrentYear:   time.Now().Year(),
			Navigation:    newSiteNavigation(r.URL.Path),
		}
		if err := renderer.Render(w, "cookies", data); err != nil {
			logger.Error("render cookies page", "error", err, "request_id", getRequestID(r.Context()))
			renderUnexpectedErrorPage(w, r, renderer, logger, http.StatusInternalServerError)
		}
	}
}
