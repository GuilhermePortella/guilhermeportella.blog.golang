package httptransport

import (
	"log/slog"
	"net/http"
	"time"
)

type policyPageData struct {
	Title          string
	Description    string
	CanonicalURL   string
	OpenGraphImage string
	OpenGraphType  string
	TwitterCard    string
	Keywords       string
	Locale         string
	Robots         string
	SiteName       string
	CurrentYear    int

	Navigation []siteNavLink
}

func privacyHandler(renderer *Renderer, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data := policyPageData{
			Title:         "Política de privacidade",
			Description:   "Como o blog de Guilherme Portella utiliza dados, armazenamento local e serviços externos, e como entrar em contato sobre privacidade.",
			CanonicalURL:  publicSiteURL + "/privacidade/",
			OpenGraphType: "website",
			TwitterCard:   "summary_large_image",
			Locale:        "pt_BR",
			SiteName:      "Guilherme Portella",
			CurrentYear:   time.Now().Year(),
			Navigation:    newSiteNavigation(r.URL.Path),
		}
		if err := renderer.Render(w, "privacy", data); err != nil {
			logger.Error("render privacy page", "error", err, "request_id", getRequestID(r.Context()))
			renderUnexpectedErrorPage(w, r, renderer, logger, http.StatusInternalServerError)
		}
	}
}
