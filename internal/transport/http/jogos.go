package httptransport

import (
	"errors"
	"log/slog"
	"net/http"
	"time"
)

var errGameNotFound = errors.New("game not found")

type jogosPageData struct {
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
	Hero       jogosHero
	Games      []gameCard
}

type jogoPageData struct {
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
	Game       gameCard
	Related    []gameCard
}

type jogosHero struct {
	Eyebrow     string
	Title       string
	Description string
	Tags        []string
}

type gameCard struct {
	Slug         string
	Title        string
	ShortTitle   string
	Description  string
	Intro        string
	URL          string
	Status       string
	Difficulty   string
	Duration     string
	Accent       string
	Tags         []string
	Instructions []string
}

func jogosHandler(renderer *Renderer, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data := newJogosPageData(time.Now(), r.URL.Path)

		if err := renderer.Render(w, "jogos", data); err != nil {
			logger.Error("render jogos page", "error", err, "request_id", getRequestID(r.Context()))
			renderUnexpectedErrorPage(w, r, renderer, logger, http.StatusInternalServerError)
		}
	}
}

func jogoHandler(renderer *Renderer, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data, err := newJogoPageData(time.Now(), r.URL.Path, r.PathValue("slug"))
		if err != nil {
			if errors.Is(err, errGameNotFound) {
				renderNotFoundPage(w, r, renderer, logger, http.StatusNotFound)
				return
			}
			logger.Error("load jogo page", "error", err, "request_id", getRequestID(r.Context()))
			renderUnexpectedErrorPage(w, r, renderer, logger, http.StatusInternalServerError)
			return
		}

		if err := renderer.Render(w, "jogo", data); err != nil {
			logger.Error("render jogo page", "error", err, "request_id", getRequestID(r.Context()))
			renderUnexpectedErrorPage(w, r, renderer, logger, http.StatusInternalServerError)
		}
	}
}

func newJogosPageData(now time.Time, currentPath string) jogosPageData {
	games := allGames()

	return jogosPageData{
		Title:         "Jogos",
		Description:   "Hub de jogos rápidos e experimentos interativos de Guilherme Portella.",
		CanonicalURL:  "/jogos/",
		OpenGraphType: "website",
		TwitterCard:   "summary_large_image",
		Keywords:      "jogos, games, experimentos, interativo, web",
		Locale:        "pt_BR",
		SiteName:      "Guilherme Portella",
		CurrentYear:   now.Year(),
		Navigation:    newSiteNavigation(currentPath),
		Hero: jogosHero{
			Eyebrow:     "jogos",
			Title:       "Um pequeno hub para jogar, testar ideias e descansar a cabeça.",
			Description: "Cada card abre uma página própria com um jogo simples rodando direto no navegador.",
			Tags: []string{
				"memória",
				"reflexo",
				"sequência",
				"experimentos web",
			},
		},
		Games: games,
	}
}

func newJogoPageData(now time.Time, currentPath string, slug string) (jogoPageData, error) {
	game, ok := gameBySlug(slug)
	if !ok {
		return jogoPageData{}, errGameNotFound
	}

	return jogoPageData{
		Title:         game.Title + " | Jogos",
		Description:   game.Description,
		CanonicalURL:  game.URL + "/",
		OpenGraphType: "website",
		TwitterCard:   "summary_large_image",
		Keywords:      "jogo, game, " + game.ShortTitle + ", interativo",
		Locale:        "pt_BR",
		SiteName:      "Guilherme Portella",
		CurrentYear:   now.Year(),
		Navigation:    newSiteNavigation(currentPath),
		Game:          game,
		Related:       relatedGames(game.Slug),
	}, nil
}

func allGames() []gameCard {
	return []gameCard{
		{
			Slug:        "memoria-relampago",
			Title:       "Memória Relâmpago",
			ShortTitle:  "Memória",
			Description: "Um jogo de pares para aquecer a atenção: vire cartas, encontre combinações e tente fechar em poucas jogadas.",
			Intro:       "Encontre todos os pares do tabuleiro. O desafio é terminar com o menor número de jogadas possível.",
			URL:         "/jogos/memoria-relampago",
			Status:      "jogável",
			Difficulty:  "leve",
			Duration:    "2 min",
			Accent:      "teal",
			Tags:        []string{"memória", "cartas", "atenção"},
			Instructions: []string{
				"Clique em duas cartas por vez.",
				"Pares iguais ficam abertos no tabuleiro.",
				"Use reiniciar para embaralhar tudo de novo.",
			},
		},
		{
			Slug:        "sequencia-de-cores",
			Title:       "Sequência de Cores",
			ShortTitle:  "Sequência",
			Description: "Observe a ordem das luzes e repita a sequência. Cada rodada adiciona uma nova cor.",
			Intro:       "Memorize a sequência iluminada e repita sem errar. A rodada cresce a cada acerto.",
			URL:         "/jogos/sequencia-de-cores",
			Status:      "jogável",
			Difficulty:  "médio",
			Duration:    "3 min",
			Accent:      "amber",
			Tags:        []string{"sequência", "cores", "foco"},
			Instructions: []string{
				"Clique em começar para ver a primeira cor.",
				"Repita a sequência completa depois que as luzes apagarem.",
				"Um erro encerra a partida e mostra sua pontuação.",
			},
		},
		{
			Slug:        "clique-rapido",
			Title:       "Clique Rápido",
			ShortTitle:  "Reflexo",
			Description: "Teste seu tempo de reação: espere o alvo acender e clique o mais rápido que conseguir.",
			Intro:       "Inicie uma rodada, segure a ansiedade e clique somente quando o alvo mudar de estado.",
			URL:         "/jogos/clique-rapido",
			Status:      "jogável",
			Difficulty:  "rápido",
			Duration:    "1 min",
			Accent:      "rose",
			Tags:        []string{"reflexo", "tempo", "precisão"},
			Instructions: []string{
				"Clique em iniciar rodada.",
				"Espere o alvo ficar ativo.",
				"Clicar cedo demais cancela a rodada.",
			},
		},
		{
			Slug:        "paciencia-klondike",
			Title:       "Paciência Klondike",
			ShortTitle:  "Paciência",
			Description: "A clássica paciência de cartas em uma versão limpa para o navegador: organize o tableau e leve cada naipe até a fundação.",
			Intro:       "Compre cartas, monte sequências em ordem decrescente e complete as quatro fundações por naipe.",
			URL:         "/jogos/paciencia-klondike",
			Status:      "jogável",
			Difficulty:  "clássico",
			Duration:    "10 min",
			Accent:      "blue",
			Tags:        []string{"cartas", "klondike", "estratégia"},
			Instructions: []string{
				"Clique no monte para comprar uma carta.",
				"No tableau, mova cartas em ordem decrescente alternando cores.",
				"Complete as fundações subindo do Ás ao Rei em cada naipe.",
			},
		},
		{
			Slug:        "dama-brasileira",
			Title:       "Dama Brasileira",
			ShortTitle:  "Dama",
			Description: "Dama em tabuleiro 8x8 com captura obrigatória, regra da maioria, captura múltipla e dama voadora.",
			Intro:       "Jogue dama brasileira contra outra pessoa no mesmo navegador ou desafie a máquina nas peças pretas.",
			URL:         "/jogos/dama-brasileira",
			Status:      "jogável",
			Difficulty:  "estratégia",
			Duration:    "8 min",
			Accent:      "green",
			Tags:        []string{"tabuleiro", "dama", "estratégia"},
			Instructions: []string{
				"Brancas começam a partida.",
				"Quando houver captura, a captura é obrigatória.",
				"Se existir mais de uma captura, vale a sequência com mais peças.",
			},
		},
		{
			Slug:        "snake",
			Title:       "Snake Classic",
			ShortTitle:  "Snake",
			Description: "Releitura do clássico Snake com tela escura, ritmo progressivo, vidas extras e controle por teclado ou toque.",
			Intro:       "Guie a cobrinha pelo tabuleiro escuro, colete a comida e evite bater nas bordas ou no próprio corpo.",
			URL:         "/jogos/snake",
			Status:      "jogável",
			Difficulty:  "arcade",
			Duration:    "3 min",
			Accent:      "green",
			Tags:        []string{"canvas", "arcade", "reflexo"},
			Instructions: []string{
				"Use as setas ou WASD para mudar a direção.",
				"Em telas touch, deslize no tabuleiro para virar.",
				"Ganhe vidas extras aos 50, 100 e 150 pontos.",
				"Ao usar uma vida, a cobrinha volta ao centro com uma breve recuperação.",
			},
		},
	}
}

func gameBySlug(slug string) (gameCard, bool) {
	for _, game := range allGames() {
		if game.Slug == slug {
			return game, true
		}
	}
	return gameCard{}, false
}

func relatedGames(slug string) []gameCard {
	var related []gameCard
	for _, game := range allGames() {
		if game.Slug != slug {
			related = append(related, game)
		}
	}
	return related
}
