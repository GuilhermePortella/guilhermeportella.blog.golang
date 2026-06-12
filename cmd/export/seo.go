package main

import (
	"encoding/xml"
	"errors"
	"fmt"
	"net/url"
	"path"
	"path/filepath"
	"strings"
)

const defaultSiteURL = "https://guilhermeportella.github.io"

func shouldIndexRoute(route string) bool {
	switch route {
	case "/404", "/erro", "/articles", "/games", "/projects", "/curiosidades/rick-and-morty":
		return false
	default:
		return true
	}
}

func normalizeSiteURL(siteURL string) (string, error) {
	value := strings.TrimSpace(siteURL)
	if value == "" {
		return "", errors.New("site URL is required")
	}

	parsed, err := url.Parse(value)
	if err != nil {
		return "", fmt.Errorf("parse site URL %q: %w", siteURL, err)
	}
	if parsed.Scheme != "https" && parsed.Scheme != "http" {
		return "", fmt.Errorf("site URL must use http or https, got %q", siteURL)
	}
	if parsed.Host == "" {
		return "", fmt.Errorf("site URL must include a host, got %q", siteURL)
	}
	if parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", fmt.Errorf("site URL must not include query or fragment, got %q", siteURL)
	}

	parsed.Path = strings.TrimRight(parsed.Path, "/")
	parsed.RawPath = ""
	return parsed.String(), nil
}

func (exporter exporter) writeSitemap(routes []string) error {
	type sitemapURL struct {
		Location string `xml:"loc"`
	}
	type sitemapURLSet struct {
		XMLName xml.Name     `xml:"urlset"`
		XMLNS   string       `xml:"xmlns,attr"`
		URLs    []sitemapURL `xml:"url"`
	}

	urls := make([]sitemapURL, 0, len(routes))
	for _, route := range routes {
		if shouldIndexRoute(route) {
			urls = append(urls, sitemapURL{Location: exporter.absoluteURL(canonicalSitemapRoute(route))})
		}
	}

	payload, err := xml.MarshalIndent(sitemapURLSet{
		XMLNS: "http://www.sitemaps.org/schemas/sitemap/0.9",
		URLs:  urls,
	}, "", "  ")
	if err != nil {
		return fmt.Errorf("build sitemap: %w", err)
	}

	body := append([]byte(xml.Header), payload...)
	body = append(body, '\n')
	if err := writePublicFile(filepath.Join(exporter.outputDir, "sitemap.xml"), body); err != nil {
		return fmt.Errorf("write sitemap.xml: %w", err)
	}
	return nil
}

func (exporter exporter) writeRobots() error {
	body := fmt.Sprintf("User-agent: *\nAllow: /\nSitemap: %s\n", exporter.absoluteURL("/sitemap.xml"))
	if err := writePublicFile(filepath.Join(exporter.outputDir, "robots.txt"), []byte(body)); err != nil {
		return fmt.Errorf("write robots.txt: %w", err)
	}
	return nil
}

func (exporter exporter) absoluteURL(route string) string {
	cleanRoute := path.Clean("/" + strings.TrimPrefix(route, "/"))
	if cleanRoute == "/." {
		cleanRoute = "/"
	}
	if cleanRoute != "/" && strings.HasSuffix(route, "/") {
		cleanRoute += "/"
	}

	prefix := exporter.siteURL + exporter.basePath
	if cleanRoute == "/" {
		return prefix + "/"
	}
	return prefix + cleanRoute
}

func canonicalSitemapRoute(route string) string {
	cleanRoute := path.Clean("/" + strings.TrimPrefix(route, "/"))
	switch cleanRoute {
	case "/", "/about", "/curiosidades", "/jogos", "/projetos", "/rick-morty":
		return trailingSlash(cleanRoute)
	default:
		if strings.HasPrefix(cleanRoute, "/jogos/") {
			return trailingSlash(cleanRoute)
		}
		return cleanRoute
	}
}

func trailingSlash(route string) string {
	if route == "/" || strings.HasSuffix(route, "/") {
		return route
	}
	return route + "/"
}
