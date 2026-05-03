package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

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
	handler := httptransport.NewRouter(log)
	srv := server.New(cfg.HTTP, handler, log)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	errCh := make(chan error, 1)
	go func() {
		errCh <- srv.Start()
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.HTTP.ShutdownTimeout)
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
