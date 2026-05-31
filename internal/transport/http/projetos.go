package httptransport

import (
	"log/slog"
	"net/http"
	"time"
)

type projetosPageData struct {
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
	Hero       projetosHero
}

type projetosHero struct {
	Eyebrow     string
	Title       string
	Description string
	Tags        []string
	Guide       blogInfoCard
	Note        blogInfoCard
}

func projetosHandler(renderer *Renderer, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data := newProjetosPageData(time.Now(), r.URL.Path)

		if err := renderer.Render(w, "projetos", data); err != nil {
			logger.Error("render projetos page", "error", err, "request_id", getRequestID(r.Context()))
			renderUnexpectedErrorPage(w, r, renderer, logger, http.StatusInternalServerError)
		}
	}
}

func newProjetosPageData(now time.Time, currentPath string) projetosPageData {
	return projetosPageData{
		Title:         "Projetos",
		Description:   "Catálogo de repositórios públicos, experimentos e projetos de Guilherme Portella.",
		CanonicalURL:  "/projetos/",
		OpenGraphType: "website",
		TwitterCard:   "summary_large_image",
		Keywords:      "projetos, github, repositórios, desenvolvimento, software",
		Locale:        "pt_BR",
		SiteName:      "Guilherme Portella",
		CurrentYear:   now.Year(),
		Navigation:    newSiteNavigation(currentPath),
		Hero: projetosHero{
			Eyebrow:     "projetos",
			Title:       "Repositórios públicos, experimentos e ferramentas em construção.",
			Description: "Um catálogo vivo do que venho programando, estudando e transformando em código.",
			Tags: []string{
				"GitHub",
				"backend",
				"frontend",
				"experimentos",
			},
			Guide: blogInfoCard{
				Eyebrow:     "catálogo",
				Title:       "Um retrato recente do GitHub",
				Description: "Os projetos aparecem conforme a atividade mais recente e podem ser explorados por linguagem ou ordem.",
				Items: []string{
					"Repositórios públicos carregados sob demanda.",
					"Filtro derivado das linguagens encontradas.",
					"Links para código e demonstração quando existirem.",
				},
			},
			Note: blogInfoCard{
				Eyebrow:     "nota",
				Description: "Se algum projeto pedir mais contexto, ele provavelmente vira texto no caderno técnico.",
				LinkLabel:   "Ir para o blog",
				LinkURL:     "/blog",
			},
		},
	}
}
