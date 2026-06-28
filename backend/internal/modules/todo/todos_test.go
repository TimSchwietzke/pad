package todo

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"
)

// TestTodosCRUD walks a todo through create, list, get, update and delete,
// checking the defaults (status "open", no project, no due date) along the way.
func TestTodosCRUD(t *testing.T) {
	srv := newTestServer(t)

	rec := do(t, srv, http.MethodPost, "/api/todo/todos", `{"title":"Buy milk","priority":2}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: status=%d body=%s", rec.Code, rec.Body)
	}
	var created todoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode created: %v", err)
	}
	if created.ID == 0 || created.Title != "Buy milk" || created.Priority != 2 {
		t.Fatalf("unexpected created todo: %+v", created)
	}
	if created.Status != statusOpen || created.ProjectID != nil || created.DueAt != nil {
		t.Fatalf("unexpected defaults: %+v", created)
	}

	rec = do(t, srv, http.MethodGet, "/api/todo/todos", "")
	var list []todoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &list)
	if rec.Code != http.StatusOK || len(list) != 1 {
		t.Fatalf("list: status=%d len=%d", rec.Code, len(list))
	}

	path := fmt.Sprintf("/api/todo/todos/%d", created.ID)
	rec = do(t, srv, http.MethodPut, path, `{"title":"Buy oat milk","priority":3,"status":"done"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("update: status=%d body=%s", rec.Code, rec.Body)
	}
	var updated todoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &updated)
	if updated.Title != "Buy oat milk" || updated.Priority != 3 || updated.Status != statusDone {
		t.Fatalf("unexpected updated todo: %+v", updated)
	}

	if rec = do(t, srv, http.MethodDelete, path, ""); rec.Code != http.StatusNoContent {
		t.Fatalf("delete: status=%d", rec.Code)
	}
	if rec = do(t, srv, http.MethodGet, path, ""); rec.Code != http.StatusNotFound {
		t.Fatalf("get after delete: status=%d, want 404", rec.Code)
	}
}

// TestCreateTodoValidation rejects a blank title, an out-of-range priority and
// an unknown status.
func TestCreateTodoValidation(t *testing.T) {
	srv := newTestServer(t)

	cases := []string{
		`{"title":"   "}`,
		`{"title":"x","priority":9}`,
		`{"title":"x","status":"maybe"}`,
	}
	for _, body := range cases {
		rec := do(t, srv, http.MethodPost, "/api/todo/todos", body)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("body %s: status=%d, want 400", body, rec.Code)
		}
	}
}

// TestTodoWithProject links a todo to one of the user's projects, and rejects a
// link to a project that doesn't exist (or isn't theirs).
func TestTodoWithProject(t *testing.T) {
	srv := newTestServer(t)

	rec := do(t, srv, http.MethodPost, "/api/todo/projects", `{"name":"Work"}`)
	var project projectResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &project)

	rec = do(t, srv, http.MethodPost, "/api/todo/todos", fmt.Sprintf(`{"title":"Task","project_id":%d}`, project.ID))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create with project: status=%d body=%s", rec.Code, rec.Body)
	}
	var withProject todoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &withProject)
	if withProject.ProjectID == nil || *withProject.ProjectID != project.ID {
		t.Fatalf("project_id not set: %+v", withProject)
	}

	rec = do(t, srv, http.MethodPost, "/api/todo/todos", `{"title":"Task","project_id":99999}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("create with bogus project: status=%d, want 400", rec.Code)
	}
}

// TestTodoDueAtRoundtrip makes sure a due date survives the round-trip through
// PostgreSQL as the same instant.
func TestTodoDueAtRoundtrip(t *testing.T) {
	srv := newTestServer(t)

	rec := do(t, srv, http.MethodPost, "/api/todo/todos", `{"title":"Deadline","due_at":"2026-07-01T10:00:00Z"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: status=%d body=%s", rec.Code, rec.Body)
	}
	var created todoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &created)
	if created.DueAt == nil {
		t.Fatal("due_at is nil, want a time")
	}
	want, _ := time.Parse(time.RFC3339, "2026-07-01T10:00:00Z")
	if !created.DueAt.Equal(want) {
		t.Fatalf("due_at = %v, want %v", created.DueAt, want)
	}
}
