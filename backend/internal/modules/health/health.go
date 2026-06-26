// Package health is the first feature module: a liveness probe that also proves
// the registry and auth boundary are wired end-to-end.
package health

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/TimSchwietzke/pad/backend/internal/core/auth"
	"github.com/TimSchwietzke/pad/backend/internal/core/httputil"
	"github.com/TimSchwietzke/pad/backend/internal/core/module"
)

// Module implements module.Module.
type Module struct{}

// New returns the health module.
func New() Module { return Module{} }

// Name identifies the module and prefixes nothing (health is a single route).
func (Module) Name() string { return "health" }

// RegisterRoutes mounts GET /api/health.
func (Module) RegisterRoutes(r chi.Router, _ module.Deps) {
	r.Get("/health", handle)
}

func handle(w http.ResponseWriter, r *http.Request) {
	resp := map[string]any{
		"status":  "ok",
		"service": "pad",
	}
	if u, ok := auth.FromContext(r.Context()); ok {
		resp["user"] = u.Email
	}
	httputil.JSON(w, http.StatusOK, resp)
}
