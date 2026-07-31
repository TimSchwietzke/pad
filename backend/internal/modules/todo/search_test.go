package todo

import (
	"net/http"
	"testing"
)

// TestSearchTerm covers the normalisation on its own: what counts as "no
// search", and that LIKE's wildcards are neutralised.
func TestSearchTerm(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"empty", "", ""},
		{"whitespace only", "   \t ", ""},
		{"trimmed", "  milk  ", "milk"},
		{"percent is literal", "50%", `50\%`},
		{"underscore is literal", "a_b", `a\_b`},
		{"backslash is escaped first", `a\b`, `a\\b`},
		{"mixed", `100%_off\`, `100\%\_off\\`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := searchTerm(c.in); got != c.want {
				t.Fatalf("searchTerm(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}

// TestTodosSearch drives ?q= through the full router → auth → SQL path.
func TestTodosSearch(t *testing.T) {
	srv := newTestServer(t)

	createTodo(t, srv, `{"title":"Buy milk"}`)
	createTodo(t, srv, `{"title":"Write report","notes":"ask about the milk budget"}`)
	createTodo(t, srv, `{"title":"Call plumber"}`)
	createTodo(t, srv, `{"title":"Pay 50% deposit"}`)

	// Matches the title of one and the notes of another — case-insensitive.
	got := listTitles(t, srv, "?q=MILK")
	if len(got) != 2 || !contains(got, "Buy milk") || !contains(got, "Write report") {
		t.Fatalf("q=MILK = %v, want the two milk todos", got)
	}

	// A fragment from the middle of a word still matches (substring, not prefix).
	if got := listTitles(t, srv, "?q=lumb"); !equal(got, []string{"Call plumber"}) {
		t.Fatalf("q=lumb = %v, want [Call plumber]", got)
	}

	// "%" is a literal here, not "match everything".
	if got := listTitles(t, srv, "?q=50%25"); !equal(got, []string{"Pay 50% deposit"}) {
		t.Fatalf("q=50%% = %v, want [Pay 50%% deposit]", got)
	}

	// Blank search is no search at all.
	if got := listTitles(t, srv, "?q=%20%20"); len(got) != 4 {
		t.Fatalf("blank q returned %d todos, want all 4", len(got))
	}

	// No hit is an empty list, not an error.
	rec := do(t, srv, http.MethodGet, "/api/todo/todos?q=zzzz", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("miss: status=%d body=%s", rec.Code, rec.Body)
	}
	if got := listTitles(t, srv, "?q=zzzz"); len(got) != 0 {
		t.Fatalf("miss returned %v, want nothing", got)
	}

	// Search combines with sorting rather than replacing it: the priority sort
	// still decides the order among the matches.
	createTodo(t, srv, `{"title":"milk run","priority":3}`)
	got = listTitles(t, srv, "?q=milk&sort=-priority")
	if len(got) != 3 || got[0] != "milk run" {
		t.Fatalf("q+sort = %v, want 3 matches with the priority-3 one first", got)
	}
}

// contains reports whether the slice holds the given title.
func contains(titles []string, want string) bool {
	for _, t := range titles {
		if t == want {
			return true
		}
	}
	return false
}
