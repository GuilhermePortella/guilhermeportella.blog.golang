package httptransport

import (
	"log/slog"
	"net/http"
)

func NewRouter(logger *slog.Logger) http.Handler {
	if logger == nil {
		logger = slog.Default()
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", healthHandler)
	mux.HandleFunc("GET /readyz", readyHandler)

	return chain(
		mux,
		requestID,
		recoverer(logger),
		securityHeaders,
		requestLogger(logger),
	)
}
