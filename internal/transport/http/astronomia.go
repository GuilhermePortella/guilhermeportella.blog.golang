package httptransport

import (
	"log/slog"
	"net/http"
	"time"
)

type astronomiaPageData struct {
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

	Navigation []siteNavLink
}

func astronomiaHandler(renderer *Renderer, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data := newAstronomiaPageData(time.Now(), r.URL.Path)

		if err := renderer.Render(w, "astronomia", data); err != nil {
			logger.Error("render astronomia page", "error", err, "request_id", getRequestID(r.Context()))
			renderUnexpectedErrorPage(w, r, renderer, logger, http.StatusInternalServerError)
		}
	}
}

func newAstronomiaPageData(now time.Time, currentPath string) astronomiaPageData {
	return astronomiaPageData{
		Title:         "Astronomia",
		Description:   "Uma central para explorar a Astronomy Picture of the Day da NASA com imagens, videos e contexto astronomico.",
		CanonicalURL:  publicSiteURL + "/astronomia/",
		OpenGraphType: "website",
		TwitterCard:   "summary_large_image",
		Keywords:      "astronomia, nasa, apod, espaço, fotografia astronomica, ciência",
		Locale:        "pt_BR",
		SiteName:      "Guilherme Portella",
		CurrentYear:   now.Year(),
		Navigation:    newSiteNavigation(currentPath),
	}
}
