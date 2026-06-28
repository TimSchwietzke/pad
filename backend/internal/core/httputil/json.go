// Package httputil holds the small HTTP helpers every module shares, so that
// responses (and especially errors) come out in one consistent shape.
package httputil

import (
	"encoding/json"
	"log"
	"net/http"
)

// JSON writes v as a JSON response.
//
// The Content-Type and status are set before encoding starts. That ordering
// matters: if encoding fails halfway, the client already has the header and
// status, so the best we can do is log it rather than try to "fix" the
// response.
//
// w      the response writer to send on
// status the HTTP status code (e.g. http.StatusOK)
// v      any JSON-serialisable value
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("httputil: encode response: %v", err)
	}
}

// Error writes the project-wide error envelope: {"error":{"code","message"}}.
// Every endpoint fails in this same shape so the frontend can handle errors in
// one place.
//
// status  the HTTP status code (e.g. http.StatusNotFound)
// code    a short, stable machine identifier such as "not_found"
// message human-readable detail meant for display or logs
func Error(w http.ResponseWriter, status int, code, message string) {
	JSON(w, status, map[string]any{
		"error": map[string]string{"code": code, "message": message},
	})
}
