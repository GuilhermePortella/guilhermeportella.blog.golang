package httptransport

import (
	"log/slog"
	"net/http"
	"strings"
	"time"
)

type homePageData struct {
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

	Navigation     []siteNavLink
	Hero           homeHero
	QuickMap       homeQuickMap
	HeroCards      []homeLinkCard
	Shortcuts      []homeShortcut
	RecentArticles []homeArticle
	FAQs           []homeFAQ
}

type siteNavLink struct {
	Label  string
	URL    string
	Active bool
}

type homeHero struct {
	Eyebrow           string
	Title             string
	Description       string
	PrimaryAction     homeAction
	SecondaryAction   homeAction
	Tags              []string
	RoutesActionLabel string
	RoutesActionURL   string
}

type homeAction struct {
	Label string
	URL   string
}

type homeQuickMap struct {
	Eyebrow     string
	Title       string
	Description string
	Items       []homeMapItem
}

type homeMapItem struct {
	Title       string
	Description string
	URL         string
}

type homeLinkCard struct {
	Title       string
	Description string
	URL         string
}

type homeShortcut struct {
	Tag         string
	Title       string
	Description string
	URL         string
}

type homeArticle struct {
	Title       string
	Slug        string
	Excerpt     string
	PublishedAt string
	Tags        []string
}

type homeFAQ struct {
	Question  string
	Answer    string
	LinkLabel string
	LinkURL   string
}

func homeHandler(renderer *Renderer, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data := newHomePageData(time.Now(), r.URL.Path)

		if err := renderer.Render(w, "home", data); err != nil {
			logger.Error("render home page", "error", err, "request_id", getRequestID(r.Context()))
			renderUnexpectedErrorPage(w, r, renderer, logger, http.StatusInternalServerError)
		}
	}
}

func newHomePageData(now time.Time, currentPath string) homePageData {
	return homePageData{
		Title:        "Guilherme Portella",
		Description:  "Artigos técnicos sobre backend, arquitetura, Go, APIs e engenharia de software.",
		CanonicalURL: publicSiteURL + "/",
		TwitterCard:  "summary_large_image",
		SiteName:     "Guilherme Portella",
		CurrentYear:  now.Year(),
		Navigation:   newSiteNavigation(currentPath),
		Hero: homeHero{
			Eyebrow:     "blog técnico",
			Title:       "Engenharia de software, backend e arquitetura em notas práticas.",
			Description: "Um espaço para organizar estudos, decisões técnicas e experiências reais com desenvolvimento de software.",
			PrimaryAction: homeAction{
				Label: "Ler artigos",
				URL:   "#blog",
			},
			SecondaryAction: homeAction{
				Label: "Ver projetos",
				URL:   "/projetos",
			},
			Tags: []string{
				"Go",
				"backend",
				"arquitetura",
				"APIs",
				"boas práticas",
			},
			RoutesActionLabel: "Ir para os artigos recentes",
			RoutesActionURL:   "#blog",
		},
		QuickMap: homeQuickMap{
			Eyebrow:     "guia técnico",
			Title:       "Por onde começar",
			Description: "Acesse conteúdos por tema, profundidade ou contexto de aplicação.",
			Items: []homeMapItem{
				{
					Title:       "Notas técnicas",
					Description: "Registros curtos sobre decisões, padrões e aprendizados.",
					URL:         "/notas",
				},
				{
					Title:       "Artigos",
					Description: "Conteúdos mais completos sobre engenharia e backend.",
					URL:         "#blog",
				},
				{
					Title:       "Projetos",
					Description: "Experimentos, referências e materiais de apoio.",
					URL:         "/projetos",
				},
			},
		},
		HeroCards: []homeLinkCard{
			{
				Title:       "Laboratório técnico",
				Description: "Experimentos, estudos de caso e decisões de implementação.",
				URL:         "#blog",
			},
			{
				Title:       "Referências práticas",
				Description: "Ferramentas, leituras e recursos úteis para desenvolvimento.",
				URL:         "/curiosidades",
			},
		},
		Shortcuts: []homeShortcut{
			{
				Tag:         "artigos",
				Title:       "Artigos técnicos",
				Description: "Textos objetivos sobre backend, arquitetura, Go e construção de sistemas.",
				URL:         "#blog",
			},
			{
				Tag:         "projetos",
				Title:       "Projetos e referências",
				Description: "Experimentos, ferramentas e materiais que apoiam o trabalho técnico.",
				URL:         "/projetos",
			},
			{
				Tag:         "guia",
				Title:       "Mapa técnico",
				Description: "Um guia rápido para localizar temas, formatos e pontos de partida.",
				URL:         "#mapa",
			},
			{
				Tag:         "notas",
				Title:       "Notas rápidas",
				Description: "Anotações curtas sobre práticas, problemas recorrentes e soluções.",
				URL:         "/notas",
			},
		},
		RecentArticles: []homeArticle{
			{
				Title:       "Estruturando um serviço Go para crescer com segurança",
				Slug:        "um-comeco-sem-pressa",
				Excerpt:     "Uma visão prática sobre organização de pacotes, configuração, transporte HTTP e pontos de extensão.",
				PublishedAt: formatDatePTBR(time.Date(2026, time.May, 3, 0, 0, 0, 0, time.UTC)),
				Tags:        []string{"Go", "arquitetura"},
			},
			{
				Title:       "Handlers HTTP previsíveis e fáceis de testar",
				Slug:        "coisas-que-ficam-depois-do-estudo",
				Excerpt:     "Padrões simples para tratar requests, respostas, logs e erros sem espalhar complexidade.",
				PublishedAt: formatDatePTBR(time.Date(2026, time.May, 1, 0, 0, 0, 0, time.UTC)),
				Tags:        []string{"HTTP", "testes"},
			},
			{
				Title:       "Separando domínio, transporte e infraestrutura",
				Slug:        "separando-camadas",
				Excerpt:     "Como manter regras de negócio protegidas enquanto a aplicação ganha rotas, templates e integrações.",
				PublishedAt: formatDatePTBR(time.Date(2026, time.April, 29, 0, 0, 0, 0, time.UTC)),
				Tags:        []string{"design", "backend"},
			},
			{
				Title:       "ADRs como ferramenta de comunicação técnica",
				Slug:        "bilhetes-para-dias-comuns",
				Excerpt:     "Por que registrar contexto, decisão e consequências ajuda a manter projetos compreensíveis.",
				PublishedAt: formatDatePTBR(time.Date(2026, time.April, 26, 0, 0, 0, 0, time.UTC)),
				Tags:        []string{"processo", "arquitetura"},
			},
		},
		FAQs: []homeFAQ{
			{
				Question: "Qual é o foco deste site?",
				Answer:   "O foco é compartilhar conteúdo técnico sobre engenharia de software, backend, arquitetura, Go e práticas de desenvolvimento.",
			},
			{
				Question: "Com que frequência há novos conteúdos?",
				Answer:   "A publicação acompanha estudos, projetos e aprendizados práticos. A prioridade é qualidade, clareza e utilidade técnica.",
			},
			{
				Question: "Quais temas aparecem por aqui?",
				Answer:   "Arquitetura de aplicações, APIs, Go, HTTP, testes, organização de código, documentação técnica e decisões de projeto.",
			},
			{
				Question:  "O conteúdo é baseado em experiência prática?",
				Answer:    "Sim. Os textos partem de estudos, implementações reais, decisões arquiteturais e problemas comuns em projetos de software.",
				LinkLabel: "Ver notas técnicas",
				LinkURL:   "/notas",
			},
		},
	}
}

func newSiteNavigation(currentPath string) []siteNavLink {
	links := []siteNavLink{
		{Label: "Início", URL: "/"},
		{Label: "Cadernos", URL: "/blog"},
		{Label: "Projetos", URL: "/projetos"},
		{Label: "Jogos", URL: "/jogos"},
		{Label: "Curiosidades", URL: "/curiosidades"},
		{Label: "Notas", URL: "/notas"},
		{Label: "Sobre", URL: "/about"},
	}

	pathname := normalizeSitePath(currentPath)
	if pathname == "/articles" || strings.HasPrefix(pathname, "/articles/") {
		pathname = "/blog"
	}
	if pathname == "/projects" || strings.HasPrefix(pathname, "/projects/") {
		pathname = "/projetos"
	}
	if pathname == "/games" || strings.HasPrefix(pathname, "/games/") {
		pathname = "/jogos"
	}
	if pathname == "/astronomia" || strings.HasPrefix(pathname, "/astronomia/") {
		pathname = "/curiosidades"
	}
	if pathname == "/rick-morty" || strings.HasPrefix(pathname, "/rick-morty/") {
		pathname = "/curiosidades"
	}
	for index := range links {
		clean := normalizeSitePath(links[index].URL)
		links[index].Active = pathname == clean || (clean != "/" && strings.HasPrefix(pathname, clean))
	}

	return links
}

func normalizeSitePath(path string) string {
	clean := strings.TrimRight(path, "/")
	if clean == "" {
		return "/"
	}

	return clean
}

func formatDatePTBR(date time.Time) string {
	months := [...]string{
		"",
		"janeiro",
		"fevereiro",
		"março",
		"abril",
		"maio",
		"junho",
		"julho",
		"agosto",
		"setembro",
		"outubro",
		"novembro",
		"dezembro",
	}

	return date.Format("2") + " de " + months[date.Month()] + " de " + date.Format("2006")
}
