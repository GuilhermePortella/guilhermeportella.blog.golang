package blog

import (
	"strings"
	"testing"
	"time"
)

func TestPostValidate(t *testing.T) {
	valid := Post{
		ID:          "post-1",
		Slug:        "meu-post",
		Title:       "Meu post",
		PublishedAt: time.Date(2026, 5, 4, 0, 0, 0, 0, time.UTC),
	}

	if err := valid.Validate(); err != nil {
		t.Fatalf("Validate() error = %v, want nil", err)
	}
}

func TestPostValidateReportsRequiredFields(t *testing.T) {
	post := Post{
		ID:    "  ",
		Slug:  "\t",
		Title: "",
	}

	err := post.Validate()
	if err == nil {
		t.Fatal("Validate() error = nil, want required field errors")
	}

	for _, expected := range []string{
		"post id is required",
		"post slug is required",
		"post title is required",
		"post published date is required",
	} {
		if !strings.Contains(err.Error(), expected) {
			t.Fatalf("Validate() error = %q, want it to contain %q", err.Error(), expected)
		}
	}
}

func TestPostValidateRejectsEachMissingFieldIndependently(t *testing.T) {
	for _, tc := range []struct {
		name    string
		change  func(*Post)
		message string
	}{
		{"id", func(p *Post) { p.ID = " \t" }, "post id is required"},
		{"slug", func(p *Post) { p.Slug = " \n" }, "post slug is required"},
		{"title", func(p *Post) { p.Title = "\t" }, "post title is required"},
		{"date", func(p *Post) { p.PublishedAt = time.Time{} }, "post published date is required"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			post := Post{ID: "1", Slug: "artigo", Title: "Artigo", PublishedAt: time.Date(2026, 5, 4, 0, 0, 0, 0, time.UTC)}
			tc.change(&post)
			err := post.Validate()
			if err == nil || err.Error() != tc.message {
				t.Fatalf("Validate() = %v, want %q", err, tc.message)
			}
		})
	}
}
