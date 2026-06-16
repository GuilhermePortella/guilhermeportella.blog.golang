package httptransport

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

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
