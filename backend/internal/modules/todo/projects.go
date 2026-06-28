package todo

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/TimSchwietzke/pad/backend/internal/core/httputil"
	"github.com/TimSchwietzke/pad/backend/internal/db"
)

// projectResponse is the JSON shape returned to clients. Internal columns like
// user_id never leave the backend.
type projectResponse struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Color     string    `json:"color"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// toProjectResponse maps a DB row to its public representation.
func toProjectResponse(p db.TodoProject) projectResponse {
	return projectResponse{
		ID:        p.ID,
		Name:      p.Name,
		Color:     p.Color,
		CreatedAt: p.CreatedAt,
		UpdatedAt: p.UpdatedAt,
	}
}

// projectRequest is the create/update payload.
type projectRequest struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

// validate rejects an empty name; color is free-form and optional.
func (b projectRequest) validate() error {
	if strings.TrimSpace(b.Name) == "" {
		return errors.New("name is required")
	}
	return nil
}

// listProjects returns the current user's projects.
func (m *Module) listProjects(w http.ResponseWriter, r *http.Request) {
	projects, err := m.q.ListProjects(r.Context(), userID(r))
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not load projects")
		return
	}
	out := make([]projectResponse, 0, len(projects))
	for _, p := range projects {
		out = append(out, toProjectResponse(p))
	}
	httputil.JSON(w, http.StatusOK, out)
}

// createProject creates a project for the current user.
func (m *Module) createProject(w http.ResponseWriter, r *http.Request) {
	var body projectRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	if err := body.validate(); err != nil {
		httputil.Error(w, http.StatusBadRequest, "validation", err.Error())
		return
	}

	p, err := m.q.CreateProject(r.Context(), db.CreateProjectParams{
		UserID: userID(r),
		Name:   strings.TrimSpace(body.Name),
		Color:  body.Color,
	})
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not create project")
		return
	}
	httputil.JSON(w, http.StatusCreated, toProjectResponse(p))
}

// getProject returns a single project, or 404 if it isn't the user's.
func (m *Module) getProject(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	p, err := m.q.GetProject(r.Context(), db.GetProjectParams{ID: id, UserID: userID(r)})
	if errors.Is(err, sql.ErrNoRows) {
		httputil.Error(w, http.StatusNotFound, "not_found", "project not found")
		return
	}
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not load project")
		return
	}
	httputil.JSON(w, http.StatusOK, toProjectResponse(p))
}

// updateProject renames/recolors a project the user owns.
func (m *Module) updateProject(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	var body projectRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	if err := body.validate(); err != nil {
		httputil.Error(w, http.StatusBadRequest, "validation", err.Error())
		return
	}

	p, err := m.q.UpdateProject(r.Context(), db.UpdateProjectParams{
		Name:   strings.TrimSpace(body.Name),
		Color:  body.Color,
		ID:     id,
		UserID: userID(r),
	})
	if errors.Is(err, sql.ErrNoRows) {
		httputil.Error(w, http.StatusNotFound, "not_found", "project not found")
		return
	}
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not update project")
		return
	}
	httputil.JSON(w, http.StatusOK, toProjectResponse(p))
}

// deleteProject removes a project. Deletes are idempotent: a missing row still
// returns 204, so retries don't surface spurious errors.
func (m *Module) deleteProject(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	if err := m.q.DeleteProject(r.Context(), db.DeleteProjectParams{ID: id, UserID: userID(r)}); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not delete project")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
