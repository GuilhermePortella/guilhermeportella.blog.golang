package httptransport

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

func TestChainAppliesMiddlewaresInDeclarationOrder(t *testing.T) {
	var calls []string
	middlewareNamed := func(name string) middleware {
		return func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls = append(calls, name+":before")
				next.ServeHTTP(w, r)
				calls = append(calls, name+":after")
			})
		}
	}

	handler := chain(
		http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
			calls = append(calls, "handler")
		}),
		middlewareNamed("first"),
		middlewareNamed("second"),
	)
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))

	want := []string{"first:before", "second:before", "handler", "second:after", "first:after"}
	if !reflect.DeepEqual(calls, want) {
		t.Fatalf("call order = %v, want %v", calls, want)
	}
}

func TestSecurityHeadersSetsBrowserPolicies(t *testing.T) {
	reached := false
	handler := securityHeaders(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		reached = true
	}))
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/", nil))

	if !reached {
		t.Fatal("next handler was not called")
	}
	wantHeaders := map[string]string{
		"Content-Security-Policy":      contentSecurityPolicy,
		"Cross-Origin-Embedder-Policy": "credentialless",
		"Cross-Origin-Opener-Policy":   "same-origin",
		"Cross-Origin-Resource-Policy": "cross-origin",
		"Permissions-Policy":           "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
		"Referrer-Policy":              "no-referrer",
		"X-Content-Type-Options":       "nosniff",
		"X-Frame-Options":              "DENY",
	}
	for name, want := range wantHeaders {
		if got := recorder.Header().Get(name); got != want {
			t.Errorf("header %s = %q, want %q", name, got, want)
		}
	}
}

func TestRequestIDPreservesValidIDInResponseAndContext(t *testing.T) {
	const wantID = "request-123"
	var contextID string
	handler := requestID(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		contextID = getRequestID(r.Context())
	}))
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.Header.Set("X-Request-ID", "  "+wantID+"  ")
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if got := recorder.Header().Get("X-Request-ID"); got != wantID {
		t.Fatalf("response request ID = %q, want %q", got, wantID)
	}
	if contextID != wantID {
		t.Fatalf("context request ID = %q, want %q", contextID, wantID)
	}
}

func TestRequestIDReplacesIDsOutsideAllowedLength(t *testing.T) {
	tests := []struct {
		name     string
		supplied string
	}{
		{name: "too short", supplied: "short"},
		{name: "too long", supplied: strings.Repeat("x", 129)},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var contextID string
			handler := requestID(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
				contextID = getRequestID(r.Context())
			}))
			request := httptest.NewRequest(http.MethodGet, "/", nil)
			request.Header.Set("X-Request-ID", test.supplied)
			recorder := httptest.NewRecorder()

			handler.ServeHTTP(recorder, request)

			generated := recorder.Header().Get("X-Request-ID")
			if generated == test.supplied || generated == "" {
				t.Fatalf("generated request ID = %q, supplied %q", generated, test.supplied)
			}
			if len(generated) < 8 || len(generated) > 128 {
				t.Fatalf("generated request ID length = %d, want between 8 and 128", len(generated))
			}
			if contextID != generated {
				t.Fatalf("context request ID = %q, response ID %q", contextID, generated)
			}
		})
	}
}

func TestResponseRecorderUnwrapReturnsUnderlyingWriter(t *testing.T) {
	underlying := httptest.NewRecorder()
	recorder := &responseRecorder{ResponseWriter: underlying}

	if got := recorder.Unwrap(); got != underlying {
		t.Fatalf("Unwrap() = %#v, want underlying ResponseWriter", got)
	}
}

func TestResponseRecorderIgnoresDuplicateWriteHeader(t *testing.T) {
	underlying := httptest.NewRecorder()
	recorder := &responseRecorder{ResponseWriter: underlying}

	recorder.WriteHeader(http.StatusAccepted)
	recorder.WriteHeader(http.StatusInternalServerError)

	if recorder.statusCode != http.StatusAccepted {
		t.Fatalf("statusCode = %d, want %d", recorder.statusCode, http.StatusAccepted)
	}
	if got := underlying.Code; got != http.StatusAccepted {
		t.Fatalf("underlying.Code = %d, want %d", got, http.StatusAccepted)
	}
}

func TestResponseRecorderWriteCommitsOKAndCountsBytes(t *testing.T) {
	underlying := httptest.NewRecorder()
	recorder := &responseRecorder{ResponseWriter: underlying}

	n, err := recorder.Write([]byte("resposta"))
	if err != nil {
		t.Fatalf("Write() error = %v", err)
	}
	if n != len("resposta") || recorder.bytesWritten != len("resposta") {
		t.Fatalf("bytes written = (%d, %d), want %d", n, recorder.bytesWritten, len("resposta"))
	}
	if recorder.statusCode != http.StatusOK || underlying.Code != http.StatusOK {
		t.Fatalf("status = (%d, %d), want %d", recorder.statusCode, underlying.Code, http.StatusOK)
	}
}

func TestRemoteIPHandlesHostPortAndUnparsedAddresses(t *testing.T) {
	tests := map[string]string{
		"192.0.2.10:4321":  "192.0.2.10",
		"[2001:db8::1]:80": "2001:db8::1",
		"unknown":          "unknown",
		"":                 "",
	}

	for remoteAddress, want := range tests {
		request := httptest.NewRequest(http.MethodGet, "/", nil)
		request.RemoteAddr = remoteAddress
		if got := remoteIP(request); got != want {
			t.Errorf("remoteIP() for %q = %q, want %q", remoteAddress, got, want)
		}
	}
}
