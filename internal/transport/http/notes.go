package httptransport

import (
	"fmt"
	"html/template"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const notesPerPage = 21

type notesPageData struct {
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
	Hero       notesHero
	Notes      []noteItem
	TagStats   []noteTagStat
	PerPage    int
}

type notesHero struct {
	Eyebrow     string
	Title       string
	Description string
	Guide       blogInfoCard
}

type noteItem struct {
	Slug      string
	Title     string
	Tag       string
	Date      string
	DateLabel string
	Label     string
	HTML      template.HTML
	SortTime  time.Time
}

type noteTagStat struct {
	Tag   string
	Count int
}

func notesHandler(renderer *Renderer, logger *slog.Logger, notesDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data, err := newNotesPageData(time.Now(), r.URL.Path, notesDir)
		if err != nil {
			logger.Error("load notes page", "error", err, "request_id", getRequestID(r.Context()))
			renderUnexpectedErrorPage(w, r, renderer, logger, http.StatusInternalServerError)
			return
		}

		if err := renderer.Render(w, "notes", data); err != nil {
			logger.Error("render notes page", "error", err, "request_id", getRequestID(r.Context()))
			renderUnexpectedErrorPage(w, r, renderer, logger, http.StatusInternalServerError)
		}
	}
}

func newNotesPageData(now time.Time, currentPath string, notesDir string) (notesPageData, error) {
	notes, err := loadNotes(notesDir)
	if err != nil {
		return notesPageData{}, err
	}

	return notesPageData{
		Title:        "Notas",
		Description:  "Bilhetes curtos e frases soltas que aparecem no dia a dia.",
		CanonicalURL: publicSiteURL + "/notas",
		TwitterCard:  "summary_large_image",
		SiteName:     "Guilherme Portella",
		CurrentYear:  now.Year(),
		Navigation:   newSiteNavigation(currentPath),
		Hero: notesHero{
			Eyebrow:     "notas recentes",
			Title:       "Bilhetes curtos, como papel preso na parede.",
			Description: "Aqui ficam frases rápidas e lembretes pequenos. Não precisam virar texto longo para existirem.",
			Guide: blogInfoCard{
				Eyebrow:     "como funciona",
				Title:       "Pequenas notas, sem ordem",
				Description: "São frases soltas. Quando um pensamento pede para ficar, ele aparece aqui.",
				Items: []string{
					"Algumas linhas são leves.",
					"Outras ficam mais sérias.",
					"Todas são verdadeiras.",
				},
			},
		},
		Notes:    notes,
		TagStats: noteTagStats(notes),
		PerPage:  notesPerPage,
	}, nil
}

func loadNotes(notesDir string) ([]noteItem, error) {
	files, err := listMarkdownFiles(notesDir)
	if err != nil {
		return nil, err
	}
	if len(files) == 0 {
		return nil, nil
	}

	notesRoot, err := os.OpenRoot(notesDir)
	if err != nil {
		return nil, fmt.Errorf("open notes dir %q: %w", notesDir, err)
	}
	defer notesRoot.Close()

	notes := make([]noteItem, 0, len(files))
	for _, filePath := range files {
		note, err := readNote(notesRoot, notesDir, filePath)
		if err != nil {
			return nil, err
		}
		notes = append(notes, note)
	}

	sort.SliceStable(notes, func(i, j int) bool {
		return notes[i].SortTime.After(notes[j].SortTime)
	})

	return notes, nil
}

func readNote(notesRoot *os.Root, notesDir string, filePath string) (noteItem, error) {
	article, err := readMarkdownArticle(notesRoot, notesDir, filePath)
	if err != nil {
		return noteItem{}, err
	}

	data := article.FrontmatterData
	date := stringFromFrontmatter(data, "date")
	parsed, ok := parseBlogDate(date)
	sortTime := time.Unix(0, 0).UTC()
	dateLabel := "Sem data"
	if ok {
		sortTime = parsed.Date
		dateLabel = formatNoteDateLabel(parsed.Date, parsed.DateOnly)
	}

	tag := stringFromFrontmatter(data, "tag")
	if tag == "" {
		tag = "nota"
	}

	slug := normalizeSlug(stringFromFrontmatter(data, "slug"))
	if slug == "" {
		slug = normalizeSlug(fileBase(filepath.Base(filePath)))
	}

	return noteItem{
		Slug:      slug,
		Title:     stringFromFrontmatter(data, "title"),
		Tag:       tag,
		Date:      date,
		DateLabel: dateLabel,
		Label:     stringFromFrontmatter(data, "label"),
		HTML:      article.HTML,
		SortTime:  sortTime,
	}, nil
}

func noteTagStats(notes []noteItem) []noteTagStat {
	counts := make(map[string]int)
	for _, note := range notes {
		tag := note.Tag
		if tag == "" {
			tag = "nota"
		}
		counts[tag]++
	}

	stats := make([]noteTagStat, 0, len(counts))
	for tag, count := range counts {
		stats = append(stats, noteTagStat{Tag: tag, Count: count})
	}

	sort.Slice(stats, func(i, j int) bool {
		left := strings.ToLower(stats[i].Tag)
		right := strings.ToLower(stats[j].Tag)
		if left == right {
			return stats[i].Tag < stats[j].Tag
		}
		return left < right
	})

	return stats
}

func formatNoteDateLabel(date time.Time, forceUTC bool) string {
	if forceUTC {
		date = date.UTC()
	}
	return fmt.Sprintf("%s %d", shortMonthNamePTBR(date.Month()), date.Year())
}

func shortMonthNamePTBR(month time.Month) string {
	months := [...]string{
		"",
		"jan",
		"fev",
		"mar",
		"abr",
		"mai",
		"jun",
		"jul",
		"ago",
		"set",
		"out",
		"nov",
		"dez",
	}
	if month < time.January || month > time.December {
		return ""
	}
	return months[month]
}
