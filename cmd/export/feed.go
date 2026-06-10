package main

import (
	"encoding/xml"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	httptransport "github.com/guilhermeportella/guilhermeportella.github.io/internal/transport/http"
)

func (exporter exporter) writeFeed() error {
	items, err := httptransport.ListBlogFeedItems(exporter.contentDir)
	if err != nil {
		return fmt.Errorf("load feed articles: %w", err)
	}

	feed := rssFeed{
		Version: "2.0",
		AtomNS:  "http://www.w3.org/2005/Atom",
		Channel: rssChannel{
			Title:       "Guilherme Portella - artigos",
			Link:        exporter.absoluteURL("/blog"),
			Description: "Artigos técnicos sobre backend, arquitetura, Go, APIs e engenharia de software.",
			Language:    "pt-BR",
			AtomLink: rssAtomLink{
				Href: exporter.absoluteURL("/feed.xml"),
				Rel:  "self",
				Type: "application/rss+xml",
			},
			Items: rssItemsFromBlog(items, exporter),
		},
	}

	payload, err := xml.MarshalIndent(feed, "", "  ")
	if err != nil {
		return fmt.Errorf("build feed.xml: %w", err)
	}

	body := append([]byte(xml.Header), payload...)
	body = append(body, '\n')
	if err := os.WriteFile(filepath.Join(exporter.outputDir, "feed.xml"), body, 0o644); err != nil {
		return fmt.Errorf("write feed.xml: %w", err)
	}
	return nil
}

type rssFeed struct {
	XMLName xml.Name   `xml:"rss"`
	Version string     `xml:"version,attr"`
	AtomNS  string     `xml:"xmlns:atom,attr"`
	Channel rssChannel `xml:"channel"`
}

type rssChannel struct {
	Title       string      `xml:"title"`
	Link        string      `xml:"link"`
	Description string      `xml:"description"`
	Language    string      `xml:"language"`
	AtomLink    rssAtomLink `xml:"atom:link"`
	Items       []rssItem   `xml:"item"`
}

type rssAtomLink struct {
	Href string `xml:"href,attr"`
	Rel  string `xml:"rel,attr"`
	Type string `xml:"type,attr"`
}

type rssItem struct {
	Title       string        `xml:"title"`
	Link        string        `xml:"link"`
	GUID        rssGUID       `xml:"guid"`
	Description string        `xml:"description"`
	PubDate     string        `xml:"pubDate,omitempty"`
	Categories  []rssCategory `xml:"category,omitempty"`
}

type rssGUID struct {
	IsPermaLink string `xml:"isPermaLink,attr"`
	Value       string `xml:",chardata"`
}

type rssCategory struct {
	Value string `xml:",chardata"`
}

func rssItemsFromBlog(items []httptransport.BlogFeedItem, exporter exporter) []rssItem {
	out := make([]rssItem, 0, len(items))
	for _, item := range items {
		link := exporter.absoluteURL("/blog/" + item.Slug)
		out = append(out, rssItem{
			Title:       item.Title,
			Link:        link,
			GUID:        rssGUID{IsPermaLink: "true", Value: link},
			Description: item.Summary,
			PubDate:     rssPubDate(item.PublishedAt),
			Categories:  rssCategories(item.Tags),
		})
	}
	return out
}

func rssPubDate(raw string) string {
	raw = strings.TrimSpace(raw)
	if parsed, err := time.Parse("2006-01-02", raw); err == nil {
		return parsed.UTC().Format(time.RFC1123Z)
	}
	if parsed, err := time.Parse(time.RFC3339Nano, raw); err == nil {
		return parsed.UTC().Format(time.RFC1123Z)
	}
	return ""
}

func rssCategories(tags []string) []rssCategory {
	categories := make([]rssCategory, 0, len(tags))
	for _, tag := range tags {
		tag = strings.TrimSpace(tag)
		if tag != "" {
			categories = append(categories, rssCategory{Value: tag})
		}
	}
	return categories
}
