package logging

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestLevelForStatus pins the status-to-level mapping: 5xx error, 4xx warn,
// everything else info.
func TestLevelForStatus(t *testing.T) {
	tests := []struct {
		status int
		want   slog.Level
	}{
		{200, slog.LevelInfo},
		{301, slog.LevelInfo},
		{404, slog.LevelWarn},
		{499, slog.LevelWarn},
		{500, slog.LevelError},
		{503, slog.LevelError},
	}
	for _, tt := range tests {
		if got := levelForStatus(tt.status); got != tt.want {
			t.Errorf("levelForStatus(%d) = %v, want %v", tt.status, got, tt.want)
		}
	}
}

// TestRequestLoggerEmitsStructuredLine runs a request through the middleware and
// asserts it writes a single structured line with the request's details. We
// point the default logger at a buffer so we can read back what was logged.
func TestRequestLoggerEmitsStructuredLine(t *testing.T) {
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
	defer slog.SetDefault(prev)

	handler := RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTeapot) // 418 -> a 4xx, should log at WARN
	}))
	req := httptest.NewRequest(http.MethodGet, "/api/thing", nil)
	handler.ServeHTTP(httptest.NewRecorder(), req)

	var entry map[string]any
	if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
		t.Fatalf("log line is not valid JSON: %v (%q)", err, buf.String())
	}

	// JSON numbers decode to float64.
	checks := map[string]any{
		"msg":    "request",
		"method": "GET",
		"path":   "/api/thing",
		"status": float64(http.StatusTeapot),
		"level":  "WARN",
	}
	for key, want := range checks {
		if entry[key] != want {
			t.Errorf("log[%q] = %v, want %v", key, entry[key], want)
		}
	}
}
