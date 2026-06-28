package health

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/TimSchwietzke/pad/backend/internal/core/auth"
	"github.com/TimSchwietzke/pad/backend/internal/core/config"
	"github.com/TimSchwietzke/pad/backend/internal/core/module"
)

// TestHealthEndpoint is an integration test: it wires the module behind the auth
// boundary exactly like main does, sends a real request through the router, and
// checks both the status and the body — including the user the auth boundary
// injected.
func TestHealthEndpoint(t *testing.T) {
	authSvc := auth.New(config.AuthNone)

	r := chi.NewRouter()
	r.Route("/api", func(api chi.Router) {
		api.Use(authSvc.Middleware)
		New().RegisterRoutes(api, module.Deps{Auth: authSvc})
	})

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON body: %v", err)
	}
	want := map[string]any{"status": "ok", "service": "pad", "user": "local@pad"}
	for key, exp := range want {
		if body[key] != exp {
			t.Errorf("body[%q] = %v, want %v", key, body[key], exp)
		}
	}
}
