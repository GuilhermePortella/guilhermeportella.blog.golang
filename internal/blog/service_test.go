package blog

import (
	"context"
	"errors"
	"testing"
)

func TestNewServiceRequiresRepository(t *testing.T) {
	service, err := NewService(nil)
	if err == nil {
		t.Fatal("NewService(nil) error = nil, want error")
	}
	if service != nil {
		t.Fatalf("NewService(nil) service = %#v, want nil", service)
	}
}

func TestServiceListPublishedDelegatesToRepository(t *testing.T) {
	want := []Post{{ID: "post-1", Slug: "post-1", Title: "Post 1"}}
	repository := &fakeRepository{listPosts: want}
	service, err := NewService(repository)
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}

	got, err := service.ListPublished(context.Background())
	if err != nil {
		t.Fatalf("ListPublished() error = %v", err)
	}
	if !repository.listCalled {
		t.Fatal("ListPublished() did not call repository")
	}
	if len(got) != 1 || got[0].Slug != want[0].Slug {
		t.Fatalf("ListPublished() = %#v, want %#v", got, want)
	}
}

func TestServiceFindBySlugTrimsAndDelegatesToRepository(t *testing.T) {
	want := Post{ID: "post-1", Slug: "meu-post", Title: "Meu post"}
	repository := &fakeRepository{findPost: want}
	service, err := NewService(repository)
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}

	got, err := service.FindBySlug(context.Background(), "  meu-post \n")
	if err != nil {
		t.Fatalf("FindBySlug() error = %v", err)
	}
	if repository.findSlug != "meu-post" {
		t.Fatalf("repository slug = %q, want meu-post", repository.findSlug)
	}
	if got.Slug != want.Slug {
		t.Fatalf("FindBySlug() = %#v, want %#v", got, want)
	}
}

func TestServiceFindBySlugRejectsBlankSlug(t *testing.T) {
	repository := &fakeRepository{}
	service, err := NewService(repository)
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}

	_, err = service.FindBySlug(context.Background(), " \t")
	if !errors.Is(err, ErrPostNotFound) {
		t.Fatalf("FindBySlug(blank) error = %v, want ErrPostNotFound", err)
	}
	if repository.findCalled {
		t.Fatal("FindBySlug(blank) called repository")
	}
}

func TestServiceFindBySlugPropagatesRepositoryError(t *testing.T) {
	wantErr := errors.New("repository failed")
	repository := &fakeRepository{findErr: wantErr}
	service, err := NewService(repository)
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}

	_, err = service.FindBySlug(context.Background(), "meu-post")
	if !errors.Is(err, wantErr) {
		t.Fatalf("FindBySlug() error = %v, want %v", err, wantErr)
	}
}

type fakeRepository struct {
	listPosts  []Post
	listErr    error
	listCalled bool

	findPost   Post
	findErr    error
	findSlug   string
	findCalled bool
}

func (repository *fakeRepository) ListPublished(ctx context.Context) ([]Post, error) {
	repository.listCalled = true
	return repository.listPosts, repository.listErr
}

func (repository *fakeRepository) FindBySlug(ctx context.Context, slug string) (Post, error) {
	repository.findCalled = true
	repository.findSlug = slug
	return repository.findPost, repository.findErr
}
