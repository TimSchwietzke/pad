package todo

import (
	"fmt"
	"net/http"
	"testing"
)

// TestTodosReorder covers the custom order: new todos append to the end, the
// reorder endpoint rewrites the order, and a fresh todo still lands last.
func TestTodosReorder(t *testing.T) {
	srv := newTestServer(t)

	a := createTodo(t, srv, `{"title":"a"}`)
	b := createTodo(t, srv, `{"title":"b"}`)
	c := createTodo(t, srv, `{"title":"c"}`)

	// Created in order -> position 0,1,2 -> custom sort returns them as created.
	if got := listTitles(t, srv, "?sort=position"); !equal(got, []string{"a", "b", "c"}) {
		t.Fatalf("initial custom order = %v, want [a b c]", got)
	}

	// Reorder to c, a, b.
	rec := do(t, srv, http.MethodPut, "/api/todo/todos/reorder", fmt.Sprintf(`{"ids":[%d,%d,%d]}`, c, a, b))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("reorder: status=%d body=%s", rec.Code, rec.Body)
	}
	if got := listTitles(t, srv, "?sort=position"); !equal(got, []string{"c", "a", "b"}) {
		t.Fatalf("after reorder = %v, want [c a b]", got)
	}

	// A new todo appends to the end of the custom order.
	createTodo(t, srv, `{"title":"d"}`)
	if got := listTitles(t, srv, "?sort=position"); !equal(got, []string{"c", "a", "b", "d"}) {
		t.Fatalf("after append = %v, want [c a b d]", got)
	}
}

// TestReorderValidation rejects an empty list and duplicate ids.
func TestReorderValidation(t *testing.T) {
	srv := newTestServer(t)
	id := createTodo(t, srv, `{"title":"a"}`)

	cases := []string{
		`{"ids":[]}`,
		`{}`,
		fmt.Sprintf(`{"ids":[%d,%d]}`, id, id),
	}
	for _, body := range cases {
		if rec := do(t, srv, http.MethodPut, "/api/todo/todos/reorder", body); rec.Code != http.StatusBadRequest {
			t.Errorf("body %s: status=%d, want 400", body, rec.Code)
		}
	}
}

// TestReorderForeignIDRollsBack makes sure a foreign id aborts the whole batch:
// it returns 404 and leaves the existing order untouched (transaction rollback).
func TestReorderForeignIDRollsBack(t *testing.T) {
	srv := newTestServer(t)
	a := createTodo(t, srv, `{"title":"a"}`)
	b := createTodo(t, srv, `{"title":"b"}`)

	// First id is valid (would move b to the front); second id isn't the user's.
	rec := do(t, srv, http.MethodPut, "/api/todo/todos/reorder", fmt.Sprintf(`{"ids":[%d,%d]}`, b, a+b+999))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("foreign id: status=%d, want 404", rec.Code)
	}

	// The partial update to b must have rolled back: order is still a, b.
	if got := listTitles(t, srv, "?sort=position"); !equal(got, []string{"a", "b"}) {
		t.Fatalf("order after rollback = %v, want [a b]", got)
	}
}
