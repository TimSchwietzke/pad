-- Projects -----------------------------------------------------------------

-- name: CreateProject :one
INSERT INTO todo_projects (user_id, name, color)
VALUES ($1, $2, $3)
RETURNING *;

-- name: ListProjects :many
SELECT * FROM todo_projects
WHERE user_id = $1
ORDER BY name;

-- name: GetProject :one
SELECT * FROM todo_projects
WHERE id = $1 AND user_id = $2;

-- name: UpdateProject :one
UPDATE todo_projects
SET name = $1, color = $2, updated_at = now()
WHERE id = $3 AND user_id = $4
RETURNING *;

-- name: DeleteProject :exec
DELETE FROM todo_projects
WHERE id = $1 AND user_id = $2;

-- Todos --------------------------------------------------------------------

-- name: CreateTodo :one
-- New todos append to the end of the user's custom order (max position + 1).
INSERT INTO todos (user_id, project_id, title, notes, priority, status, due_at, estimate_minutes,
                   recurrence_freq, recurrence_interval, recurrence_until, recurrence_remaining,
                   spawned_from_id, position)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        COALESCE((SELECT MAX(position) + 1 FROM todos WHERE user_id = $1), 0))
RETURNING *;

-- name: GetTodo :one
SELECT * FROM todos
WHERE id = $1 AND user_id = $2;

-- The todo list is sorted dynamically in Go (a whitelisted ORDER BY), so there
-- is no fixed ListTodos query here.

-- name: UpdateTodo :one
UPDATE todos
SET project_id = $1, title = $2, notes = $3, priority = $4, status = $5, due_at = $6, estimate_minutes = $7,
    recurrence_freq = $8, recurrence_interval = $9, updated_at = now()
WHERE id = $10 AND user_id = $11
RETURNING *;

-- name: SetTodoRecurrenceEnd :exec
-- The two end-of-series columns move separately from the rest of the update, so
-- the handler can leave them alone when a request doesn't carry a rule at all.
UPDATE todos
SET recurrence_until = $1, recurrence_remaining = $2, updated_at = now()
WHERE id = $3 AND user_id = $4;

-- Recurrence weekdays ------------------------------------------------------

-- name: AddRecurrenceDay :exec
INSERT INTO todo_recurrence_days (todo_id, weekday)
VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: ClearRecurrenceDays :exec
DELETE FROM todo_recurrence_days WHERE todo_id = $1;

-- name: ListRecurrenceDaysForTodo :many
SELECT weekday FROM todo_recurrence_days
WHERE todo_id = $1
ORDER BY weekday;

-- name: ListRecurrenceDaysForUserTodos :many
-- Every (todo, weekday) pair for the user, so the list endpoint can embed the
-- weekday rules in one round-trip instead of a query per row — the same shape
-- ListTagsForUserTodos uses.
SELECT d.todo_id, d.weekday FROM todo_recurrence_days d
JOIN todos t ON t.id = d.todo_id
WHERE t.user_id = $1
ORDER BY d.todo_id, d.weekday;

-- name: CopyRecurrenceDays :exec
-- Carries the weekday rule over to a spawned occurrence.
INSERT INTO todo_recurrence_days (todo_id, weekday)
SELECT sqlc.arg(dst_todo_id), d.weekday FROM todo_recurrence_days d WHERE d.todo_id = sqlc.arg(src_todo_id)
ON CONFLICT DO NOTHING;

-- name: GetSpawnedTodo :one
-- The successor a recurring occurrence created when it was checked done. Used to
-- take it back when the user un-checks the parent within the undo window.
SELECT * FROM todos
WHERE spawned_from_id = $1 AND user_id = $2
ORDER BY id DESC
LIMIT 1;

-- name: CopyTodoTags :exec
-- Carries the tags of one todo over to another — a spawned occurrence should look
-- exactly like the one it replaces.
INSERT INTO todo_tag_map (todo_id, tag_id)
SELECT sqlc.arg(dst_todo_id), m.tag_id FROM todo_tag_map m WHERE m.todo_id = sqlc.arg(src_todo_id)
ON CONFLICT DO NOTHING;

-- name: DeleteTodo :exec
DELETE FROM todos
WHERE id = $1 AND user_id = $2;

-- name: SetTodoPosition :execrows
-- Used by the reorder endpoint inside a transaction. Scoped by user_id, so a
-- foreign id touches no rows (the handler treats 0 affected rows as not-owned).
UPDATE todos
SET position = $1, updated_at = now()
WHERE id = $2 AND user_id = $3;

-- Tags ---------------------------------------------------------------------

-- name: CreateTag :one
INSERT INTO todo_tags (user_id, name)
VALUES ($1, $2)
RETURNING *;

-- name: ListTags :many
SELECT * FROM todo_tags
WHERE user_id = $1
ORDER BY name;

-- name: GetTag :one
SELECT * FROM todo_tags
WHERE id = $1 AND user_id = $2;

-- name: DeleteTag :exec
DELETE FROM todo_tags
WHERE id = $1 AND user_id = $2;

-- name: AddTagToTodo :exec
INSERT INTO todo_tag_map (todo_id, tag_id)
VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: RemoveTagFromTodo :exec
DELETE FROM todo_tag_map
WHERE todo_id = $1 AND tag_id = $2;

-- name: ListTagsForTodo :many
SELECT t.* FROM todo_tags t
JOIN todo_tag_map m ON m.tag_id = t.id
WHERE m.todo_id = $1
ORDER BY t.name;

-- name: ListTagsForUserTodos :many
-- Every (todo, tag) link for the user, so the todo list can embed tags in one round-trip.
SELECT m.todo_id, t.id, t.name FROM todo_tags t
JOIN todo_tag_map m ON m.tag_id = t.id
WHERE t.user_id = $1
ORDER BY m.todo_id, t.name;
