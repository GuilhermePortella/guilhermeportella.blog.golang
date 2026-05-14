package httptransport

import (
	"testing"
	"time"
)

func TestParseBlogDate(t *testing.T) {
	tests := []struct {
		name     string
		raw      string
		wantDate time.Time
		wantAttr string
		dateOnly bool
		ok       bool
	}{
		{
			name:     "date only",
			raw:      " 2026-05-04 ",
			wantDate: time.Date(2026, 5, 4, 0, 0, 0, 0, time.UTC),
			wantAttr: "2026-05-04",
			dateOnly: true,
			ok:       true,
		},
		{
			name:     "rfc3339",
			raw:      "2026-05-04T18:20:30-03:00",
			wantDate: mustParseTime(t, time.RFC3339, "2026-05-04T18:20:30-03:00"),
			wantAttr: "2026-05-04T18:20:30-03:00",
			ok:       true,
		},
		{
			name:     "rfc3339 nano keeps precision",
			raw:      "2026-05-04T18:20:30.123456789-03:00",
			wantDate: mustParseTime(t, time.RFC3339Nano, "2026-05-04T18:20:30.123456789-03:00"),
			wantAttr: "2026-05-04T18:20:30.123456789-03:00",
			ok:       true,
		},
		{name: "blank", raw: " ", ok: false},
		{name: "invalid", raw: "maio de 2026", ok: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, ok := parseBlogDate(test.raw)
			if ok != test.ok {
				t.Fatalf("ok = %v, want %v", ok, test.ok)
			}
			if !test.ok {
				return
			}
			if !got.Date.Equal(test.wantDate) {
				t.Fatalf("Date = %s, want %s", got.Date, test.wantDate)
			}
			if got.Attr != test.wantAttr {
				t.Fatalf("Attr = %q, want %q", got.Attr, test.wantAttr)
			}
			if got.DateOnly != test.dateOnly {
				t.Fatalf("DateOnly = %v, want %v", got.DateOnly, test.dateOnly)
			}
		})
	}
}

func TestBlogSortTimeUsesEpochForInvalidDate(t *testing.T) {
	got := blogSortTime("sem data")
	want := time.Unix(0, 0).UTC()
	if !got.Equal(want) {
		t.Fatalf("blogSortTime(invalid) = %s, want %s", got, want)
	}
}

func TestMonthNamePTBRRejectsInvalidMonth(t *testing.T) {
	if got := monthNamePTBR(0); got != "" {
		t.Fatalf("monthNamePTBR(0) = %q, want empty", got)
	}
	if got := monthTitlePTBR(13); got != "" {
		t.Fatalf("monthTitlePTBR(13) = %q, want empty", got)
	}
}

func mustParseTime(t *testing.T, layout string, value string) time.Time {
	t.Helper()

	parsed, err := time.Parse(layout, value)
	if err != nil {
		t.Fatalf("time.Parse(%q, %q) error = %v", layout, value, err)
	}
	return parsed
}
