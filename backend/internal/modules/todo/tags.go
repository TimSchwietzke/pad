package todo

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"github.com/TimSchwietzke/pad/backend/internal/core/httputil"
	"github.com/TimSchwietzke/pad/backend/internal/db"
)

// tagResponse is the JSON shape returned to clients.
type tagResponse struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

func toTagResponse(t db.TodoTag) tagResponse {
	return tagResponse{ID: t.ID, Name: t.Name}
}

// tagRequest is the create payload.
type tagRequest struct {
	Name string `json:"name"`
}

func (b tagRequest) validate() error {
	if strings.TrimSpace(b.Name) == "" {
		return errors.New("name is required")
	}
	return nil
}

// listTags returns the current user's tags.
func (m *Module) listTags(w http.ResponseWriter, r *http.Request) {
	tags, err := m.q.ListTags(r.Context(), userID(r))
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not load tags")
		return
	}
	httputil.JSON(w, http.StatusOK, tagsToResponse(tags))
}

// createTag creates a tag for the current user.
func (m *Module) createTag(w http.ResponseWriter, r *http.Request) {
	var body tagRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	if err := body.validate(); err != nil {
		httputil.Error(w, http.StatusBadRequest, "validation", err.Error())
		return
	}
	tag, err := m.q.CreateTag(r.Context(), db.CreateTagParams{
		UserID: userID(r),
		Name:   strings.TrimSpace(body.Name),
	})
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not create tag")
		return
	}
	httputil.JSON(w, http.StatusCreated, toTagResponse(tag))
}

// deleteTag removes a tag (and, via the FK cascade, its todo links). Idempotent.
func (m *Module) deleteTag(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	if err := m.q.DeleteTag(r.Context(), db.DeleteTagParams{ID: id, UserID: userID(r)}); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not delete tag")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// listTodoTags returns the tags attached to one of the user's todos.
func (m *Module) listTodoTags(w http.ResponseWriter, r *http.Request) {
	todoID, ok := idParam(w, r)
	if !ok || !m.ensureTodoOwned(w, r, todoID) {
		return
	}
	tags, err := m.q.ListTagsForTodo(r.Context(), todoID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not load tags")
		return
	}
	httputil.JSON(w, http.StatusOK, tagsToResponse(tags))
}

// addTodoTag attaches a tag to a todo. Both must belong to the user; adding the
// same tag twice is a no-op (the query ignores conflicts).
func (m *Module) addTodoTag(w http.ResponseWriter, r *http.Request) {
	todoID, ok := idParam(w, r)
	if !ok {
		return
	}
	tagID, ok := int64Param(w, r, "tagID")
	if !ok {
		return
	}
	if !m.ensureTodoOwned(w, r, todoID) || !m.ensureTagOwned(w, r, tagID) {
		return
	}
	if err := m.q.AddTagToTodo(r.Context(), db.AddTagToTodoParams{TodoID: todoID, TagID: tagID}); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not attach tag")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// removeTodoTag detaches a tag from a todo. Idempotent.
func (m *Module) removeTodoTag(w http.ResponseWriter, r *http.Request) {
	todoID, ok := idParam(w, r)
	if !ok {
		return
	}
	tagID, ok := int64Param(w, r, "tagID")
	if !ok || !m.ensureTodoOwned(w, r, todoID) {
		return
	}
	if err := m.q.RemoveTagFromTodo(r.Context(), db.RemoveTagFromTodoParams{TodoID: todoID, TagID: tagID}); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not detach tag")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ensureTodoOwned writes a 404 and returns false when the todo isn't the user's.
func (m *Module) ensureTodoOwned(w http.ResponseWriter, r *http.Request, todoID int64) bool {
	_, err := m.q.GetTodo(r.Context(), db.GetTodoParams{ID: todoID, UserID: userID(r)})
	if errors.Is(err, sql.ErrNoRows) {
		httputil.Error(w, http.StatusNotFound, "not_found", "todo not found")
		return false
	}
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not verify todo")
		return false
	}
	return true
}

// ensureTagOwned writes a 404 and returns false when the tag isn't the user's.
func (m *Module) ensureTagOwned(w http.ResponseWriter, r *http.Request, tagID int64) bool {
	_, err := m.q.GetTag(r.Context(), db.GetTagParams{ID: tagID, UserID: userID(r)})
	if errors.Is(err, sql.ErrNoRows) {
		httputil.Error(w, http.StatusNotFound, "not_found", "tag not found")
		return false
	}
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not verify tag")
		return false
	}
	return true
}

// tagsToResponse maps a slice of DB tags to their public representation.
func tagsToResponse(tags []db.TodoTag) []tagResponse {
	out := make([]tagResponse, 0, len(tags))
	for _, t := range tags {
		out = append(out, toTagResponse(t))
	}
	return out
}
