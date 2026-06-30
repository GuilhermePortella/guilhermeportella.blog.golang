package logger

import (
	"context"
	"log/slog"
	"testing"

	"github.com/guilhermeportella/guilhermeportella.github.io/internal/config"
)

func TestNewEnablesDebugInDevelopment(t *testing.T) {
	log := New(config.EnvironmentDevelopment, false)

	if !log.Enabled(context.Background(), slog.LevelDebug) {
		t.Fatalf("development logger should enable debug logs")
	}
}

func TestNewEnablesDebugWhenConfigured(t *testing.T) {
	log := New(config.EnvironmentProduction, true)

	if !log.Enabled(context.Background(), slog.LevelDebug) {
		t.Fatalf("debug logger should enable debug logs")
	}
}

func TestNewUsesInfoLevelByDefaultOutsideDevelopment(t *testing.T) {
	log := New(config.EnvironmentProduction, false)

	if log.Enabled(context.Background(), slog.LevelDebug) {
		t.Fatalf("production logger without debug should not enable debug logs")
	}
	if !log.Enabled(context.Background(), slog.LevelInfo) {
		t.Fatalf("production logger should enable info logs")
	}
}
