package todo

import "strings"

// likeEscaper neutralises the wildcards LIKE/ILIKE understands. Without it a
// user searching for "50%" would match every todo, and "_" would match any
// character — surprising for someone who just typed what they remember.
// Backslash is Postgres' default LIKE escape character, so it has to go first.
var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

// searchTerm normalises the ?q= parameter into the literal fragment to look for.
// Whitespace-only input means "no search" and returns the empty string, so the
// caller can skip the clause entirely instead of matching everything.
//
// The result is wrapped in %…% by the caller and passed as a bound parameter —
// it never reaches the SQL text itself.
func searchTerm(raw string) string {
	q := strings.TrimSpace(raw)
	if q == "" {
		return ""
	}
	return likeEscaper.Replace(q)
}
