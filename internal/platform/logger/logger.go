package logger

import (
	"log/slog"
	"os"

	"github.com/guilhermeportella/guilhermeportella.github.io/internal/config"
)

func New(environment string, debug bool) *slog.Logger {
	level := slog.LevelInfo
	if debug || environment == config.EnvironmentDevelopment {
		level = slog.LevelDebug
	}

	options := &slog.HandlerOptions{
		Level: level,
	}

	var handler slog.Handler
	if environment == config.EnvironmentDevelopment {
		handler = slog.NewTextHandler(os.Stdout, options)
	} else {
		handler = slog.NewJSONHandler(os.Stdout, options)
	}

	return slog.New(handler).With(
		"service", "blog",
		"environment", environment,
	)
}
