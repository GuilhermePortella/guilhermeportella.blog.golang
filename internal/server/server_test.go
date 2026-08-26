package server

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net"
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

func TestServeReturnsNilAfterShutdown(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	requestReceived := make(chan struct{})
	srv := New(config.HTTPConfig{}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(requestReceived)
		w.WriteHeader(http.StatusNoContent)
	}), logger)
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("net.Listen() error = %v", err)
	}
	t.Cleanup(func() { _ = listener.Close() })
	errCh := make(chan error, 1)

	go func() {
		errCh <- srv.serve(listener)
	}()

	client := &http.Client{Timeout: time.Second}
	response, err := client.Get("http://" + listener.Addr().String())
	if err != nil {
		t.Fatalf("GET readiness request error = %v", err)
	}
	_ = response.Body.Close()
	if response.StatusCode != http.StatusNoContent {
		t.Fatalf("readiness status = %d, want %d", response.StatusCode, http.StatusNoContent)
	}
	select {
	case <-requestReceived:
	case <-time.After(time.Second):
		t.Fatal("server did not handle readiness request")
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		t.Fatalf("Shutdown() error = %v", err)
	}

	select {
	case err := <-errCh:
		if err != nil {
			t.Fatalf("serve() error = %v, want nil", err)
		}
	case <-time.After(time.Second):
		t.Fatalf("serve() did not return after Shutdown()")
	}
}

func TestServePropagatesUnexpectedListenerError(t *testing.T) {
	wantErr := errors.New("accept failed")
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	srv := New(config.HTTPConfig{}, http.NotFoundHandler(), logger)

	err := srv.serve(errorListener{err: wantErr})

	if !errors.Is(err, wantErr) {
		t.Fatalf("serve() error = %v, want %v", err, wantErr)
	}
}

type errorListener struct {
	err error
}

func (listener errorListener) Accept() (net.Conn, error) { return nil, listener.err }
func (errorListener) Close() error                       { return nil }
func (errorListener) Addr() net.Addr                     { return testAddr("test:0") }

type testAddr string

func (testAddr) Network() string     { return "test" }
func (addr testAddr) String() string { return string(addr) }
