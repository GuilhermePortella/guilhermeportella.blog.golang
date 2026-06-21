package httptransport

import (
	"log/slog"
	"net/http"
	"time"
)

type curiosidadesPageData struct {
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
	Tags        []string
	QuickMap    []curiosidadesLinkCard
	Shortcuts   []curiosidadesLinkCard
	APIs        []curiosidadesAPICard
	Collections []curiosidadesCollection
	Songs       []curiosidadesSong
	Playlists   []curiosidadesPlaylist
}

type rickAndMortyPageData struct {
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

type curiosidadesLinkCard struct {
	Title       string
	Description string
	URL         string
}

type curiosidadesAPICard struct {
	Title       string
	Description string
	URL         string
	Source      string
	NewTab      bool
	Tags        []string
}

type curiosidadesCollection struct {
	ID          string
	Title       string
	Description string
	Theme       string
	Items       []string
}

type curiosidadesSong struct {
	Artist      string
	Title       string
	Album       string
	Description string
	SpotifyURI  string
	EmbedURL    string
	SpotifyURL  string
}

type curiosidadesPlaylist struct {
	Title      string
	Label      string
	SpotifyURI string
	EmbedURL   string
	SpotifyURL string
}

func curiosidadesHandler(renderer *Renderer, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data := newCuriosidadesPageData(time.Now(), r.URL.Path)

		if err := renderer.Render(w, "curiosidades", data); err != nil {
			logger.Error("render curiosidades page", "error", err, "request_id", getRequestID(r.Context()))
			renderUnexpectedErrorPage(w, r, renderer, logger, http.StatusInternalServerError)
		}
	}
}

func rickAndMortyHandler(renderer *Renderer, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data := newRickAndMortyPageData(time.Now(), r.URL.Path)

		if err := renderer.Render(w, "rick_and_morty", data); err != nil {
			logger.Error("render rick and morty page", "error", err, "request_id", getRequestID(r.Context()))
			renderUnexpectedErrorPage(w, r, renderer, logger, http.StatusInternalServerError)
		}
	}
}

func newCuriosidadesPageData(now time.Time, currentPath string) curiosidadesPageData {
	quickMap := []curiosidadesLinkCard{
		{
			Title:       "Filmes",
			Description: "Histórias que me acompanham há anos.",
			URL:         "#filmes",
		},
		{
			Title:       "Séries",
			Description: "Roteiros longos para ver sem pressa.",
			URL:         "#series",
		},
		{
			Title:       "Jogos",
			Description: "Experiências para mergulhar e desligar.",
			URL:         "#jogos",
		},
		{
			Title:       "Livros",
			Description: "Páginas que me fazem voltar para mim.",
			URL:         "#livros",
		},
	}

	return curiosidadesPageData{
		Title:         "Curiosidades",
		Description:   "Inventário pessoal de filmes, séries, jogos, livros, músicas e tecnologia de Guilherme Portella.",
		CanonicalURL:  "/curiosidades/",
		OpenGraphType: "website",
		TwitterCard:   "summary_large_image",
		Keywords:      "curiosidades, filmes, séries, jogos, livros, músicas, tecnologia",
		Locale:        "pt_BR",
		SiteName:      "Guilherme Portella",
		CurrentYear:   now.Year(),
		Navigation:    newSiteNavigation(currentPath),
		Tags: []string{
			"filmes",
			"séries",
			"jogos",
			"livros",
			"músicas",
			"tecnologia",
		},
		QuickMap: quickMap,
		Shortcuts: []curiosidadesLinkCard{
			quickMap[0],
			quickMap[1],
			quickMap[2],
			quickMap[3],
			{
				Title:       "Músicas",
				Description: "Trilha sonora que me deixa vivo.",
				URL:         "#musica",
			},
			{
				Title:       "Tecnologia",
				Description: "Canais e leituras que sigo com carinho.",
				URL:         "#tecnologia",
			},
		},
		APIs: []curiosidadesAPICard{
			{
				Title:       "NASA APOD",
				Description: "Uma janela para fotos, videos e explicacoes astronomicas da Astronomy Picture of the Day.",
				URL:         "/astronomia",
				Source:      "https://api.nasa.gov/planetary/apod",
				NewTab:      true,
				Tags: []string{
					"NASA",
					"APOD",
					"astronomia",
				},
			},
			{
				Title:       "Rick and Morty API",
				Description: "Portal para explorar personagens, locais e episodios consumidos da API publica oficial.",
				URL:         "/rick-morty",
				Source:      "https://rickandmortyapi.com/api",
				Tags: []string{
					"REST",
					"personagens",
					"locais",
					"episodios",
				},
			},
		},
		Collections: []curiosidadesCollection{
			{
				ID:          "filmes",
				Title:       "Filmes",
				Description: "Filmes que eu volto sempre que preciso de silêncio.",
				Theme:       "filmes",
				Items: []string{
					"Interstellar (Nolan)",
					"Gênio Indomável (Gus Van Sant)",
					"Sociedade dos Poetas Mortos (Peter Weir)",
					"O Silêncio dos Inocentes (Jonathan Demme)",
					"O Poderoso Chefão (Coppola)",
					"Brilho Eterno de uma Mente sem Lembranças (Michel Gondry)",
					"Blade Runner 2049 (Denis Villeneuve)",
				},
			},
			{
				ID:          "series",
				Title:       "Séries",
				Description: "Roteiros longos para ver sem pressa.",
				Theme:       "series",
				Items: []string{
					"Mr. Robot",
					"Rick and Morty",
					"Yellowstone",
					"The Big Bang Theory",
					"Breaking Bad",
					"Fleabag",
					"BoJack Horseman",
					"Game of Thrones",
					"The Walking Dead",
					"Família Soprano",
					"The Office",
				},
			},
			{
				ID:          "jogos",
				Title:       "Jogos",
				Description: "Experiências para mergulhar e desligar.",
				Theme:       "jogos",
				Items: []string{
					"The Last of Us - Parte I",
					"DEATH STRANDING 2: ON THE BEACH",
					"GTA 5",
					"The Last of Us - Parte II",
					"Days Gone",
					"God of War Ragnarok",
					"Horizon Forbidden West",
					"DEATH STRANDING",
					"Cyberpunk 2077",
					"Red Dead Redemption 2",
					"Detroit: Become Human",
				},
			},
			{
				ID:          "livros",
				Title:       "Livros",
				Description: "Páginas que me fazem voltar para mim.",
				Theme:       "livros",
				Items: []string{
					"A Metamorfose",
					"O Nascimento da Tragédia",
					"Drácula",
					"O Grande Gatsby",
					"Guerra e Paz",
					"Os Irmãos Karamazov",
					"Assim Falou Zaratustra",
					"O Morro dos Ventos Uivantes",
					"Noites Brancas",
					"A Morte de Ivan Ilitch",
					"Memórias do Subsolo",
					"Crime e Castigo",
					"1984",
				},
			},
			{
				ID:          "tecnologia",
				Title:       "Tecnologia",
				Description: "Canais e leituras que sigo com carinho.",
				Theme:       "tecnologia",
				Items: []string{
					"YouTube: canais de programação e desenvolvimento",
					"Podcasts de tecnologia e arquitetura de software",
					"Documentação e artigos que me inspiram",
					"Comunidades online de desenvolvimento",
				},
			},
		},
		Songs: []curiosidadesSong{
			{
				Artist:      "Elvis Presley",
				Title:       "Can't Help Falling in Love",
				Album:       "Blue Hawaii",
				Description: "Nessa musica, Elvis, de forma primorosa fala sobre amor e paixao e entrega ao amor, onde a pessoa se rende completamente, mesmo que a razao mostre o contrario, descrevendo o amor profundo e compromisso total.",
				SpotifyURI:  "spotify:track:44AyOl4qVkzS48vBsbNXaC",
				EmbedURL:    "https://open.spotify.com/embed/track/44AyOl4qVkzS48vBsbNXaC?utm_source=generator&theme=0",
				SpotifyURL:  "https://open.spotify.com/track/44AyOl4qVkzS48vBsbNXaC",
			},
			{
				Artist:      "Guns N'Roses",
				Title:       "November Rain",
				Album:       "Use Your Illusion I",
				Description: "Alem de ter um dos solos de guitarra mais bonitos e iconicos da historia do rock, essa musica fala sobre amor, perda, dor emocional e a luta para ter e manter a esperanca em meio a tantas dificuldades, a dor de qualquer emocionado por ai haha.",
				SpotifyURI:  "spotify:track:3YRCqOhFifThpSRFJ1VWFM",
				EmbedURL:    "https://open.spotify.com/embed/track/3YRCqOhFifThpSRFJ1VWFM?utm_source=generator&theme=0",
				SpotifyURL:  "https://open.spotify.com/track/3YRCqOhFifThpSRFJ1VWFM",
			},
			{
				Artist:      "Heart",
				Title:       "Alone",
				Album:       "Bad Animals",
				Description: "Essa musica fala sobre um amor nao correspondido, desejo intenso de se aproximar de alguem que e especial mas sem saber como, por medo de rejeicao ou pela certeza que nunca daria certo, mas o amor e real e existe no eu lirico da cancao.",
				SpotifyURI:  "spotify:track:54b8qPFqYqIndfdxiLApea",
				EmbedURL:    "https://open.spotify.com/embed/track/54b8qPFqYqIndfdxiLApea?utm_source=generator&theme=0",
				SpotifyURL:  "https://open.spotify.com/track/54b8qPFqYqIndfdxiLApea",
			},
			{
				Artist:      "Pearl Jam",
				Title:       "Black",
				Album:       "Ten",
				Description: "Nessa o Pearl Jam judiou, considera uma das mais tristes do rock, essa musica fala sobre dor profunda, perda e luto, e um desabafo do Eddie Vedder sobre o relacionamento que chegou ao fim, deixando uma cicatriz eterna e a saudade da pessoa que ele amava. Um primeiro amor intenso que chegou ao fim e a dor de aceitar o fim. Mas as vezes penso que o que nunca aconteceu pode machucar mais do que algo que aconteceu mas acabou, mas enfim so uma ideia, curte o som ai.",
				SpotifyURI:  "spotify:track:5Xak5fmy089t0FYmh3VJiY",
				EmbedURL:    "https://open.spotify.com/embed/track/5Xak5fmy089t0FYmh3VJiY?utm_source=generator&theme=0",
				SpotifyURL:  "https://open.spotify.com/track/5Xak5fmy089t0FYmh3VJiY",
			},
		},
		Playlists: []curiosidadesPlaylist{
			{
				Title:      "Playlist no Spotify - Guilherme Portella 01",
				Label:      "Playlist 1",
				SpotifyURI: "spotify:playlist:25cIH9UZsoIYdLxLu3F2jw",
				EmbedURL:   "https://open.spotify.com/embed/playlist/25cIH9UZsoIYdLxLu3F2jw?utm_source=generator&theme=0",
				SpotifyURL: "https://open.spotify.com/playlist/25cIH9UZsoIYdLxLu3F2jw",
			},
			{
				Title:      "Playlist no Spotify - Guilherme Portella 02",
				Label:      "Playlist 2",
				SpotifyURI: "spotify:playlist:3LuwLZF9DuqtT5n92wCmcU",
				EmbedURL:   "https://open.spotify.com/embed/playlist/3LuwLZF9DuqtT5n92wCmcU?utm_source=generator&theme=0",
				SpotifyURL: "https://open.spotify.com/playlist/3LuwLZF9DuqtT5n92wCmcU",
			},
		},
	}
}

func newRickAndMortyPageData(now time.Time, currentPath string) rickAndMortyPageData {
	return rickAndMortyPageData{
		Title:         "Rick and Morty API",
		Description:   "Portal interativo para explorar personagens, lugares e episódios da Rick and Morty API.",
		CanonicalURL:  "/rick-morty/",
		OpenGraphType: "website",
		TwitterCard:   "summary_large_image",
		Keywords:      "rick and morty, api, curiosidades, personagens, episódios, rest",
		Locale:        "pt_BR",
		SiteName:      "Guilherme Portella",
		CurrentYear:   now.Year(),
		Navigation:    newSiteNavigation(currentPath),
	}
}
