package todo

import "testing"

// TestParseSortDefault: an empty spec yields the default order.
func TestParseSortDefault(t *testing.T) {
	terms, err := parseSort("")
	if err != nil {
		t.Fatal(err)
	}
	want := []orderTerm{{"priority", true}, {"due_at", false}}
	if len(terms) != len(want) || terms[0] != want[0] || terms[1] != want[1] {
		t.Fatalf("default = %+v, want %+v", terms, want)
	}
}

// TestParseSortMultiKey: multiple keys with mixed directions resolve in order.
func TestParseSortMultiKey(t *testing.T) {
	terms, err := parseSort("-priority,due,estimate")
	if err != nil {
		t.Fatal(err)
	}
	want := []orderTerm{{"priority", true}, {"due_at", false}, {"estimate_minutes", false}}
	if len(terms) != len(want) {
		t.Fatalf("len=%d, want %d", len(terms), len(want))
	}
	for i := range want {
		if terms[i] != want[i] {
			t.Errorf("term %d = %+v, want %+v", i, terms[i], want[i])
		}
	}
}

// TestParseSortUnknownKey: an unknown key is an error (so the handler can 400).
func TestParseSortUnknownKey(t *testing.T) {
	if _, err := parseSort("bogus"); err == nil {
		t.Fatal("expected an error for an unknown sort field")
	}
}

// TestOrderClause: terms render to safe SQL with NULLS LAST on nullable columns
// and a stable id tiebreaker.
func TestOrderClause(t *testing.T) {
	got := orderClause([]orderTerm{{"priority", true}, {"due_at", false}})
	want := "priority DESC, due_at ASC NULLS LAST, id ASC"
	if got != want {
		t.Fatalf("orderClause = %q, want %q", got, want)
	}
}
