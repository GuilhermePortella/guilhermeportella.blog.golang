package httptransport

type BlogFeedItem struct {
	Title       string
	Slug        string
	Summary     string
	PublishedAt string
	Tags        []string
}

func ListBlogFeedItems(contentDir string) ([]BlogFeedItem, error) {
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

	prepared := prepareBlogArticles(items)
	feedItems := make([]BlogFeedItem, 0, len(prepared))
	for _, article := range prepared {
		feedItems = append(feedItems, BlogFeedItem{
			Title:       article.Title,
			Slug:        article.Slug,
			Summary:     article.Summary,
			PublishedAt: article.PublishedAt,
			Tags:        article.Tags,
		})
	}

	return feedItems, nil
}
