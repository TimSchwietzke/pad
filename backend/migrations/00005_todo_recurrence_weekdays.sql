-- +goose Up
-- Weekday rules ("every mon + thu") and an end to the series.
--
-- The weekdays are a multi-valued attribute, so they get their own table with a
-- composite primary key — the project standard (see CLAUDE.md), the same shape
-- todo_tag_map already uses. A bitmask or a comma-separated column would have
-- saved the join and cost us a schema that can't be queried.
CREATE TABLE todo_recurrence_days (
    todo_id BIGINT   NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
    -- ISO-8601 weekday: 1 = monday … 7 = sunday
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    PRIMARY KEY (todo_id, weekday)
);

-- Where a series stops. Both are single-valued attributes of the task, and they
-- are mutually exclusive: either a date or a number of remaining occurrences.
-- NULL in both means the series runs forever, which is the default.
ALTER TABLE todos
    ADD COLUMN recurrence_until     TIMESTAMPTZ,
    -- counted down on every spawn; at 0 the series is finished
    ADD COLUMN recurrence_remaining INTEGER;

ALTER TABLE todos
    ADD CONSTRAINT todos_recurrence_end_check
        CHECK (recurrence_until IS NULL OR recurrence_remaining IS NULL),
    ADD CONSTRAINT todos_recurrence_remaining_check
        CHECK (recurrence_remaining IS NULL OR recurrence_remaining >= 0);

-- +goose Down
ALTER TABLE todos
    DROP CONSTRAINT todos_recurrence_end_check,
    DROP CONSTRAINT todos_recurrence_remaining_check,
    DROP COLUMN recurrence_remaining,
    DROP COLUMN recurrence_until;
DROP TABLE todo_recurrence_days;
