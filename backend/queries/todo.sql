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
INSERT INTO todos (user_id, project_id, title, notes, priority, status, due_at)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: GetTodo :one
SELECT * FROM todos
WHERE id = $1 AND user_id = $2;

-- name: ListTodos :many
SELECT * FROM todos
WHERE user_id = $1
ORDER BY (due_at IS NULL), due_at, priority DESC, id;

-- name: UpdateTodo :one
UPDATE todos
SET project_id = $1, title = $2, notes = $3, priority = $4, status = $5, due_at = $6, updated_at = now()
WHERE id = $7 AND user_id = $8
RETURNING *;

-- name: DeleteTodo :exec
DELETE FROM todos
WHERE id = $1 AND user_id = $2;

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
