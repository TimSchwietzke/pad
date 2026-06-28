package todo

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
)

// TestTodosSorting creates todos with different priorities and verifies that the
// ?sort= spec actually changes the order returned.
func TestTodosSorting(t *testing.T) {
	srv := newTestServer(t)

	createTodo(t, srv, `{"title":"low","priority":1}`)
	createTodo(t, srv, `{"title":"high","priority":3}`)
	createTodo(t, srv, `{"title":"medium","priority":2}`)

	// Default: priority desc -> high, medium, low.
	if got := listTitles(t, srv, ""); !equal(got, []string{"high", "medium", "low"}) {
		t.Fatalf("default sort = %v, want [high medium low]", got)
	}

	// Ascending priority -> low, medium, high.
	if got := listTitles(t, srv, "?sort=priority"); !equal(got, []string{"low", "medium", "high"}) {
		t.Fatalf("asc sort = %v, want [low medium high]", got)
	}

	// Alphabetical by title.
	if got := listTitles(t, srv, "?sort=title"); !equal(got, []string{"high", "low", "medium"}) {
		t.Fatalf("title sort = %v, want [high low medium]", got)
	}

	// Unknown key -> 400.
	if rec := do(t, srv, http.MethodGet, "/api/todo/todos?sort=bogus", ""); rec.Code != http.StatusBadRequest {
		t.Fatalf("bogus sort: status=%d, want 400", rec.Code)
	}
}

// TestTodoEstimateRoundtrip stores and reads back an effort estimate, and
// rejects a negative one.
func TestTodoEstimateRoundtrip(t *testing.T) {
	srv := newTestServer(t)

	id := createTodo(t, srv, `{"title":"Write report","estimate_minutes":90}`)
	rec := do(t, srv, http.MethodGet, fmt.Sprintf("/api/todo/todos/%d", id), "")
	var got todoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.EstimateMinutes == nil || *got.EstimateMinutes != 90 {
		t.Fatalf("estimate_minutes = %v, want 90", got.EstimateMinutes)
	}

	if rec := do(t, srv, http.MethodPost, "/api/todo/todos", `{"title":"x","estimate_minutes":-5}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("negative estimate: status=%d, want 400", rec.Code)
	}
}

// listTitles fetches the todo list with the given query suffix and returns the
// titles in the order they came back.
func listTitles(t *testing.T, h http.Handler, query string) []string {
	t.Helper()
	rec := do(t, h, http.MethodGet, "/api/todo/todos"+query, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("list: status=%d body=%s", rec.Code, rec.Body)
	}
	var todos []todoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &todos)
	titles := make([]string, len(todos))
	for i, td := range todos {
		titles[i] = td.Title
	}
	return titles
}

func equal(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
