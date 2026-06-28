package todo

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
)

// TestTagsCRUD creates, lists and deletes a tag.
func TestTagsCRUD(t *testing.T) {
	srv := newTestServer(t)

	rec := do(t, srv, http.MethodPost, "/api/todo/tags", `{"name":"urgent"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: status=%d body=%s", rec.Code, rec.Body)
	}
	var created tagResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &created)
	if created.ID == 0 || created.Name != "urgent" {
		t.Fatalf("unexpected created tag: %+v", created)
	}

	rec = do(t, srv, http.MethodGet, "/api/todo/tags", "")
	var list []tagResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &list)
	if rec.Code != http.StatusOK || len(list) != 1 {
		t.Fatalf("list: status=%d len=%d", rec.Code, len(list))
	}

	if rec = do(t, srv, http.MethodDelete, fmt.Sprintf("/api/todo/tags/%d", created.ID), ""); rec.Code != http.StatusNoContent {
		t.Fatalf("delete: status=%d", rec.Code)
	}

	rec = do(t, srv, http.MethodGet, "/api/todo/tags", "")
	_ = json.Unmarshal(rec.Body.Bytes(), &list)
	if len(list) != 0 {
		t.Fatalf("expected no tags after delete, got %d", len(list))
	}
}

// TestCreateTagValidation rejects a blank name.
func TestCreateTagValidation(t *testing.T) {
	srv := newTestServer(t)
	rec := do(t, srv, http.MethodPost, "/api/todo/tags", `{"name":"  "}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status=%d, want 400", rec.Code)
	}
}

// TestTagAssignment attaches a tag to a todo, lists it back, then detaches it.
func TestTagAssignment(t *testing.T) {
	srv := newTestServer(t)

	todoID := createTodo(t, srv, `{"title":"Clean desk"}`)
	tagID := createTag(t, srv, `{"name":"home"}`)

	assign := fmt.Sprintf("/api/todo/todos/%d/tags/%d", todoID, tagID)
	if rec := do(t, srv, http.MethodPost, assign, ""); rec.Code != http.StatusNoContent {
		t.Fatalf("assign: status=%d body=%s", rec.Code, rec.Body)
	}

	rec := do(t, srv, http.MethodGet, fmt.Sprintf("/api/todo/todos/%d/tags", todoID), "")
	var tags []tagResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &tags)
	if len(tags) != 1 || tags[0].Name != "home" {
		t.Fatalf("expected [home], got %+v", tags)
	}

	if rec = do(t, srv, http.MethodDelete, assign, ""); rec.Code != http.StatusNoContent {
		t.Fatalf("detach: status=%d", rec.Code)
	}
	rec = do(t, srv, http.MethodGet, fmt.Sprintf("/api/todo/todos/%d/tags", todoID), "")
	_ = json.Unmarshal(rec.Body.Bytes(), &tags)
	if len(tags) != 0 {
		t.Fatalf("expected no tags after detach, got %+v", tags)
	}
}

// TestTagAssignmentOwnership returns 404 when the todo or the tag isn't the
// user's (here: doesn't exist at all).
func TestTagAssignmentOwnership(t *testing.T) {
	srv := newTestServer(t)

	tagID := createTag(t, srv, `{"name":"x"}`)
	if rec := do(t, srv, http.MethodPost, fmt.Sprintf("/api/todo/todos/99999/tags/%d", tagID), ""); rec.Code != http.StatusNotFound {
		t.Fatalf("assign to missing todo: status=%d, want 404", rec.Code)
	}

	todoID := createTodo(t, srv, `{"title":"real"}`)
	if rec := do(t, srv, http.MethodPost, fmt.Sprintf("/api/todo/todos/%d/tags/99999", todoID), ""); rec.Code != http.StatusNotFound {
		t.Fatalf("assign missing tag: status=%d, want 404", rec.Code)
	}
}

// createTodo posts a todo and returns its id.
func createTodo(t *testing.T, h http.Handler, body string) int64 {
	t.Helper()
	rec := do(t, h, http.MethodPost, "/api/todo/todos", body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("createTodo: status=%d body=%s", rec.Code, rec.Body)
	}
	var out todoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return out.ID
}

// createTag posts a tag and returns its id.
func createTag(t *testing.T, h http.Handler, body string) int64 {
	t.Helper()
	rec := do(t, h, http.MethodPost, "/api/todo/tags", body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("createTag: status=%d body=%s", rec.Code, rec.Body)
	}
	var out tagResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return out.ID
}
