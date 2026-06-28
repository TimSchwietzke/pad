// Package todo is the ToDo feature module: projects, todos and tags, all scoped
// to the authenticated user.
package todo

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/TimSchwietzke/pad/backend/internal/core/auth"
	"github.com/TimSchwietzke/pad/backend/internal/core/httputil"
	"github.com/TimSchwietzke/pad/backend/internal/core/module"
	"github.com/TimSchwietzke/pad/backend/internal/db"
)

// Module wires the ToDo endpoints and holds the generated query layer.
type Module struct {
	q *db.Queries
}

// New creates the module. The query layer is attached in RegisterRoutes, once
// the DB handle is available via Deps.
func New() *Module { return &Module{} }

// Name identifies the module; its routes live under /api/todo.
func (*Module) Name() string { return "todo" }

// RegisterRoutes mounts the ToDo endpoints. Projects are wired first; todos and
// tags follow in later commits on this branch.
func (m *Module) RegisterRoutes(r chi.Router, deps module.Deps) {
	m.q = db.New(deps.DB)

	r.Route("/todo", func(t chi.Router) {
		t.Route("/projects", func(p chi.Router) {
			p.Get("/", m.listProjects)
			p.Post("/", m.createProject)
			p.Get("/{id}", m.getProject)
			p.Put("/{id}", m.updateProject)
			p.Delete("/{id}", m.deleteProject)
		})
	})
}

// userID returns the authenticated user's id from the request context. The auth
// boundary guarantees it is present on every /api route, so a miss yields 0.
func userID(r *http.Request) int64 {
	u, _ := auth.FromContext(r.Context())
	return u.ID
}

// decodeJSON unmarshals the request body into v. It writes a 400 and returns
// false when the body isn't valid JSON, so callers can simply return.
func decodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid_json", "request body is not valid JSON")
		return false
	}
	return true
}

// idParam parses the {id} path segment as an int64, writing a 400 on failure.
func idParam(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid_id", "id must be an integer")
		return 0, false
	}
	return id, true
}
