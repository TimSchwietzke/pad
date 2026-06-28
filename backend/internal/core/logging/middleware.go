package logging

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5/middleware"

	"github.com/TimSchwietzke/pad/backend/internal/core/auth"
)

// RequestLogger writes one structured log line per HTTP request once it
// completes (method, path, status, latency, request id, remote address, and the
// user id when present).
//
// Mount it AFTER the auth middleware: the authenticated user only lands on the
// request context once auth has run, so logging earlier would never see it.
//
// next is the handler to wrap; the returned handler logs and then delegates.
func RequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		// Wrap the writer so we can read back the status code the handler set;
		// a plain http.ResponseWriter doesn't expose it after the fact.
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)

		status := ww.Status()
		if status == 0 {
			// The handler wrote a body without calling WriteHeader, so Go sent a
			// 200 implicitly — record that rather than a misleading 0.
			status = http.StatusOK
		}

		attrs := []slog.Attr{
			slog.String("method", r.Method),
			slog.String("path", r.URL.Path),
			slog.Int("status", status),
			slog.Int64("latency_ms", time.Since(start).Milliseconds()),
			slog.String("request_id", middleware.GetReqID(r.Context())),
			slog.String("remote_addr", r.RemoteAddr),
		}
		// user_id only exists once a request has passed the auth boundary.
		if u, ok := auth.FromContext(r.Context()); ok {
			attrs = append(attrs, slog.Int64("user_id", u.ID))
		}

		slog.LogAttrs(r.Context(), levelForStatus(status), "request", attrs...)
	})
}

// levelForStatus maps an HTTP status to a log level so failures stand out:
// 5xx is an error, 4xx a warning, everything else informational.
func levelForStatus(status int) slog.Level {
	switch {
	case status >= 500:
		return slog.LevelError
	case status >= 400:
		return slog.LevelWarn
	default:
		return slog.LevelInfo
	}
}
