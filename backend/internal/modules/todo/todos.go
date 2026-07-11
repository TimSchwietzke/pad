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
	ID              int64      `json:"id"`
	ProjectID       *int64     `json:"project_id"`
	Title           string     `json:"title"`
	Notes           string     `json:"notes"`
	Priority        int32      `json:"priority"`
	Status          string     `json:"status"`
	DueAt           *time.Time `json:"due_at"`
	EstimateMinutes *int32     `json:"estimate_minutes"`
	// Position is the rank in the user's manual "custom" order (see sort.go).
	Position  int64     `json:"position"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	// Tags attached to this todo. Always a slice (never null); populated by the
	// list handler, empty on single-todo responses.
	Tags []tagResponse `json:"tags"`
}

func toTodoResponse(t db.Todo) todoResponse {
	return todoResponse{
		ID:              t.ID,
		ProjectID:       int64Ptr(t.ProjectID),
		Title:           t.Title,
		Notes:           t.Notes,
		Priority:        t.Priority,
		Status:          t.Status,
		DueAt:           timePtr(t.DueAt),
		EstimateMinutes: int32Ptr(t.EstimateMinutes),
		Position:        t.Position,
		CreatedAt:       t.CreatedAt,
		UpdatedAt:       t.UpdatedAt,
		Tags:            []tagResponse{},
	}
}

// todoRequest is the create/update payload. Pointer fields are optional.
type todoRequest struct {
	ProjectID       *int64     `json:"project_id"`
	Title           string     `json:"title"`
	Notes           string     `json:"notes"`
	Priority        int32      `json:"priority"`
	Status          string     `json:"status"`
	DueAt           *time.Time `json:"due_at"`
	EstimateMinutes *int32     `json:"estimate_minutes"`
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
	if b.EstimateMinutes != nil && *b.EstimateMinutes < 0 {
		return errors.New("estimate_minutes must be >= 0")
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

// listTodos returns the current user's todos, ordered by the optional ?sort=
// spec (default: priority desc, then soonest due). Sort columns come from a
// whitelist (see sort.go), so the dynamic ORDER BY can't be abused.
func (m *Module) listTodos(w http.ResponseWriter, r *http.Request) {
	terms, err := parseSort(r.URL.Query().Get("sort"))
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid_sort", err.Error())
		return
	}

	const cols = `id, user_id, project_id, title, notes, priority, status, due_at, estimate_minutes, position, created_at, updated_at`
	query := `SELECT ` + cols + ` FROM todos WHERE user_id = $1 ORDER BY ` + orderClause(terms)

	rows, err := m.db.QueryContext(r.Context(), query, userID(r))
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not load todos")
		return
	}
	defer rows.Close()

	out := []todoResponse{}
	for rows.Next() {
		var t db.Todo
		if err := rows.Scan(
			&t.ID, &t.UserID, &t.ProjectID, &t.Title, &t.Notes, &t.Priority,
			&t.Status, &t.DueAt, &t.EstimateMinutes, &t.Position, &t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			httputil.Error(w, http.StatusInternalServerError, "db_error", "could not read todos")
			return
		}
		out = append(out, toTodoResponse(t))
	}
	if err := rows.Err(); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not read todos")
		return
	}

	// Embed each todo's tags. One extra round-trip for the whole list keeps the
	// client from firing an N+1 storm of per-todo tag requests.
	tagRows, err := m.q.ListTagsForUserTodos(r.Context(), userID(r))
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not read tags")
		return
	}
	byTodo := make(map[int64][]tagResponse, len(tagRows))
	for _, tr := range tagRows {
		byTodo[tr.TodoID] = append(byTodo[tr.TodoID], tagResponse{ID: tr.ID, Name: tr.Name})
	}
	for i := range out {
		if tags := byTodo[out[i].ID]; tags != nil {
			out[i].Tags = tags
		}
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
		UserID:          uid,
		ProjectID:       nullInt64(body.ProjectID),
		Title:           body.Title,
		Notes:           body.Notes,
		Priority:        body.Priority,
		Status:          body.Status,
		DueAt:           nullTime(body.DueAt),
		EstimateMinutes: nullInt32(body.EstimateMinutes),
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
		ProjectID:       nullInt64(body.ProjectID),
		Title:           body.Title,
		Notes:           body.Notes,
		Priority:        body.Priority,
		Status:          body.Status,
		DueAt:           nullTime(body.DueAt),
		EstimateMinutes: nullInt32(body.EstimateMinutes),
		ID:              id,
		UserID:          uid,
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

// reorderRequest is the body for the reorder endpoint: the user's todo ids in
// the exact order they should take in the custom view.
type reorderRequest struct {
	IDs []int64 `json:"ids"`
}

// reorderTodos rewrites the manual "custom" order. It assigns position 0..N-1 to
// the given ids, in order, inside a single transaction so the list never ends up
// half-renumbered. Every id is scoped to the user; an id that isn't theirs (or
// doesn't exist) touches no rows and yields a 404 with the whole change rolled
// back. Duplicate ids are rejected up front.
func (m *Module) reorderTodos(w http.ResponseWriter, r *http.Request) {
	var body reorderRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	if len(body.IDs) == 0 {
		httputil.Error(w, http.StatusBadRequest, "validation", "ids is required")
		return
	}
	seen := make(map[int64]struct{}, len(body.IDs))
	for _, id := range body.IDs {
		if _, dup := seen[id]; dup {
			httputil.Error(w, http.StatusBadRequest, "validation", "ids must be unique")
			return
		}
		seen[id] = struct{}{}
	}

	uid := userID(r)
	tx, err := m.db.BeginTx(r.Context(), nil)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not reorder todos")
		return
	}
	defer tx.Rollback() // no-op once committed

	qtx := m.q.WithTx(tx)
	for i, id := range body.IDs {
		n, err := qtx.SetTodoPosition(r.Context(), db.SetTodoPositionParams{
			Position: int64(i),
			ID:       id,
			UserID:   uid,
		})
		if err != nil {
			httputil.Error(w, http.StatusInternalServerError, "db_error", "could not reorder todos")
			return
		}
		if n == 0 {
			// Not the user's todo (or gone) — reject the whole batch.
			httputil.Error(w, http.StatusNotFound, "not_found", "todo not found")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not reorder todos")
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

func nullInt32(p *int32) sql.NullInt32 {
	if p == nil {
		return sql.NullInt32{}
	}
	return sql.NullInt32{Int32: *p, Valid: true}
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

func int32Ptr(n sql.NullInt32) *int32 {
	if !n.Valid {
		return nil
	}
	v := n.Int32
	return &v
}

func timePtr(n sql.NullTime) *time.Time {
	if !n.Valid {
		return nil
	}
	t := n.Time
	return &t
}
