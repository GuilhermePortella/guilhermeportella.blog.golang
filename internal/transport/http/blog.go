package httptransport

import (
	"fmt"
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"time"
)

type blogPageData struct {
	Title          string
	Description    string
	CanonicalURL   string
	OpenGraphImage string
	TwitterCard    string
	SiteName       string
	CurrentYear    int

	Navigation []siteNavLink
	Hero       blogHero
	Groups     []blogArticleGroup
	Years      []int
}

type blogHero struct {
	Eyebrow         string
	Title           string
	Description     string
	PrimaryAction   homeAction
	SecondaryAction homeAction
	Tags            []string
	Guide           blogInfoCard
	Note            blogInfoCard
}

type blogInfoCard struct {
	Eyebrow     string
	Title       string
	Description string
	Items       []string
	LinkLabel   string
	LinkURL     string
}

type blogArticle struct {
	Title       string
	Slug        string
	Summary     string
	PublishedAt string
	DateLabel   string
	Tags        []string
	Content     string
	SearchText  string
}

type blogGroupKey struct {
	Year  int
	Month int
}

type blogArticleGroup struct {
	ID         string
	Label      string
	MonthLabel string
	Key        blogGroupKey
	Items      []blogArticle
}

type parsedBlogDate struct {
	Date     time.Time
	DateOnly bool
	Attr     string
}

func blogHandler(renderer *Renderer, logger *slog.Logger, contentDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data, err := newBlogPageData(time.Now(), r.URL.Path, contentDir)
		if err != nil {
			logger.Error("load blog page", "error", err, "request_id", getRequestID(r.Context()))
			http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
			return
		}

		if err := renderer.Render(w, "blog", data); err != nil {
			logger.Error("render blog page", "error", err, "request_id", getRequestID(r.Context()))
			http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		}
	}
}

func newBlogPageData(now time.Time, currentPath string, contentDir string) (blogPageData, error) {
	articles, err := loadBlogArticles(contentDir)
	if err != nil {
		return blogPageData{}, err
	}
	groups := groupBlogArticlesByMonth(articles)

	return blogPageData{
		Title:        "Blog",
		Description:  "Arquivo de textos longos sobre engenharia de software, backend, arquitetura e decisões técnicas.",
		CanonicalURL: "https://guilhermeportella.github.io/blog",
		TwitterCard:  "summary_large_image",
		SiteName:     "Guilherme Portella",
		CurrentYear:  now.Year(),
		Navigation:   newSiteNavigation(currentPath),
		Hero: blogHero{
			Eyebrow:     "blog",
			Title:       "Textos longos sobre engenharia, arquitetura e decisões que merecem ficar.",
			Description: "Aqui ficam artigos mais completos, estudos de implementação e registros técnicos escritos com calma.",
			PrimaryAction: homeAction{
				Label: "Ver notas técnicas ->",
				URL:   "/notas",
			},
			SecondaryAction: homeAction{
				Label: "Ir para curiosidades ->",
				URL:   "/curiosidades",
			},
			Tags: []string{
				"Go",
				"backend",
				"arquitetura",
				"HTTP",
				"decisões técnicas",
			},
			Guide: blogInfoCard{
				Eyebrow:     "como ler",
				Title:       "Um arquivo vivo",
				Description: "Os textos são agrupados por data e podem ser encontrados por tema, resumo ou uma palavra lembrada.",
				Items: []string{
					"Textos mais longos e costurados.",
					"Busca por título, resumo e conteúdo.",
					"Filtros por ano e mês para leitura cronológica.",
				},
			},
			Note: blogInfoCard{
				Eyebrow:     "nota pessoal",
				Description: "Quando a ideia pede menos fôlego, ela aparece como nota curta em outra área.",
				LinkLabel:   "Ir para notas ->",
				LinkURL:     "/notas",
			},
		},
		Groups: groups,
		Years:  blogYears(groups),
	}, nil
}

func loadBlogArticles(contentDir string) ([]blogArticle, error) {
	articles, err := getAllMarkdownArticles(contentDir)
	if err != nil {
		return nil, err
	}

	items := make([]blogArticle, 0, len(articles))
	for _, article := range articles {
		items = append(items, blogArticle{
			Title:       article.Frontmatter.Title,
			Slug:        article.Slug,
			Summary:     article.Frontmatter.Summary,
			PublishedAt: article.Frontmatter.PublishedAt,
			Tags:        article.Frontmatter.Tags,
			Content:     stripMarkdown(article.Content),
		})
	}

	return prepareBlogArticles(items), nil
}

func prepareBlogArticles(articles []blogArticle) []blogArticle {
	prepared := append([]blogArticle(nil), articles...)
	sort.SliceStable(prepared, func(i, j int) bool {
		return blogSortTime(prepared[i].PublishedAt).After(blogSortTime(prepared[j].PublishedAt))
	})

	for index := range prepared {
		parsed, ok := parseBlogDate(prepared[index].PublishedAt)
		if ok {
			prepared[index].DateLabel = formatBlogDateLabel(parsed.Date, parsed.DateOnly)
		} else {
			prepared[index].DateLabel = "Sem data"
		}

		prepared[index].SearchText = strings.Join([]string{
			prepared[index].Title,
			prepared[index].Summary,
			prepared[index].Content,
		}, " ")
	}

	return prepared
}

func groupBlogArticlesByMonth(items []blogArticle) []blogArticleGroup {
	groups := make(map[string]*blogArticleGroup)

	for _, article := range items {
		parsed, ok := parseBlogDate(article.PublishedAt)
		date := time.Unix(0, 0).UTC()
		dateOnly := true
		if ok {
			date = parsed.Date
			dateOnly = parsed.DateOnly
		}

		year := date.Year()
		month := int(date.Month())
		if dateOnly {
			year = date.UTC().Year()
			month = int(date.UTC().Month())
		}

		id := fmt.Sprintf("%04d-%02d", year, month)
		monthLabel := monthTitlePTBR(time.Month(month))
		group, exists := groups[id]
		if !exists {
			group = &blogArticleGroup{
				ID:         id,
				Label:      fmt.Sprintf("%d - %s", year, monthLabel),
				MonthLabel: monthLabel,
				Key:        blogGroupKey{Year: year, Month: month},
			}
			groups[id] = group
		}

		group.Items = append(group.Items, article)
	}

	out := make([]blogArticleGroup, 0, len(groups))
	for _, group := range groups {
		out = append(out, *group)
	}

	sort.Slice(out, func(i, j int) bool {
		if out[i].Key.Year == out[j].Key.Year {
			return out[i].Key.Month > out[j].Key.Month
		}
		return out[i].Key.Year > out[j].Key.Year
	})

	return out
}

func blogYears(groups []blogArticleGroup) []int {
	seen := make(map[int]bool)
	var years []int
	for _, group := range groups {
		if seen[group.Key.Year] {
			continue
		}
		seen[group.Key.Year] = true
		years = append(years, group.Key.Year)
	}

	sort.Sort(sort.Reverse(sort.IntSlice(years)))
	return years
}

func parseBlogDate(raw string) (parsedBlogDate, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return parsedBlogDate{}, false
	}

	if date, err := time.Parse("2006-01-02", raw); err == nil {
		return parsedBlogDate{Date: date, DateOnly: true, Attr: raw}, true
	}

	if date, err := time.Parse(time.RFC3339, raw); err == nil {
		return parsedBlogDate{Date: date, DateOnly: false, Attr: date.Format(time.RFC3339)}, true
	}

	if date, err := time.Parse(time.RFC3339Nano, raw); err == nil {
		return parsedBlogDate{Date: date, DateOnly: false, Attr: date.Format(time.RFC3339Nano)}, true
	}

	return parsedBlogDate{}, false
}

func blogSortTime(raw string) time.Time {
	parsed, ok := parseBlogDate(raw)
	if !ok {
		return time.Unix(0, 0).UTC()
	}
	return parsed.Date
}

func formatBlogDateLabel(date time.Time, forceUTC bool) string {
	if forceUTC {
		date = date.UTC()
	}

	return fmt.Sprintf("%d de %s de %d", date.Day(), monthNamePTBR(date.Month()), date.Year())
}

func monthTitlePTBR(month time.Month) string {
	name := monthNamePTBR(month)
	if name == "" {
		return ""
	}

	return strings.ToUpper(name[:1]) + name[1:]
}

func monthNamePTBR(month time.Month) string {
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

	if month < time.January || month > time.December {
		return ""
	}

	return months[month]
}
