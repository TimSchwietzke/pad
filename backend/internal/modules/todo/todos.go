package todo

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/TimSchwietzke/pad/backend/internal/core/httputil"
	"github.com/TimSchwietzke/pad/backend/internal/db"
)

// Allowed todo statuses.
const (
	statusOpen = "open"
	statusDone = "done"
)

// errProjectNotFound signals that a referenced project isn't the user's.
var errProjectNotFound = errors.New("project not found")

// todoResponse is the JSON shape returned to clients. Nullable columns become
// pointers (null in JSON) instead of leaking sql.Null wrappers.
type todoResponse struct {
	ID        int64      `json:"id"`
	ProjectID *int64     `json:"project_id"`
	Title     string     `json:"title"`
	Notes     string     `json:"notes"`
	Priority  int32      `json:"priority"`
	Status    string     `json:"status"`
	DueAt     *time.Time `json:"due_at"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

func toTodoResponse(t db.Todo) todoResponse {
	return todoResponse{
		ID:        t.ID,
		ProjectID: int64Ptr(t.ProjectID),
		Title:     t.Title,
		Notes:     t.Notes,
		Priority:  t.Priority,
		Status:    t.Status,
		DueAt:     timePtr(t.DueAt),
		CreatedAt: t.CreatedAt,
		UpdatedAt: t.UpdatedAt,
	}
}

// todoRequest is the create/update payload. Pointer fields are optional.
type todoRequest struct {
	ProjectID *int64     `json:"project_id"`
	Title     string     `json:"title"`
	Notes     string     `json:"notes"`
	Priority  int32      `json:"priority"`
	Status    string     `json:"status"`
	DueAt     *time.Time `json:"due_at"`
}

// normalizeAndValidate trims the title, defaults an empty status to "open", and
// rejects anything outside the allowed ranges.
func (b *todoRequest) normalizeAndValidate() error {
	b.Title = strings.TrimSpace(b.Title)
	if b.Title == "" {
		return errors.New("title is required")
	}
	if b.Priority < 0 || b.Priority > 3 {
		return errors.New("priority must be between 0 and 3")
	}
	if b.Status == "" {
		b.Status = statusOpen
	}
	if b.Status != statusOpen && b.Status != statusDone {
		return errors.New(`status must be "open" or "done"`)
	}
	return nil
}

// ensureProjectOwned rejects a todo that points at a project the user doesn't
// own. The foreign key alone would happily reference another user's project, so
// we check ownership explicitly. A nil projectID means "no project" and passes.
func (m *Module) ensureProjectOwned(ctx context.Context, projectID *int64, uid int64) error {
	if projectID == nil {
		return nil
	}
	_, err := m.q.GetProject(ctx, db.GetProjectParams{ID: *projectID, UserID: uid})
	if errors.Is(err, sql.ErrNoRows) {
		return errProjectNotFound
	}
	return err
}

// listTodos returns the current user's todos, due ones first (see ListTodos).
func (m *Module) listTodos(w http.ResponseWriter, r *http.Request) {
	todos, err := m.q.ListTodos(r.Context(), userID(r))
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not load todos")
		return
	}
	out := make([]todoResponse, 0, len(todos))
	for _, t := range todos {
		out = append(out, toTodoResponse(t))
	}
	httputil.JSON(w, http.StatusOK, out)
}

// createTodo creates a todo for the current user.
func (m *Module) createTodo(w http.ResponseWriter, r *http.Request) {
	var body todoRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	if err := body.normalizeAndValidate(); err != nil {
		httputil.Error(w, http.StatusBadRequest, "validation", err.Error())
		return
	}

	uid := userID(r)
	if err := m.ensureProjectOwned(r.Context(), body.ProjectID, uid); err != nil {
		writeProjectCheckError(w, err)
		return
	}

	t, err := m.q.CreateTodo(r.Context(), db.CreateTodoParams{
		UserID:    uid,
		ProjectID: nullInt64(body.ProjectID),
		Title:     body.Title,
		Notes:     body.Notes,
		Priority:  body.Priority,
		Status:    body.Status,
		DueAt:     nullTime(body.DueAt),
	})
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not create todo")
		return
	}
	httputil.JSON(w, http.StatusCreated, toTodoResponse(t))
}

// getTodo returns a single todo, or 404 if it isn't the user's.
func (m *Module) getTodo(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	t, err := m.q.GetTodo(r.Context(), db.GetTodoParams{ID: id, UserID: userID(r)})
	if errors.Is(err, sql.ErrNoRows) {
		httputil.Error(w, http.StatusNotFound, "not_found", "todo not found")
		return
	}
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not load todo")
		return
	}
	httputil.JSON(w, http.StatusOK, toTodoResponse(t))
}

// updateTodo replaces the editable fields of a todo the user owns.
func (m *Module) updateTodo(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	var body todoRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	if err := body.normalizeAndValidate(); err != nil {
		httputil.Error(w, http.StatusBadRequest, "validation", err.Error())
		return
	}

	uid := userID(r)
	if err := m.ensureProjectOwned(r.Context(), body.ProjectID, uid); err != nil {
		writeProjectCheckError(w, err)
		return
	}

	t, err := m.q.UpdateTodo(r.Context(), db.UpdateTodoParams{
		ProjectID: nullInt64(body.ProjectID),
		Title:     body.Title,
		Notes:     body.Notes,
		Priority:  body.Priority,
		Status:    body.Status,
		DueAt:     nullTime(body.DueAt),
		ID:        id,
		UserID:    uid,
	})
	if errors.Is(err, sql.ErrNoRows) {
		httputil.Error(w, http.StatusNotFound, "not_found", "todo not found")
		return
	}
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not update todo")
		return
	}
	httputil.JSON(w, http.StatusOK, toTodoResponse(t))
}

// deleteTodo removes a todo. Like projects, deletes are idempotent (204).
func (m *Module) deleteTodo(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	if err := m.q.DeleteTodo(r.Context(), db.DeleteTodoParams{ID: id, UserID: userID(r)}); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not delete todo")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// writeProjectCheckError turns an ensureProjectOwned error into the right HTTP
// response: a 400 for an unknown project, a 500 for anything unexpected.
func writeProjectCheckError(w http.ResponseWriter, err error) {
	if errors.Is(err, errProjectNotFound) {
		httputil.Error(w, http.StatusBadRequest, "validation", "project not found")
		return
	}
	httputil.Error(w, http.StatusInternalServerError, "db_error", "could not verify project")
}

// --- null <-> pointer helpers ---------------------------------------------

func nullInt64(p *int64) sql.NullInt64 {
	if p == nil {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: *p, Valid: true}
}

func nullTime(p *time.Time) sql.NullTime {
	if p == nil {
		return sql.NullTime{}
	}
	return sql.NullTime{Time: *p, Valid: true}
}

func int64Ptr(n sql.NullInt64) *int64 {
	if !n.Valid {
		return nil
	}
	v := n.Int64
	return &v
}

func timePtr(n sql.NullTime) *time.Time {
	if !n.Valid {
		return nil
	}
	t := n.Time
	return &t
}
