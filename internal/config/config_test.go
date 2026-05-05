package config

import (
	"testing"
	"time"
)

var envKeys = []string{
	"APP_NAME",
	"APP_ENV",
	"APP_DEBUG",
	"HTTP_HOST",
	"HTTP_PORT",
	"HTTP_READ_HEADER_TIMEOUT",
	"HTTP_READ_TIMEOUT",
	"HTTP_WRITE_TIMEOUT",
	"HTTP_IDLE_TIMEOUT",
	"HTTP_SHUTDOWN_TIMEOUT",
	"CONTENT_DIR",
	"NOTES_DIR",
	"STATIC_DIR",
	"TEMPLATES_DIR",
}

func TestLoadDefaults(t *testing.T) {
	clearEnv(t)

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.App.Name != "blog" {
		t.Fatalf("App.Name = %q, want blog", cfg.App.Name)
	}

	if cfg.HTTP.Address() != "127.0.0.1:8080" {
		t.Fatalf("HTTP.Address() = %q, want 127.0.0.1:8080", cfg.HTTP.Address())
	}

	if cfg.HTTP.ShutdownTimeout != 10*time.Second {
		t.Fatalf("ShutdownTimeout = %s, want 10s", cfg.HTTP.ShutdownTimeout)
	}
}

func TestLoadCustomConfig(t *testing.T) {
	clearEnv(t)
	t.Setenv("APP_ENV", EnvironmentProduction)
	t.Setenv("APP_DEBUG", "true")
	t.Setenv("HTTP_HOST", "0.0.0.0")
	t.Setenv("HTTP_PORT", "9090")
	t.Setenv("HTTP_SHUTDOWN_TIMEOUT", "30s")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if !cfg.App.Debug {
		t.Fatal("App.Debug = false, want true")
	}

	if cfg.HTTP.Address() != "0.0.0.0:9090" {
		t.Fatalf("HTTP.Address() = %q, want 0.0.0.0:9090", cfg.HTTP.Address())
	}

	if cfg.HTTP.ShutdownTimeout != 30*time.Second {
		t.Fatalf("ShutdownTimeout = %s, want 30s", cfg.HTTP.ShutdownTimeout)
	}
}

func TestLoadRejectsInvalidPort(t *testing.T) {
	clearEnv(t)
	t.Setenv("HTTP_PORT", "70000")

	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want error")
	}
}

func clearEnv(t *testing.T) {
	t.Helper()

	for _, key := range envKeys {
		t.Setenv(key, "")
	}
}
