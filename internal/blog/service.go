package blog

import (
	"context"
	"errors"
	"strings"
)

type Service struct {
	repository Repository
}

func NewService(repository Repository) (*Service, error) {
	if repository == nil {
		return nil, errors.New("blog repository is required")
	}

	return &Service{
		repository: repository,
	}, nil
}

func (s *Service) ListPublished(ctx context.Context) ([]Post, error) {
	return s.repository.ListPublished(ctx)
}

func (s *Service) FindBySlug(ctx context.Context, slug string) (Post, error) {
	slug = strings.TrimSpace(slug)
	if slug == "" {
		return Post{}, ErrPostNotFound
	}

	return s.repository.FindBySlug(ctx, slug)
}
