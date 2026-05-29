package config

import (
	"errors"
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	EnvironmentDevelopment = "development"
	EnvironmentStaging     = "staging"
	EnvironmentProduction  = "production"
	EnvironmentTest        = "test"
)

type Config struct {
	App   AppConfig
	HTTP  HTTPConfig
	Paths PathConfig
}

type AppConfig struct {
	Name        string
	Environment string
	Debug       bool
}

type HTTPConfig struct {
	Host              string
	Port              int
	ReadHeaderTimeout time.Duration
	ReadTimeout       time.Duration
	WriteTimeout      time.Duration
	IdleTimeout       time.Duration
	ShutdownTimeout   time.Duration
}

type PathConfig struct {
	ContentDir   string
	ImagesDir    string
	NotesDir     string
	StaticDir    string
	TemplatesDir string
}

func Load() (Config, error) {
	var errs []error

	debug, err := envBool("APP_DEBUG", false)
	if err != nil {
		errs = append(errs, err)
	}

	port, err := envInt("HTTP_PORT", 8080)
	if err != nil {
		errs = append(errs, err)
	}

	readHeaderTimeout, err := envDuration("HTTP_READ_HEADER_TIMEOUT", 5*time.Second)
	if err != nil {
		errs = append(errs, err)
	}

	readTimeout, err := envDuration("HTTP_READ_TIMEOUT", 15*time.Second)
	if err != nil {
		errs = append(errs, err)
	}

	writeTimeout, err := envDuration("HTTP_WRITE_TIMEOUT", 15*time.Second)
	if err != nil {
		errs = append(errs, err)
	}

	idleTimeout, err := envDuration("HTTP_IDLE_TIMEOUT", 60*time.Second)
	if err != nil {
		errs = append(errs, err)
	}

	shutdownTimeout, err := envDuration("HTTP_SHUTDOWN_TIMEOUT", 10*time.Second)
	if err != nil {
		errs = append(errs, err)
	}

	cfg := Config{
		App: AppConfig{
			Name:        envString("APP_NAME", "blog"),
			Environment: envString("APP_ENV", EnvironmentDevelopment),
			Debug:       debug,
		},
		HTTP: HTTPConfig{
			Host:              envString("HTTP_HOST", "127.0.0.1"),
			Port:              port,
			ReadHeaderTimeout: readHeaderTimeout,
			ReadTimeout:       readTimeout,
			WriteTimeout:      writeTimeout,
			IdleTimeout:       idleTimeout,
			ShutdownTimeout:   shutdownTimeout,
		},
		Paths: PathConfig{
			ContentDir:   envString("CONTENT_DIR", "content/articles"),
			ImagesDir:    envString("IMAGES_DIR", "public/images"),
			NotesDir:     envString("NOTES_DIR", "content/notes"),
			StaticDir:    envString("STATIC_DIR", "web/static"),
			TemplatesDir: envString("TEMPLATES_DIR", "web/templates"),
		},
	}

	if err := cfg.Validate(); err != nil {
		errs = append(errs, err)
	}

	if err := errors.Join(errs...); err != nil {
		return Config{}, err
	}

	return cfg, nil
}

func (cfg Config) Validate() error {
	var errs []error

	if cfg.App.Name == "" {
		errs = append(errs, errors.New("APP_NAME is required"))
	}

	switch cfg.App.Environment {
	case EnvironmentDevelopment, EnvironmentStaging, EnvironmentProduction, EnvironmentTest:
	default:
		errs = append(errs, fmt.Errorf("APP_ENV must be one of %q, %q, %q, or %q", EnvironmentDevelopment, EnvironmentStaging, EnvironmentProduction, EnvironmentTest))
	}

	if cfg.HTTP.Port < 1 || cfg.HTTP.Port > 65535 {
		errs = append(errs, fmt.Errorf("HTTP_PORT must be between 1 and 65535"))
	}

	if cfg.HTTP.ReadHeaderTimeout <= 0 {
		errs = append(errs, fmt.Errorf("HTTP_READ_HEADER_TIMEOUT must be positive"))
	}

	if cfg.HTTP.ReadTimeout <= 0 {
		errs = append(errs, fmt.Errorf("HTTP_READ_TIMEOUT must be positive"))
	}

	if cfg.HTTP.WriteTimeout <= 0 {
		errs = append(errs, fmt.Errorf("HTTP_WRITE_TIMEOUT must be positive"))
	}

	if cfg.HTTP.IdleTimeout <= 0 {
		errs = append(errs, fmt.Errorf("HTTP_IDLE_TIMEOUT must be positive"))
	}

	if cfg.HTTP.ShutdownTimeout <= 0 {
		errs = append(errs, fmt.Errorf("HTTP_SHUTDOWN_TIMEOUT must be positive"))
	}

	if cfg.Paths.ContentDir == "" {
		errs = append(errs, errors.New("CONTENT_DIR is required"))
	}

	if cfg.Paths.ImagesDir == "" {
		errs = append(errs, errors.New("IMAGES_DIR is required"))
	}

	if cfg.Paths.NotesDir == "" {
		errs = append(errs, errors.New("NOTES_DIR is required"))
	}

	if cfg.Paths.StaticDir == "" {
		errs = append(errs, errors.New("STATIC_DIR is required"))
	}

	if cfg.Paths.TemplatesDir == "" {
		errs = append(errs, errors.New("TEMPLATES_DIR is required"))
	}

	return errors.Join(errs...)
}

func (cfg HTTPConfig) Address() string {
	return net.JoinHostPort(cfg.Host, strconv.Itoa(cfg.Port))
}

func envString(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func envBool(key string, fallback bool) (bool, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}

	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return false, fmt.Errorf("%s must be a boolean: %w", key, err)
	}

	return parsed, nil
}

func envInt(key string, fallback int) (int, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer: %w", key, err)
	}

	return parsed, nil
}

func envDuration(key string, fallback time.Duration) (time.Duration, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}

	parsed, err := time.ParseDuration(value)
	if err != nil {
		return 0, fmt.Errorf("%s must be a duration: %w", key, err)
	}

	return parsed, nil
}
