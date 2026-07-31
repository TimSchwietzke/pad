package todo

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"
)

// listTodos fetches the whole list through the router, the same way the frontend does.
func listTodos(t *testing.T, srv http.Handler) []todoResponse {
	t.Helper()
	rec := do(t, srv, http.MethodGet, "/api/todo/todos", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("list: status=%d body=%s", rec.Code, rec.Body)
	}
	var out []todoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	return out
}

// createTodoJSON posts a todo and returns it decoded.
func createTodoJSON(t *testing.T, srv http.Handler, body string) todoResponse {
	t.Helper()
	rec := do(t, srv, http.MethodPost, "/api/todo/todos", body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: status=%d body=%s", rec.Code, rec.Body)
	}
	var out todoResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode created: %v", err)
	}
	return out
}

// TestRecurrenceRoundtrip stores a repeat rule and reads it back through both the
// single-todo and the list endpoint.
func TestRecurrenceRoundtrip(t *testing.T) {
	srv := newTestServer(t)

	created := createTodoJSON(t, srv, `{"title":"Water the plants","recurrence":{"freq":"weekly","interval":2}}`)
	if created.Recurrence == nil {
		t.Fatalf("recurrence missing on create: %+v", created)
	}
	if created.Recurrence.Freq != freqWeekly || created.Recurrence.Interval != 2 {
		t.Fatalf("unexpected recurrence: %+v", created.Recurrence)
	}

	list := listTodos(t, srv)
	if len(list) != 1 || list[0].Recurrence == nil || list[0].Recurrence.Freq != freqWeekly {
		t.Fatalf("recurrence missing in list: %+v", list)
	}

	// a one-off task carries none
	plain := createTodoJSON(t, srv, `{"title":"Once"}`)
	if plain.Recurrence != nil {
		t.Fatalf("unexpected recurrence on a one-off: %+v", plain.Recurrence)
	}
}

// TestRecurrenceValidationHTTP rejects unknown cadences and bad intervals at the edge.
func TestRecurrenceValidationHTTP(t *testing.T) {
	srv := newTestServer(t)

	for _, body := range []string{
		`{"title":"x","recurrence":{"freq":"hourly","interval":1}}`,
		`{"title":"x","recurrence":{"freq":"","interval":1}}`,
		`{"title":"x","recurrence":{"freq":"daily","interval":-3}}`,
	} {
		if rec := do(t, srv, http.MethodPost, "/api/todo/todos", body); rec.Code != http.StatusBadRequest {
			t.Errorf("body %s: status=%d, want 400", body, rec.Code)
		}
	}

	// an omitted interval is fine and means "every one"
	created := createTodoJSON(t, srv, `{"title":"x","recurrence":{"freq":"daily"}}`)
	if created.Recurrence.Interval != 1 {
		t.Fatalf("interval = %d, want 1", created.Recurrence.Interval)
	}
}

// TestCompletingRecurringTodoSpawnsNext is the heart of the feature: checking a
// recurring task done keeps it as the finished occurrence and puts the next one
// on the list, deadline moved on, everything else inherited.
func TestCompletingRecurringTodoSpawnsNext(t *testing.T) {
	srv := newTestServer(t)

	rec := do(t, srv, http.MethodPost, "/api/todo/projects", `{"name":"Home"}`)
	var project projectResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &project)

	due := time.Now().AddDate(0, 0, 1).UTC().Truncate(time.Second)
	body := fmt.Sprintf(
		`{"title":"Take out the bins","notes":"blue one","priority":2,"estimate_minutes":10,"project_id":%d,"due_at":%q,"recurrence":{"freq":"weekly","interval":1}}`,
		project.ID, due.Format(time.RFC3339),
	)
	created := createTodoJSON(t, srv, body)

	// complete it
	done := fmt.Sprintf(
		`{"title":"Take out the bins","notes":"blue one","priority":2,"estimate_minutes":10,"project_id":%d,"due_at":%q,"status":"done","recurrence":{"freq":"weekly","interval":1}}`,
		project.ID, due.Format(time.RFC3339),
	)
	if rec := do(t, srv, http.MethodPut, fmt.Sprintf("/api/todo/todos/%d", created.ID), done); rec.Code != http.StatusOK {
		t.Fatalf("complete: status=%d body=%s", rec.Code, rec.Body)
	}

	list := listTodos(t, srv)
	if len(list) != 2 {
		t.Fatalf("want 2 todos (the finished one + its successor), got %d: %+v", len(list), list)
	}

	var finished, next todoResponse
	for _, td := range list {
		if td.ID == created.ID {
			finished = td
		} else {
			next = td
		}
	}
	if finished.Status != statusDone {
		t.Fatalf("the completed occurrence should stay done: %+v", finished)
	}
	if next.Status != statusOpen {
		t.Fatalf("successor should be open: %+v", next)
	}
	if next.DueAt == nil || !next.DueAt.Equal(due.AddDate(0, 0, 7)) {
		t.Fatalf("successor due_at = %v, want %v", next.DueAt, due.AddDate(0, 0, 7))
	}
	// everything that describes the task carries over
	if next.Title != created.Title || next.Notes != created.Notes || next.Priority != created.Priority {
		t.Fatalf("successor lost its identity: %+v", next)
	}
	if next.ProjectID == nil || *next.ProjectID != project.ID {
		t.Fatalf("successor lost its project: %+v", next)
	}
	if next.EstimateMinutes == nil || *next.EstimateMinutes != 10 {
		t.Fatalf("successor lost its estimate: %+v", next)
	}
	if next.Recurrence == nil || next.Recurrence.Freq != freqWeekly {
		t.Fatalf("successor lost the rule — the series would stop: %+v", next)
	}
}

// TestCompletingRecurringTodoCopiesTags checks the successor looks exactly like
// the occurrence it replaces, tags included.
func TestCompletingRecurringTodoCopiesTags(t *testing.T) {
	srv := newTestServer(t)

	rec := do(t, srv, http.MethodPost, "/api/todo/tags", `{"name":"chores"}`)
	var tag tagResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &tag)

	created := createTodoJSON(t, srv, `{"title":"Hoover","recurrence":{"freq":"daily","interval":1}}`)
	if rec := do(t, srv, http.MethodPost, fmt.Sprintf("/api/todo/todos/%d/tags/%d", created.ID, tag.ID), ""); rec.Code != http.StatusNoContent {
		t.Fatalf("attach tag: status=%d", rec.Code)
	}

	upd := `{"title":"Hoover","status":"done","recurrence":{"freq":"daily","interval":1}}`
	if rec := do(t, srv, http.MethodPut, fmt.Sprintf("/api/todo/todos/%d", created.ID), upd); rec.Code != http.StatusOK {
		t.Fatalf("complete: status=%d body=%s", rec.Code, rec.Body)
	}

	for _, td := range listTodos(t, srv) {
		if td.ID == created.ID {
			continue
		}
		if len(td.Tags) != 1 || td.Tags[0].Name != "chores" {
			t.Fatalf("successor lost its tags: %+v", td.Tags)
		}
		return
	}
	t.Fatal("no successor was created")
}

// TestUncheckingRecurringTodoRemovesSuccessor covers the undo path: a mis-click
// that is taken back must not leave a phantom occurrence behind.
func TestUncheckingRecurringTodoRemovesSuccessor(t *testing.T) {
	srv := newTestServer(t)

	created := createTodoJSON(t, srv, `{"title":"Stretch","recurrence":{"freq":"daily","interval":1}}`)
	path := fmt.Sprintf("/api/todo/todos/%d", created.ID)

	if rec := do(t, srv, http.MethodPut, path, `{"title":"Stretch","status":"done","recurrence":{"freq":"daily","interval":1}}`); rec.Code != http.StatusOK {
		t.Fatalf("complete: status=%d body=%s", rec.Code, rec.Body)
	}
	if list := listTodos(t, srv); len(list) != 2 {
		t.Fatalf("want 2 todos after completing, got %d", len(list))
	}

	// undo within the grace period
	if rec := do(t, srv, http.MethodPut, path, `{"title":"Stretch","status":"open","recurrence":{"freq":"daily","interval":1}}`); rec.Code != http.StatusOK {
		t.Fatalf("undo: status=%d body=%s", rec.Code, rec.Body)
	}
	list := listTodos(t, srv)
	if len(list) != 1 {
		t.Fatalf("undo should have taken the successor back, got %d: %+v", len(list), list)
	}
	if list[0].ID != created.ID || list[0].Status != statusOpen {
		t.Fatalf("wrong todo survived the undo: %+v", list[0])
	}
}

// TestUndoKeepsAWorkedOnSuccessor draws the line for the undo: once the user has
// finished the successor too, un-checking the older occurrence must not delete it.
func TestUndoKeepsAWorkedOnSuccessor(t *testing.T) {
	srv := newTestServer(t)

	first := createTodoJSON(t, srv, `{"title":"Journal","recurrence":{"freq":"daily","interval":1}}`)
	firstPath := fmt.Sprintf("/api/todo/todos/%d", first.ID)
	doneBody := `{"title":"Journal","status":"done","recurrence":{"freq":"daily","interval":1}}`

	if rec := do(t, srv, http.MethodPut, firstPath, doneBody); rec.Code != http.StatusOK {
		t.Fatalf("complete first: status=%d", rec.Code)
	}
	// find the successor and complete it as well (which spawns a third)
	var second todoResponse
	for _, td := range listTodos(t, srv) {
		if td.ID != first.ID {
			second = td
		}
	}
	if rec := do(t, srv, http.MethodPut, fmt.Sprintf("/api/todo/todos/%d", second.ID), doneBody); rec.Code != http.StatusOK {
		t.Fatalf("complete second: status=%d", rec.Code)
	}

	// now un-check the first one — the second is finished work, it stays
	if rec := do(t, srv, http.MethodPut, firstPath, `{"title":"Journal","status":"open","recurrence":{"freq":"daily","interval":1}}`); rec.Code != http.StatusOK {
		t.Fatalf("undo first: status=%d", rec.Code)
	}
	list := listTodos(t, srv)
	if len(list) != 3 {
		t.Fatalf("want 3 todos (first, second, third), got %d: %+v", len(list), list)
	}
	for _, td := range list {
		if td.ID == second.ID && td.Status != statusDone {
			t.Fatalf("the worked-on successor was disturbed: %+v", td)
		}
	}
}

// TestCompletingPlainTodoSpawnsNothing guards the blast radius: a task without a
// rule behaves exactly as before.
func TestCompletingPlainTodoSpawnsNothing(t *testing.T) {
	srv := newTestServer(t)

	created := createTodoJSON(t, srv, `{"title":"One-off"}`)
	upd := `{"title":"One-off","status":"done"}`
	if rec := do(t, srv, http.MethodPut, fmt.Sprintf("/api/todo/todos/%d", created.ID), upd); rec.Code != http.StatusOK {
		t.Fatalf("complete: status=%d", rec.Code)
	}
	if list := listTodos(t, srv); len(list) != 1 {
		t.Fatalf("a one-off task must not spawn anything, got %d todos", len(list))
	}
}

// TestCompletingUndatedRecurringTodoAnchorsOnNow: with no deadline to move on,
// the successor is scheduled relative to the moment the task was finished.
func TestCompletingUndatedRecurringTodoAnchorsOnNow(t *testing.T) {
	srv := newTestServer(t)

	created := createTodoJSON(t, srv, `{"title":"Push-ups","recurrence":{"freq":"daily","interval":1}}`)
	before := time.Now()
	upd := `{"title":"Push-ups","status":"done","recurrence":{"freq":"daily","interval":1}}`
	if rec := do(t, srv, http.MethodPut, fmt.Sprintf("/api/todo/todos/%d", created.ID), upd); rec.Code != http.StatusOK {
		t.Fatalf("complete: status=%d", rec.Code)
	}

	for _, td := range listTodos(t, srv) {
		if td.ID == created.ID {
			continue
		}
		if td.DueAt == nil {
			t.Fatalf("successor has no deadline: %+v", td)
		}
		// roughly a day out — exact to the second would race with the clock
		delta := td.DueAt.Sub(before)
		if delta < 23*time.Hour || delta > 25*time.Hour {
			t.Fatalf("successor due in %s, want about 24h", delta)
		}
		return
	}
	t.Fatal("no successor was created")
}

// TestWeekdayRuleRoundtrip stores a weekday rule in its own table and reads it
// back through create, list and get — canonical (sorted, de-duplicated).
func TestWeekdayRuleRoundtrip(t *testing.T) {
	srv := newTestServer(t)

	created := createTodoJSON(t, srv, `{"title":"Gym","recurrence":{"freq":"weekly","interval":1,"weekdays":[4,1,4]}}`)
	if got := created.Recurrence.Weekdays; len(got) != 2 || got[0] != 1 || got[1] != 4 {
		t.Fatalf("weekdays = %v, want [1 4] (sorted, de-duplicated)", got)
	}

	list := listTodos(t, srv)
	if len(list) != 1 || list[0].Recurrence == nil || len(list[0].Recurrence.Weekdays) != 2 {
		t.Fatalf("weekdays missing from the list embed: %+v", list)
	}

	rec := do(t, srv, http.MethodGet, fmt.Sprintf("/api/todo/todos/%d", created.ID), "")
	var single todoResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &single)
	if single.Recurrence == nil || len(single.Recurrence.Weekdays) != 2 {
		t.Fatalf("weekdays missing on the single todo: %+v", single.Recurrence)
	}

	// clearing them removes the rows again
	upd := fmt.Sprintf(`{"title":"Gym","recurrence":{"freq":"weekly","interval":1}}`)
	if rec := do(t, srv, http.MethodPut, fmt.Sprintf("/api/todo/todos/%d", created.ID), upd); rec.Code != http.StatusOK {
		t.Fatalf("clear weekdays: status=%d body=%s", rec.Code, rec.Body)
	}
	if got := listTodos(t, srv)[0].Recurrence.Weekdays; len(got) != 0 {
		t.Fatalf("weekdays should be gone, got %v", got)
	}
}

// TestWeekdayRuleRejectedForOtherCadences: "every 2 months on monday" has no
// obvious reading, so it's a 400 rather than a guess.
func TestWeekdayRuleRejectedForOtherCadences(t *testing.T) {
	srv := newTestServer(t)
	body := `{"title":"x","recurrence":{"freq":"monthly","interval":1,"weekdays":[1]}}`
	if rec := do(t, srv, http.MethodPost, "/api/todo/todos", body); rec.Code != http.StatusBadRequest {
		t.Fatalf("status=%d, want 400", rec.Code)
	}
}

// TestCompletingWeekdayRuleSpawnsOnTheNextSelectedDay: the successor lands on a
// day the rule actually names, and inherits the weekday rows.
func TestCompletingWeekdayRuleSpawnsOnTheNextSelectedDay(t *testing.T) {
	srv := newTestServer(t)

	// next monday, so the deadline is in the future and no catch-up interferes
	due := nextWeekdayFrom(time.Now(), time.Monday)
	rule := `"recurrence":{"freq":"weekly","interval":1,"weekdays":[1,4]}`
	created := createTodoJSON(t, srv, fmt.Sprintf(`{"title":"Gym","due_at":%q,%s}`, due.Format(time.RFC3339), rule))

	upd := fmt.Sprintf(`{"title":"Gym","status":"done","due_at":%q,%s}`, due.Format(time.RFC3339), rule)
	if rec := do(t, srv, http.MethodPut, fmt.Sprintf("/api/todo/todos/%d", created.ID), upd); rec.Code != http.StatusOK {
		t.Fatalf("complete: status=%d body=%s", rec.Code, rec.Body)
	}

	for _, td := range listTodos(t, srv) {
		if td.ID == created.ID {
			continue
		}
		if td.DueAt == nil || td.DueAt.Weekday() != time.Thursday {
			t.Fatalf("successor due %v, want the following thursday", td.DueAt)
		}
		if td.Recurrence == nil || len(td.Recurrence.Weekdays) != 2 {
			t.Fatalf("successor lost the weekday rows: %+v", td.Recurrence)
		}
		return
	}
	t.Fatal("no successor was created")
}

// nextWeekdayFrom returns the next given weekday strictly after t, at midnight.
func nextWeekdayFrom(t time.Time, want time.Weekday) time.Time {
	d := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
	for {
		d = d.AddDate(0, 0, 1)
		if d.Weekday() == want {
			return d
		}
	}
}

// TestSeriesEndsOnDate stops spawning once the next occurrence would fall past
// the end date.
func TestSeriesEndsOnDate(t *testing.T) {
	srv := newTestServer(t)

	due := time.Now().AddDate(0, 0, 1).UTC().Truncate(time.Second)
	until := due.AddDate(0, 0, 3) // the next daily occurrence (in 2 days) fits, the one after doesn't
	rule := fmt.Sprintf(`"recurrence":{"freq":"daily","interval":1,"until":%q}`, until.Format(time.RFC3339))
	created := createTodoJSON(t, srv, fmt.Sprintf(`{"title":"Sprint","due_at":%q,%s}`, due.Format(time.RFC3339), rule))
	if created.Recurrence.Until == nil {
		t.Fatalf("until not stored: %+v", created.Recurrence)
	}

	// completing three times walks past the end date; the series must stop there
	last := created
	for i := 0; i < 4; i++ {
		body := fmt.Sprintf(`{"title":"Sprint","status":"done","due_at":%q,%s}`, last.DueAt.Format(time.RFC3339), rule)
		if rec := do(t, srv, http.MethodPut, fmt.Sprintf("/api/todo/todos/%d", last.ID), body); rec.Code != http.StatusOK {
			t.Fatalf("complete %d: status=%d body=%s", i, rec.Code, rec.Body)
		}
		var next *todoResponse
		for _, td := range listTodos(t, srv) {
			if td.Status == statusOpen {
				copy := td
				next = &copy
			}
		}
		if next == nil {
			break // the series ended, which is what we're testing for
		}
		if next.DueAt.After(until) {
			t.Fatalf("occurrence due %s is past the end date %s", next.DueAt, until)
		}
		last = *next
	}

	for _, td := range listTodos(t, srv) {
		if td.Status == statusOpen {
			t.Fatalf("series should have ended, but %q is still open (due %s)", td.Title, td.DueAt)
		}
	}
}

// TestSeriesEndsAfterCount counts down with every occurrence and stops at zero.
func TestSeriesEndsAfterCount(t *testing.T) {
	srv := newTestServer(t)

	rule := `"recurrence":{"freq":"daily","interval":1,"count":2}`
	created := createTodoJSON(t, srv, fmt.Sprintf(`{"title":"Physio",%s}`, rule))
	if created.Recurrence.Count == nil || *created.Recurrence.Count != 2 {
		t.Fatalf("count not stored: %+v", created.Recurrence)
	}

	// first completion -> one occurrence left
	doneBody := fmt.Sprintf(`{"title":"Physio","status":"done",%s}`, rule)
	if rec := do(t, srv, http.MethodPut, fmt.Sprintf("/api/todo/todos/%d", created.ID), doneBody); rec.Code != http.StatusOK {
		t.Fatalf("complete 1: status=%d body=%s", rec.Code, rec.Body)
	}
	second := openTodoOf(t, srv)
	if second == nil || second.Recurrence.Count == nil || *second.Recurrence.Count != 1 {
		t.Fatalf("after the first spawn the successor should have 1 left: %+v", second)
	}

	// second completion -> the successor is the last one, nothing follows it
	body := fmt.Sprintf(`{"title":"Physio","status":"done","recurrence":{"freq":"daily","interval":1,"count":%d}}`, *second.Recurrence.Count)
	if rec := do(t, srv, http.MethodPut, fmt.Sprintf("/api/todo/todos/%d", second.ID), body); rec.Code != http.StatusOK {
		t.Fatalf("complete 2: status=%d body=%s", rec.Code, rec.Body)
	}
	third := openTodoOf(t, srv)
	if third == nil || third.Recurrence.Count == nil || *third.Recurrence.Count != 0 {
		t.Fatalf("the last occurrence should carry 0 left: %+v", third)
	}

	// completing it spawns nothing — the countdown is spent
	body = `{"title":"Physio","status":"done","recurrence":{"freq":"daily","interval":1,"count":0}}`
	if rec := do(t, srv, http.MethodPut, fmt.Sprintf("/api/todo/todos/%d", third.ID), body); rec.Code != http.StatusOK {
		t.Fatalf("complete 3: status=%d body=%s", rec.Code, rec.Body)
	}
	if last := openTodoOf(t, srv); last != nil {
		t.Fatalf("series should have ended, but %+v is still open", last)
	}
}

// openTodoOf returns the single open todo, or nil when there is none.
func openTodoOf(t *testing.T, srv http.Handler) *todoResponse {
	t.Helper()
	for _, td := range listTodos(t, srv) {
		if td.Status == statusOpen {
			out := td
			return &out
		}
	}
	return nil
}

// TestRemovingRecurrenceStopsTheSeries: clearing the rule makes the next
// completion the last one.
func TestRemovingRecurrenceStopsTheSeries(t *testing.T) {
	srv := newTestServer(t)

	created := createTodoJSON(t, srv, `{"title":"Enough","recurrence":{"freq":"daily","interval":1}}`)
	path := fmt.Sprintf("/api/todo/todos/%d", created.ID)

	// drop the rule, then complete
	if rec := do(t, srv, http.MethodPut, path, `{"title":"Enough"}`); rec.Code != http.StatusOK {
		t.Fatalf("clear rule: status=%d body=%s", rec.Code, rec.Body)
	}
	if rec := do(t, srv, http.MethodPut, path, `{"title":"Enough","status":"done"}`); rec.Code != http.StatusOK {
		t.Fatalf("complete: status=%d", rec.Code)
	}
	if list := listTodos(t, srv); len(list) != 1 {
		t.Fatalf("series should have stopped, got %d todos", len(list))
	}
}
