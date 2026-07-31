package todo

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/TimSchwietzke/pad/backend/internal/core/httputil"
	"github.com/TimSchwietzke/pad/backend/internal/db"
)

// Allowed todo statuses.
const (
	statusOpen = "open"
	statusDone = "done"
)

// errProjectNotFound signals that a referenced project isn't the user's.
var errProjectNotFound = errors.New("project not found")

// todoResponse is the JSON shape returned to clients. Nullable columns become
// pointers (null in JSON) instead of leaking sql.Null wrappers.
type todoResponse struct {
	ID              int64      `json:"id"`
	ProjectID       *int64     `json:"project_id"`
	Title           string     `json:"title"`
	Notes           string     `json:"notes"`
	Priority        int32      `json:"priority"`
	Status          string     `json:"status"`
	DueAt           *time.Time `json:"due_at"`
	EstimateMinutes *int32     `json:"estimate_minutes"`
	// Position is the rank in the user's manual "custom" order (see sort.go).
	Position int64 `json:"position"`
	// Recurrence is the repeat cadence, or null for a one-off task.
	Recurrence *recurrenceRule `json:"recurrence"`
	CreatedAt  time.Time       `json:"created_at"`
	UpdatedAt  time.Time       `json:"updated_at"`
	// Tags attached to this todo. Always a slice (never null); populated by the
	// list handler, empty on single-todo responses.
	Tags []tagResponse `json:"tags"`
}

func toTodoResponse(t db.Todo) todoResponse {
	return todoResponse{
		ID:              t.ID,
		ProjectID:       int64Ptr(t.ProjectID),
		Title:           t.Title,
		Notes:           t.Notes,
		Priority:        t.Priority,
		Status:          t.Status,
		DueAt:           timePtr(t.DueAt),
		EstimateMinutes: int32Ptr(t.EstimateMinutes),
		Position:        t.Position,
		Recurrence:      rulePtr(t),
		CreatedAt:       t.CreatedAt,
		UpdatedAt:       t.UpdatedAt,
		Tags:            []tagResponse{},
	}
}

// rulePtr rebuilds the recurrence rule from its columns; a todo without a
// cadence has none (null in JSON), and the interval alone means nothing. The
// weekdays live in their own table and are filled in by the caller.
func rulePtr(t db.Todo) *recurrenceRule {
	if !t.RecurrenceFreq.Valid {
		return nil
	}
	return &recurrenceRule{
		Freq:     t.RecurrenceFreq.String,
		Interval: t.RecurrenceInterval,
		Until:    timePtr(t.RecurrenceUntil),
		Count:    int32Ptr(t.RecurrenceRemaining),
	}
}

// todoRequest is the create/update payload. Pointer fields are optional.
type todoRequest struct {
	ProjectID       *int64     `json:"project_id"`
	Title           string     `json:"title"`
	Notes           string     `json:"notes"`
	Priority        int32      `json:"priority"`
	Status          string     `json:"status"`
	DueAt           *time.Time `json:"due_at"`
	EstimateMinutes *int32     `json:"estimate_minutes"`
	// Recurrence turns the task into a repeating one; null (or absent) clears it.
	Recurrence *recurrenceRule `json:"recurrence"`
}

// normalizeAndValidate trims the title, defaults an empty status to "open", and
// rejects anything outside the allowed ranges.
func (b *todoRequest) normalizeAndValidate() error {
	b.Title = strings.TrimSpace(b.Title)
	if b.Title == "" {
		return errors.New("title is required")
	}
	if b.Priority < 0 || b.Priority > 3 {
		return errors.New("priority must be between 0 and 3")
	}
	if b.Status == "" {
		b.Status = statusOpen
	}
	if b.Status != statusOpen && b.Status != statusDone {
		return errors.New(`status must be "open" or "done"`)
	}
	if b.EstimateMinutes != nil && *b.EstimateMinutes < 0 {
		return errors.New("estimate_minutes must be >= 0")
	}
	if b.Recurrence != nil {
		if err := b.Recurrence.validate(); err != nil {
			return err
		}
	}
	return nil
}

// nullFreq / interval split a recurrence rule into the two columns it is stored
// in. A todo without a rule keeps the interval's default of 1, which is inert.
func (b *todoRequest) nullFreq() sql.NullString {
	if b.Recurrence == nil {
		return sql.NullString{}
	}
	return sql.NullString{String: b.Recurrence.Freq, Valid: true}
}

func (b *todoRequest) interval() int32 {
	if b.Recurrence == nil {
		return 1
	}
	return b.Recurrence.Interval
}

func (b *todoRequest) until() sql.NullTime {
	if b.Recurrence == nil {
		return sql.NullTime{}
	}
	return nullTime(b.Recurrence.Until)
}

func (b *todoRequest) count() sql.NullInt32 {
	if b.Recurrence == nil {
		return sql.NullInt32{}
	}
	return nullInt32(b.Recurrence.Count)
}

// weekdays is always a slice (never nil), so a cleared rule writes an empty set.
func (b *todoRequest) weekdays() []int32 {
	if b.Recurrence == nil {
		return nil
	}
	return b.Recurrence.Weekdays
}

// ensureProjectOwned rejects a todo that points at a project the user doesn't
// own. The foreign key alone would happily reference another user's project, so
// we check ownership explicitly. A nil projectID means "no project" and passes.
func (m *Module) ensureProjectOwned(ctx context.Context, projectID *int64, uid int64) error {
	if projectID == nil {
		return nil
	}
	_, err := m.q.GetProject(ctx, db.GetProjectParams{ID: *projectID, UserID: uid})
	if errors.Is(err, sql.ErrNoRows) {
		return errProjectNotFound
	}
	return err
}

// listTodos returns the current user's todos, ordered by the optional ?sort=
// spec (default: priority desc, then soonest due). Sort columns come from a
// whitelist (see sort.go), so the dynamic ORDER BY can't be abused.
func (m *Module) listTodos(w http.ResponseWriter, r *http.Request) {
	terms, err := parseSort(r.URL.Query().Get("sort"))
	if err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid_sort", err.Error())
		return
	}

	const cols = `id, user_id, project_id, title, notes, priority, status, due_at, estimate_minutes, position, ` +
		`recurrence_freq, recurrence_interval, recurrence_until, recurrence_remaining, spawned_from_id, ` +
		`created_at, updated_at`
	query := `SELECT ` + cols + ` FROM todos WHERE user_id = $1 ORDER BY ` + orderClause(terms)

	rows, err := m.db.QueryContext(r.Context(), query, userID(r))
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not load todos")
		return
	}
	defer rows.Close()

	out := []todoResponse{}
	for rows.Next() {
		var t db.Todo
		if err := rows.Scan(
			&t.ID, &t.UserID, &t.ProjectID, &t.Title, &t.Notes, &t.Priority,
			&t.Status, &t.DueAt, &t.EstimateMinutes, &t.Position,
			&t.RecurrenceFreq, &t.RecurrenceInterval, &t.RecurrenceUntil, &t.RecurrenceRemaining,
			&t.SpawnedFromID, &t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			httputil.Error(w, http.StatusInternalServerError, "db_error", "could not read todos")
			return
		}
		out = append(out, toTodoResponse(t))
	}
	if err := rows.Err(); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not read todos")
		return
	}

	// Embed each todo's tags. One extra round-trip for the whole list keeps the
	// client from firing an N+1 storm of per-todo tag requests.
	tagRows, err := m.q.ListTagsForUserTodos(r.Context(), userID(r))
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not read tags")
		return
	}
	byTodo := make(map[int64][]tagResponse, len(tagRows))
	for _, tr := range tagRows {
		byTodo[tr.TodoID] = append(byTodo[tr.TodoID], tagResponse{ID: tr.ID, Name: tr.Name})
	}
	for i := range out {
		if tags := byTodo[out[i].ID]; tags != nil {
			out[i].Tags = tags
		}
	}

	// Same idea for the weekday rules: they live in their own table (the schema
	// stays normalized), so one aggregate query fills them all in.
	dayRows, err := m.q.ListRecurrenceDaysForUserTodos(r.Context(), userID(r))
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not read recurrence days")
		return
	}
	daysByTodo := make(map[int64][]int32, len(dayRows))
	for _, dr := range dayRows {
		daysByTodo[dr.TodoID] = append(daysByTodo[dr.TodoID], int32(dr.Weekday))
	}
	for i := range out {
		if out[i].Recurrence != nil {
			out[i].Recurrence.Weekdays = daysByTodo[out[i].ID]
		}
	}

	httputil.JSON(w, http.StatusOK, out)
}

// createTodo creates a todo for the current user.
func (m *Module) createTodo(w http.ResponseWriter, r *http.Request) {
	var body todoRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	if err := body.normalizeAndValidate(); err != nil {
		httputil.Error(w, http.StatusBadRequest, "validation", err.Error())
		return
	}

	uid := userID(r)
	if err := m.ensureProjectOwned(r.Context(), body.ProjectID, uid); err != nil {
		writeProjectCheckError(w, err)
		return
	}

	// The todo and its weekday rows are one change — a rule half-written would
	// repeat on the wrong days.
	tx, err := m.db.BeginTx(r.Context(), nil)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not create todo")
		return
	}
	defer tx.Rollback() // no-op once committed
	qtx := m.q.WithTx(tx)

	t, err := qtx.CreateTodo(r.Context(), db.CreateTodoParams{
		UserID:              uid,
		ProjectID:           nullInt64(body.ProjectID),
		Title:               body.Title,
		Notes:               body.Notes,
		Priority:            body.Priority,
		Status:              body.Status,
		DueAt:               nullTime(body.DueAt),
		EstimateMinutes:     nullInt32(body.EstimateMinutes),
		RecurrenceFreq:      body.nullFreq(),
		RecurrenceInterval:  body.interval(),
		RecurrenceUntil:     body.until(),
		RecurrenceRemaining: body.count(),
		// Only the recurrence machinery links occurrences; the API never does.
		SpawnedFromID: sql.NullInt64{},
	})
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not create todo")
		return
	}
	if err := writeRecurrenceDays(r.Context(), qtx, t.ID, body.weekdays()); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not create todo")
		return
	}
	if err := tx.Commit(); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not create todo")
		return
	}

	out := toTodoResponse(t)
	if out.Recurrence != nil {
		out.Recurrence.Weekdays = body.weekdays()
	}
	httputil.JSON(w, http.StatusCreated, out)
}

// writeRecurrenceDays replaces a todo's weekday rows. Clearing first keeps the
// table honest when days are removed — the set is small, so a rewrite is simpler
// (and easier to reason about) than diffing.
func writeRecurrenceDays(ctx context.Context, q *db.Queries, todoID int64, days []int32) error {
	if err := q.ClearRecurrenceDays(ctx, todoID); err != nil {
		return err
	}
	for _, d := range days {
		// the column is SMALLINT — the API speaks int32, the table int16
		if err := q.AddRecurrenceDay(ctx, db.AddRecurrenceDayParams{TodoID: todoID, Weekday: int16(d)}); err != nil {
			return err
		}
	}
	return nil
}

// attachWeekdays fills a single todo's rule with its weekday rows.
func (m *Module) attachWeekdays(ctx context.Context, out *todoResponse) error {
	if out.Recurrence == nil {
		return nil
	}
	days, err := m.q.ListRecurrenceDaysForTodo(ctx, out.ID)
	if err != nil {
		return err
	}
	out.Recurrence.Weekdays = make([]int32, len(days))
	for i, d := range days {
		out.Recurrence.Weekdays[i] = int32(d)
	}
	return nil
}

// getTodo returns a single todo, or 404 if it isn't the user's.
func (m *Module) getTodo(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	t, err := m.q.GetTodo(r.Context(), db.GetTodoParams{ID: id, UserID: userID(r)})
	if errors.Is(err, sql.ErrNoRows) {
		httputil.Error(w, http.StatusNotFound, "not_found", "todo not found")
		return
	}
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not load todo")
		return
	}
	out := toTodoResponse(t)
	if err := m.attachWeekdays(r.Context(), &out); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not load todo")
		return
	}
	httputil.JSON(w, http.StatusOK, out)
}

// updateTodo replaces the editable fields of a todo the user owns.
func (m *Module) updateTodo(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	var body todoRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	if err := body.normalizeAndValidate(); err != nil {
		httputil.Error(w, http.StatusBadRequest, "validation", err.Error())
		return
	}

	uid := userID(r)
	if err := m.ensureProjectOwned(r.Context(), body.ProjectID, uid); err != nil {
		writeProjectCheckError(w, err)
		return
	}

	// Recurrence keys off the status *change*, so we need to know what the row
	// looked like before this write.
	before, err := m.q.GetTodo(r.Context(), db.GetTodoParams{ID: id, UserID: uid})
	if errors.Is(err, sql.ErrNoRows) {
		httputil.Error(w, http.StatusNotFound, "not_found", "todo not found")
		return
	}
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not load todo")
		return
	}

	// The update and the occurrence it may spawn (or take back) are one change:
	// a task must never end up done without its successor, or vice versa.
	tx, err := m.db.BeginTx(r.Context(), nil)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not update todo")
		return
	}
	defer tx.Rollback() // no-op once committed
	qtx := m.q.WithTx(tx)

	t, err := qtx.UpdateTodo(r.Context(), db.UpdateTodoParams{
		ProjectID:          nullInt64(body.ProjectID),
		Title:              body.Title,
		Notes:              body.Notes,
		Priority:           body.Priority,
		Status:             body.Status,
		DueAt:              nullTime(body.DueAt),
		EstimateMinutes:    nullInt32(body.EstimateMinutes),
		RecurrenceFreq:     body.nullFreq(),
		RecurrenceInterval: body.interval(),
		ID:                 id,
		UserID:             uid,
	})
	if errors.Is(err, sql.ErrNoRows) {
		httputil.Error(w, http.StatusNotFound, "not_found", "todo not found")
		return
	}
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not update todo")
		return
	}

	// The end-of-series columns aren't part of UpdateTodo (they move on their own
	// when an occurrence is spawned), so they're written separately here.
	if err := qtx.SetTodoRecurrenceEnd(r.Context(), db.SetTodoRecurrenceEndParams{
		RecurrenceUntil:     body.until(),
		RecurrenceRemaining: body.count(),
		ID:                  id,
		UserID:              uid,
	}); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not update todo")
		return
	}
	t.RecurrenceUntil, t.RecurrenceRemaining = body.until(), body.count()

	if err := writeRecurrenceDays(r.Context(), qtx, id, body.weekdays()); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not update todo")
		return
	}

	switch {
	case before.Status == statusOpen && t.Status == statusDone && t.RecurrenceFreq.Valid:
		err = spawnNextOccurrence(r.Context(), qtx, t, body.weekdays(), time.Now())
	case before.Status == statusDone && t.Status == statusOpen:
		// undo — take back the successor this occurrence created
		err = dropSpawnedOccurrence(r.Context(), qtx, t.ID, uid)
	}
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not update todo")
		return
	}

	if err := tx.Commit(); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not update todo")
		return
	}
	out := toTodoResponse(t)
	if out.Recurrence != nil {
		out.Recurrence.Weekdays = body.weekdays()
	}
	httputil.JSON(w, http.StatusOK, out)
}

// spawnNextOccurrence creates the follow-up for a recurring todo that was just
// checked done. The completed row stays as it is — it is the history of that
// occurrence — and the successor inherits everything that describes the task
// (project, notes, priority, estimate, tags and the rule itself), with the
// deadline moved on by one interval.
//
// A task without a deadline repeats relative to the moment it was finished,
// which is the only meaningful anchor it has.
// A series can also end: on a date (`recurrence_until`) or after a number of
// further occurrences (`recurrence_remaining`, counted down on every spawn).
// When it ends, completing the task is simply the end of it.
func spawnNextOccurrence(ctx context.Context, q *db.Queries, done db.Todo, weekdays []int32, now time.Time) error {
	rule := recurrenceRule{
		Freq:     done.RecurrenceFreq.String,
		Interval: done.RecurrenceInterval,
		Weekdays: weekdays,
	}
	base := now
	if done.DueAt.Valid {
		base = done.DueAt.Time
	}
	due := nextDue(base, rule, now)

	// "no occurrences left" and "past the end date" both mean this was the last one
	if done.RecurrenceRemaining.Valid && done.RecurrenceRemaining.Int32 <= 0 {
		return nil
	}
	if done.RecurrenceUntil.Valid && due.After(done.RecurrenceUntil.Time) {
		return nil
	}

	remaining := done.RecurrenceRemaining
	if remaining.Valid {
		remaining.Int32--
	}

	next, err := q.CreateTodo(ctx, db.CreateTodoParams{
		UserID:              done.UserID,
		ProjectID:           done.ProjectID,
		Title:               done.Title,
		Notes:               done.Notes,
		Priority:            done.Priority,
		Status:              statusOpen,
		DueAt:               sql.NullTime{Time: due, Valid: true},
		EstimateMinutes:     done.EstimateMinutes,
		RecurrenceFreq:      done.RecurrenceFreq,
		RecurrenceInterval:  done.RecurrenceInterval,
		RecurrenceUntil:     done.RecurrenceUntil,
		RecurrenceRemaining: remaining,
		SpawnedFromID:       sql.NullInt64{Int64: done.ID, Valid: true},
	})
	if err != nil {
		return err
	}
	if err := q.CopyRecurrenceDays(ctx, db.CopyRecurrenceDaysParams{SrcTodoID: done.ID, DstTodoID: next.ID}); err != nil {
		return err
	}
	return q.CopyTodoTags(ctx, db.CopyTodoTagsParams{SrcTodoID: done.ID, DstTodoID: next.ID})
}

// dropSpawnedOccurrence removes the successor a recurring todo created when it
// was checked done — the undo path, so a mis-click doesn't leave a phantom task
// behind. Only an untouched successor goes: once the user has done anything with
// it (finished it, and with that spawned one of its own), it is theirs to keep.
func dropSpawnedOccurrence(ctx context.Context, q *db.Queries, parentID, uid int64) error {
	child, err := q.GetSpawnedTodo(ctx, db.GetSpawnedTodoParams{
		SpawnedFromID: sql.NullInt64{Int64: parentID, Valid: true},
		UserID:        uid,
	})
	if errors.Is(err, sql.ErrNoRows) {
		return nil // not a recurring occurrence, or it never spawned one
	}
	if err != nil {
		return err
	}
	if child.Status != statusOpen {
		return nil
	}
	return q.DeleteTodo(ctx, db.DeleteTodoParams{ID: child.ID, UserID: uid})
}

// deleteTodo removes a todo. Like projects, deletes are idempotent (204).
func (m *Module) deleteTodo(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	if err := m.q.DeleteTodo(r.Context(), db.DeleteTodoParams{ID: id, UserID: userID(r)}); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not delete todo")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// reorderRequest is the body for the reorder endpoint: the user's todo ids in
// the exact order they should take in the custom view.
type reorderRequest struct {
	IDs []int64 `json:"ids"`
}

// reorderTodos rewrites the manual "custom" order. It assigns position 0..N-1 to
// the given ids, in order, inside a single transaction so the list never ends up
// half-renumbered. Every id is scoped to the user; an id that isn't theirs (or
// doesn't exist) touches no rows and yields a 404 with the whole change rolled
// back. Duplicate ids are rejected up front.
func (m *Module) reorderTodos(w http.ResponseWriter, r *http.Request) {
	var body reorderRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	if len(body.IDs) == 0 {
		httputil.Error(w, http.StatusBadRequest, "validation", "ids is required")
		return
	}
	seen := make(map[int64]struct{}, len(body.IDs))
	for _, id := range body.IDs {
		if _, dup := seen[id]; dup {
			httputil.Error(w, http.StatusBadRequest, "validation", "ids must be unique")
			return
		}
		seen[id] = struct{}{}
	}

	uid := userID(r)
	tx, err := m.db.BeginTx(r.Context(), nil)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not reorder todos")
		return
	}
	defer tx.Rollback() // no-op once committed

	qtx := m.q.WithTx(tx)
	for i, id := range body.IDs {
		n, err := qtx.SetTodoPosition(r.Context(), db.SetTodoPositionParams{
			Position: int64(i),
			ID:       id,
			UserID:   uid,
		})
		if err != nil {
			httputil.Error(w, http.StatusInternalServerError, "db_error", "could not reorder todos")
			return
		}
		if n == 0 {
			// Not the user's todo (or gone) — reject the whole batch.
			httputil.Error(w, http.StatusNotFound, "not_found", "todo not found")
			return
		}
	}
	if err := tx.Commit(); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "db_error", "could not reorder todos")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// writeProjectCheckError turns an ensureProjectOwned error into the right HTTP
// response: a 400 for an unknown project, a 500 for anything unexpected.
func writeProjectCheckError(w http.ResponseWriter, err error) {
	if errors.Is(err, errProjectNotFound) {
		httputil.Error(w, http.StatusBadRequest, "validation", "project not found")
		return
	}
	httputil.Error(w, http.StatusInternalServerError, "db_error", "could not verify project")
}

// --- null <-> pointer helpers ---------------------------------------------

func nullInt64(p *int64) sql.NullInt64 {
	if p == nil {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: *p, Valid: true}
}

func nullInt32(p *int32) sql.NullInt32 {
	if p == nil {
		return sql.NullInt32{}
	}
	return sql.NullInt32{Int32: *p, Valid: true}
}

func nullTime(p *time.Time) sql.NullTime {
	if p == nil {
		return sql.NullTime{}
	}
	return sql.NullTime{Time: *p, Valid: true}
}

func int64Ptr(n sql.NullInt64) *int64 {
	if !n.Valid {
		return nil
	}
	v := n.Int64
	return &v
}

func int32Ptr(n sql.NullInt32) *int32 {
	if !n.Valid {
		return nil
	}
	v := n.Int32
	return &v
}

func timePtr(n sql.NullTime) *time.Time {
	if !n.Valid {
		return nil
	}
	t := n.Time
	return &t
}
