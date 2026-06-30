package server

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"testing"
	"time"

	"github.com/guilhermeportella/guilhermeportella.github.io/internal/config"
)

func TestNewAppliesHTTPConfigAndDefaults(t *testing.T) {
	cfg := config.HTTPConfig{
		Host:              "127.0.0.1",
		Port:              4321,
		ReadHeaderTimeout: 2 * time.Second,
		ReadTimeout:       3 * time.Second,
		WriteTimeout:      4 * time.Second,
		IdleTimeout:       5 * time.Second,
	}

	srv := New(cfg, nil, nil)

	if srv.httpServer.Addr != "127.0.0.1:4321" {
		t.Fatalf("Addr = %q, want 127.0.0.1:4321", srv.httpServer.Addr)
	}
	if srv.httpServer.ReadHeaderTimeout != cfg.ReadHeaderTimeout {
		t.Fatalf("ReadHeaderTimeout = %s, want %s", srv.httpServer.ReadHeaderTimeout, cfg.ReadHeaderTimeout)
	}
	if srv.httpServer.ReadTimeout != cfg.ReadTimeout {
		t.Fatalf("ReadTimeout = %s, want %s", srv.httpServer.ReadTimeout, cfg.ReadTimeout)
	}
	if srv.httpServer.WriteTimeout != cfg.WriteTimeout {
		t.Fatalf("WriteTimeout = %s, want %s", srv.httpServer.WriteTimeout, cfg.WriteTimeout)
	}
	if srv.httpServer.IdleTimeout != cfg.IdleTimeout {
		t.Fatalf("IdleTimeout = %s, want %s", srv.httpServer.IdleTimeout, cfg.IdleTimeout)
	}
	if srv.httpServer.Handler == nil {
		t.Fatalf("Handler is nil")
	}
	if srv.logger == nil {
		t.Fatalf("logger is nil")
	}
}

func TestNewUsesProvidedHandlerAndLogger(t *testing.T) {
	handler := testHandler{}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	srv := New(config.HTTPConfig{Host: "127.0.0.1", Port: 8080}, handler, logger)

	if srv.httpServer.Handler != handler {
		t.Fatalf("Handler = %#v, want provided handler", srv.httpServer.Handler)
	}
	if srv.logger != logger {
		t.Fatalf("logger = %#v, want provided logger", srv.logger)
	}
}

type testHandler struct{}

func (testHandler) ServeHTTP(http.ResponseWriter, *http.Request) {}

func TestStartReturnsListenErrors(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	srv := New(config.HTTPConfig{Host: "127.0.0.1", Port: -1}, http.NotFoundHandler(), logger)

	err := srv.Start()

	if err == nil {
		t.Fatalf("Start() error = nil, want listen error")
	}
}

func TestStartReturnsNilAfterShutdown(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	srv := New(config.HTTPConfig{Host: "127.0.0.1", Port: 0}, http.NotFoundHandler(), logger)
	errCh := make(chan error, 1)

	go func() {
		errCh <- srv.Start()
	}()

	time.Sleep(50 * time.Millisecond)

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		t.Fatalf("Shutdown() error = %v", err)
	}

	select {
	case err := <-errCh:
		if err != nil {
			t.Fatalf("Start() error = %v, want nil", err)
		}
	case <-time.After(time.Second):
		t.Fatalf("Start() did not return after Shutdown()")
	}
}
