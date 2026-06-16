package config

import (
	"strings"
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
	"IMAGES_DIR",
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

func TestLoadReportsInvalidEnvironmentValues(t *testing.T) {
	clearEnv(t)
	t.Setenv("APP_DEBUG", "sim")
	t.Setenv("APP_ENV", "sandbox")
	t.Setenv("HTTP_PORT", "abc")
	t.Setenv("HTTP_READ_TIMEOUT", "devagar")

	_, err := Load()
	if err == nil {
		t.Fatal("Load() error = nil, want error")
	}

	for _, expected := range []string{
		"APP_DEBUG must be a boolean",
		"APP_ENV must be one of",
		"HTTP_PORT must be an integer",
		"HTTP_READ_TIMEOUT must be a duration",
	} {
		if !strings.Contains(err.Error(), expected) {
			t.Fatalf("Load() error = %q, want it to contain %q", err.Error(), expected)
		}
	}
}

func TestValidateReportsRequiredFieldsAndPositiveTimeouts(t *testing.T) {
	cfg := validTestConfig()
	cfg.App.Name = ""
	cfg.HTTP.Port = 0
	cfg.HTTP.ReadHeaderTimeout = 0
	cfg.HTTP.ReadTimeout = -time.Second
	cfg.HTTP.WriteTimeout = 0
	cfg.HTTP.IdleTimeout = 0
	cfg.HTTP.ShutdownTimeout = 0
	cfg.Paths.ContentDir = ""
	cfg.Paths.ImagesDir = ""
	cfg.Paths.NotesDir = ""
	cfg.Paths.StaticDir = ""
	cfg.Paths.TemplatesDir = ""

	err := cfg.Validate()
	if err == nil {
		t.Fatal("Validate() error = nil, want error")
	}

	for _, expected := range []string{
		"APP_NAME is required",
		"HTTP_PORT must be between 1 and 65535",
		"HTTP_READ_HEADER_TIMEOUT must be positive",
		"HTTP_READ_TIMEOUT must be positive",
		"HTTP_WRITE_TIMEOUT must be positive",
		"HTTP_IDLE_TIMEOUT must be positive",
		"HTTP_SHUTDOWN_TIMEOUT must be positive",
		"CONTENT_DIR is required",
		"IMAGES_DIR is required",
		"NOTES_DIR is required",
		"STATIC_DIR is required",
		"TEMPLATES_DIR is required",
	} {
		if !strings.Contains(err.Error(), expected) {
			t.Fatalf("Validate() error = %q, want it to contain %q", err.Error(), expected)
		}
	}
}

func clearEnv(t *testing.T) {
	t.Helper()

	for _, key := range envKeys {
		t.Setenv(key, "")
	}
}

func validTestConfig() Config {
	return Config{
		App: AppConfig{
			Name:        "blog",
			Environment: EnvironmentTest,
		},
		HTTP: HTTPConfig{
			Host:              "127.0.0.1",
			Port:              8080,
			ReadHeaderTimeout: time.Second,
			ReadTimeout:       time.Second,
			WriteTimeout:      time.Second,
			IdleTimeout:       time.Second,
			ShutdownTimeout:   time.Second,
		},
		Paths: PathConfig{
			ContentDir:   "content/articles",
			ImagesDir:    "public/images",
			NotesDir:     "content/notes",
			StaticDir:    "web/static",
			TemplatesDir: "web/templates",
		},
	}
}
