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
