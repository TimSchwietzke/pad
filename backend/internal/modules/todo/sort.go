package todo

import (
	"errors"
	"fmt"
	"strings"
)

// orderTerm is one resolved ORDER BY component: a whitelisted column and a
// direction.
type orderTerm struct {
	column string
	desc   bool
}

// sortColumns maps the public sort keys (what clients pass in ?sort=) to real
// table columns. Only keys in this map are accepted — that whitelist is what
// keeps the dynamically built ORDER BY safe from SQL injection.
var sortColumns = map[string]string{
	"priority": "priority",
	"estimate": "estimate_minutes",
	"due":      "due_at",
	"created":  "created_at",
	"updated":  "updated_at",
	"title":    "title",
	"position": "position", // the manual "custom" order (drag-to-reorder)
}

// nullableColumns get NULLS LAST so todos without a due date or estimate sink to
// the bottom regardless of direction.
var nullableColumns = map[string]bool{
	"due_at":           true,
	"estimate_minutes": true,
}

// defaultSort applies when no ?sort= is given: highest priority first, then the
// soonest deadline.
func defaultSort() []orderTerm {
	return []orderTerm{
		{column: "priority", desc: true},
		{column: "due_at", desc: false},
	}
}

// parseSort turns a comma-separated sort spec into ordered terms. A leading "-"
// means descending; "+" or no prefix means ascending. Examples:
//
//	""              -> default (priority desc, due asc)
//	"-priority,due" -> priority desc, then due asc
//	"estimate"      -> estimate asc
//
// An unknown key is rejected so the handler can answer 400 instead of guessing.
func parseSort(raw string) ([]orderTerm, error) {
	if strings.TrimSpace(raw) == "" {
		return defaultSort(), nil
	}

	var terms []orderTerm
	for _, part := range strings.Split(raw, ",") {
		key := strings.TrimSpace(part)
		if key == "" {
			continue
		}
		desc := false
		switch key[0] {
		case '-':
			desc, key = true, key[1:]
		case '+':
			key = key[1:]
		}
		column, ok := sortColumns[key]
		if !ok {
			return nil, fmt.Errorf("unknown sort field %q", key)
		}
		terms = append(terms, orderTerm{column: column, desc: desc})
	}
	if len(terms) == 0 {
		return nil, errors.New("sort is empty")
	}
	return terms, nil
}

// orderClause renders the terms into a SQL ORDER BY body, always ending with a
// stable "id ASC" tiebreaker. Columns come from the whitelist, so this string is
// safe to concatenate into the query.
func orderClause(terms []orderTerm) string {
	parts := make([]string, 0, len(terms)+1)
	for _, t := range terms {
		dir := "ASC"
		if t.desc {
			dir = "DESC"
		}
		clause := t.column + " " + dir
		if nullableColumns[t.column] {
			clause += " NULLS LAST"
		}
		parts = append(parts, clause)
	}
	parts = append(parts, "id ASC")
	return strings.Join(parts, ", ")
}
