package blog

import (
	"errors"
	"strings"
	"time"
)

type PostID string

type Post struct {
	ID          PostID
	Slug        string
	Title       string
	Excerpt     string
	Body        string
	Tags        []string
	PublishedAt time.Time
	UpdatedAt   time.Time
}

func (p Post) Validate() error {
	var errs []error

	if strings.TrimSpace(string(p.ID)) == "" {
		errs = append(errs, errors.New("post id is required"))
	}

	if strings.TrimSpace(p.Slug) == "" {
		errs = append(errs, errors.New("post slug is required"))
	}

	if strings.TrimSpace(p.Title) == "" {
		errs = append(errs, errors.New("post title is required"))
	}

	if p.PublishedAt.IsZero() {
		errs = append(errs, errors.New("post published date is required"))
	}

	return errors.Join(errs...)
}
