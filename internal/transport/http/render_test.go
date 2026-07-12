package httptransport

import "testing"

func TestPageTitle(t *testing.T) {
	tests := []struct {
		name     string
		title    string
		siteName string
		want     string
	}{
		{
			name:     "adds site name",
			title:    "Projetos",
			siteName: "Guilherme Portella",
			want:     "Projetos | Guilherme Portella",
		},
		{
			name:     "keeps home title",
			title:    "Guilherme Portella",
			siteName: "Guilherme Portella",
			want:     "Guilherme Portella",
		},
		{
			name:     "keeps title with site name",
			title:    "Blog | Guilherme Portella",
			siteName: "Guilherme Portella",
			want:     "Blog | Guilherme Portella",
		},
		{
			name:     "uses site name when title is empty",
			title:    " ",
			siteName: "Guilherme Portella",
			want:     "Guilherme Portella",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := pageTitle(test.title, test.siteName); got != test.want {
				t.Fatalf("pageTitle(%q, %q) = %q, want %q", test.title, test.siteName, got, test.want)
			}
		})
	}
}
