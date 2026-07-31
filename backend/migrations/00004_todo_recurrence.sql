-- +goose Up
-- Recurring todos. The repeat rule lives on the task itself rather than in a
-- separate template table: checking a recurring task done keeps that row as the
-- completed occurrence and spawns the next one (see recurrence.go). That way the
-- existing list, sort, grouping and undo behaviour all keep working unchanged,
-- and finished occurrences stay around as history.
ALTER TABLE todos
    ADD COLUMN recurrence_freq TEXT,
    ADD COLUMN recurrence_interval INTEGER NOT NULL DEFAULT 1,
    -- the occurrence this row was spawned from; NULL for hand-made todos. Lets an
    -- undo (done -> open again) find and remove the successor it just created.
    ADD COLUMN spawned_from_id BIGINT REFERENCES todos(id) ON DELETE SET NULL;

ALTER TABLE todos
    ADD CONSTRAINT todos_recurrence_freq_check
        CHECK (recurrence_freq IS NULL OR recurrence_freq IN ('daily', 'weekly', 'monthly', 'yearly')),
    ADD CONSTRAINT todos_recurrence_interval_check
        CHECK (recurrence_interval >= 1);

-- Undo looks the successor up by its parent; without this every uncheck would
-- scan the user's whole todo table.
CREATE INDEX todos_spawned_from_id_idx ON todos (spawned_from_id) WHERE spawned_from_id IS NOT NULL;

-- +goose Down
DROP INDEX todos_spawned_from_id_idx;
ALTER TABLE todos
    DROP CONSTRAINT todos_recurrence_freq_check,
    DROP CONSTRAINT todos_recurrence_interval_check,
    DROP COLUMN spawned_from_id,
    DROP COLUMN recurrence_interval,
    DROP COLUMN recurrence_freq;
