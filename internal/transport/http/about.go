package httptransport

import (
	"log/slog"
	"net/http"
	"time"
)

type aboutPageData struct {
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
	Pillars    []aboutTextCard
	Rituals    []string
}

type aboutTextCard struct {
	Title       string
	Description string
}

func aboutHandler(renderer *Renderer, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data := newAboutPageData(time.Now(), r.URL.Path)

		if err := renderer.Render(w, "about", data); err != nil {
			logger.Error("render about page", "error", err, "request_id", getRequestID(r.Context()))
			renderUnexpectedErrorPage(w, r, renderer, logger, http.StatusInternalServerError)
		}
	}
}

func newAboutPageData(now time.Time, currentPath string) aboutPageData {
	return aboutPageData{
		Title:         "Sobre",
		Description:   "Perfil técnico de Guilherme Portella, com foco em carreira, engenharia de software e aprendizados de desenvolvimento web.",
		CanonicalURL:  publicSiteURL + "/about/",
		OpenGraphType: "website",
		TwitterCard:   "summary_large_image",
		Locale:        "pt_BR",
		SiteName:      "Guilherme Portella",
		CurrentYear:   now.Year(),
		Navigation:    newSiteNavigation(currentPath),
		Pillars: []aboutTextCard{
			{
				Title:       "Clareza antes de esperteza",
				Description: "Prefiro soluções legíveis, documentadas na medida certa e fáceis de manter quando o futuro chega pedindo prazo.",
			},
			{
				Title:       "Aprendizado contínuo",
				Description: "Estudo frameworks, arquitetura, testes e produto com foco em aplicar melhor, não apenas colecionar siglas bonitas no README.",
			},
			{
				Title:       "Pragmatismo em produção",
				Description: "Boas decisões técnicas precisam sobreviver ao usuário real, ao deploy real e ao alerta real. O slide aceita tudo; o log nem sempre.",
			},
		},
		Rituals: []string{
			"Quebrar problemas grandes em entregas pequenas, porque monolito de tarefa também cobra juros.",
			"Revisar requisitos antes de codar para evitar implementar exatamente o que ninguém precisava.",
			"Escrever código pensando em manutenção, testes e na pessoa que vai debugar isso daqui a seis meses.",
			"Registrar aprendizados técnicos enquanto o contexto ainda está quente e o café ainda está exercendo seu cargo.",
		},
	}
}
