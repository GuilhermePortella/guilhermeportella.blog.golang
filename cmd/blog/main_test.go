package main

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestRunReportsInvalidConfig(t *testing.T) {
	clearBlogEnv(t)
	t.Setenv("HTTP_PORT", "invalid")

	err := run()
	if err == nil || !strings.Contains(err.Error(), "load config") {
		t.Fatalf("run() error = %v, want config error", err)
	}
}

func TestRunReportsRendererFailure(t *testing.T) {
	clearBlogEnv(t)
	t.Setenv("APP_ENV", "test")
	t.Setenv("TEMPLATES_DIR", t.TempDir())

	err := run()
	if err == nil || !strings.Contains(err.Error(), "build router") {
		t.Fatalf("run() error = %v, want router error", err)
	}
}

func TestRunServerReturnsStartError(t *testing.T) {
	wantErr := errors.New("listen failed")
	srv := newFakeManagedServer(wantErr, nil)

	err := runServer(context.Background(), srv, time.Second, testBlogLogger())
	if !errors.Is(err, wantErr) {
		t.Fatalf("runServer() error = %v, want %v", err, wantErr)
	}
}

func TestRunServerShutsDownAfterContextCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	srv := newFakeManagedServer(nil, nil)
	go func() {
		<-srv.started
		cancel()
	}()

	if err := runServer(ctx, srv, time.Second, testBlogLogger()); err != nil {
		t.Fatalf("runServer() error = %v", err)
	}
	select {
	case <-srv.shutdownCalled:
	default:
		t.Fatal("Shutdown() was not called")
	}
}

func TestRunServerReturnsShutdownError(t *testing.T) {
	wantErr := errors.New("shutdown failed")
	ctx, cancel := context.WithCancel(context.Background())
	srv := newFakeManagedServer(nil, wantErr)
	go func() {
		<-srv.started
		cancel()
	}()

	err := runServer(ctx, srv, time.Second, nil)
	if !errors.Is(err, wantErr) {
		t.Fatalf("runServer() error = %v, want %v", err, wantErr)
	}
}

type fakeManagedServer struct {
	startErr       error
	shutdownErr    error
	started        chan struct{}
	stopped        chan struct{}
	shutdownCalled chan struct{}
	stopOnce       sync.Once
}

func newFakeManagedServer(startErr error, shutdownErr error) *fakeManagedServer {
	return &fakeManagedServer{
		startErr:       startErr,
		shutdownErr:    shutdownErr,
		started:        make(chan struct{}),
		stopped:        make(chan struct{}),
		shutdownCalled: make(chan struct{}),
	}
}

func (srv *fakeManagedServer) Start() error {
	if srv.startErr != nil {
		return srv.startErr
	}
	close(srv.started)
	<-srv.stopped
	return nil
}

func (srv *fakeManagedServer) Shutdown(context.Context) error {
	close(srv.shutdownCalled)
	srv.stopOnce.Do(func() { close(srv.stopped) })
	return srv.shutdownErr
}

func testBlogLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func clearBlogEnv(t *testing.T) {
	t.Helper()
	for _, key := range []string{
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
	} {
		t.Setenv(key, "")
	}

	root := filepath.Join("..", "..")
	t.Setenv("CONTENT_DIR", filepath.Join(root, "content", "articles"))
	t.Setenv("IMAGES_DIR", filepath.Join(root, "public", "images"))
	t.Setenv("NOTES_DIR", filepath.Join(root, "content", "notes"))
	t.Setenv("STATIC_DIR", filepath.Join(root, "web", "static"))
}
