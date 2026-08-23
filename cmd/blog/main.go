package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/guilhermeportella/guilhermeportella.github.io/internal/config"
	"github.com/guilhermeportella/guilhermeportella.github.io/internal/platform/logger"
	"github.com/guilhermeportella/guilhermeportella.github.io/internal/server"
	httptransport "github.com/guilhermeportella/guilhermeportella.github.io/internal/transport/http"
)

func main() {
	if err := run(); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "blog: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	log := logger.New(cfg.App.Environment, cfg.App.Debug)
	handler, err := httptransport.NewRouter(httptransport.RouterOptions{
		ImagesDir:    cfg.Paths.ImagesDir,
		StaticDir:    cfg.Paths.StaticDir,
		TemplatesDir: cfg.Paths.TemplatesDir,
		ContentDir:   cfg.Paths.ContentDir,
		NotesDir:     cfg.Paths.NotesDir,
	}, log)
	if err != nil {
		return fmt.Errorf("build router: %w", err)
	}

	srv := server.New(cfg.HTTP, handler, log)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	return runServer(ctx, srv, cfg.HTTP.ShutdownTimeout, log)
}

type managedServer interface {
	Start() error
	Shutdown(context.Context) error
}

func runServer(ctx context.Context, srv managedServer, shutdownTimeout time.Duration, log *slog.Logger) error {
	if log == nil {
		log = slog.Default()
	}

	errCh := make(chan error, 1)
	go func() {
		errCh <- srv.Start()
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()

		if err := srv.Shutdown(shutdownCtx); err != nil {
			return fmt.Errorf("shutdown server: %w", err)
		}

		log.Info("server stopped")
		return nil
	case err := <-errCh:
		if err != nil {
			return fmt.Errorf("server failed: %w", err)
		}
		return nil
	}
}
