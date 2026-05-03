package blog

import (
	"context"
	"errors"
)

var ErrPostNotFound = errors.New("post not found")

type Repository interface {
	ListPublished(ctx context.Context) ([]Post, error)
	FindBySlug(ctx context.Context, slug string) (Post, error)
}
