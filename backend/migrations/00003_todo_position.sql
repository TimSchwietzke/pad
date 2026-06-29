-- +goose Up
-- Stable per-user ordering for the "custom" sort mode (drag-to-reorder). New
-- todos append to the end (see CreateTodo); the reorder endpoint rewrites these.
ALTER TABLE todos ADD COLUMN position BIGINT NOT NULL DEFAULT 0;

-- Seed existing rows so the current order is deterministic per user (by id),
-- instead of everyone sharing position 0.
WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY id) - 1 AS pos
    FROM todos
)
UPDATE todos t SET position = o.pos FROM ordered o WHERE o.id = t.id;

-- +goose Down
ALTER TABLE todos DROP COLUMN position;
