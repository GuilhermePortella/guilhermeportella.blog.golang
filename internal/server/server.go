package server

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/guilhermeportella/guilhermeportella.github.io/internal/config"
)

type Server struct {
	httpServer *http.Server
	logger     *slog.Logger
}

func New(cfg config.HTTPConfig, handler http.Handler, logger *slog.Logger) *Server {
	if handler == nil {
		handler = http.NotFoundHandler()
	}

	if logger == nil {
		logger = slog.Default()
	}

	return &Server{
		httpServer: &http.Server{
			Addr:              cfg.Address(),
			Handler:           handler,
			ReadHeaderTimeout: cfg.ReadHeaderTimeout,
			ReadTimeout:       cfg.ReadTimeout,
			WriteTimeout:      cfg.WriteTimeout,
			IdleTimeout:       cfg.IdleTimeout,
		},
		logger: logger,
	}
}

func (s *Server) Start() error {
	s.logger.Info("http server listening", "address", s.httpServer.Addr)

	if err := s.httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}

	return nil
}

func (s *Server) Shutdown(ctx context.Context) error {
	s.logger.Info("http server shutting down")
	return s.httpServer.Shutdown(ctx)
}
