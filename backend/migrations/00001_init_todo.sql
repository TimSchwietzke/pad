-- +goose Up
-- ToDo module schema (PostgreSQL). Everything is scoped by user_id from day one
-- so multi-user is a drop-in later; timestamps are TIMESTAMPTZ.

CREATE TABLE todo_projects (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT      NOT NULL,
    name       TEXT        NOT NULL,
    color      TEXT        NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE todos (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT      NOT NULL,
    project_id BIGINT      REFERENCES todo_projects(id) ON DELETE SET NULL,
    title      TEXT        NOT NULL,
    notes      TEXT        NOT NULL DEFAULT '',
    priority   INTEGER     NOT NULL DEFAULT 0,      -- 0=none, 1=low, 2=medium, 3=high
    status     TEXT        NOT NULL DEFAULT 'open', -- open | done
    due_at     TIMESTAMPTZ,                         -- nullable
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE todo_tags (
    id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL,
    name    TEXT   NOT NULL
);

CREATE TABLE todo_tag_map (
    todo_id BIGINT NOT NULL REFERENCES todos(id)     ON DELETE CASCADE,
    tag_id  BIGINT NOT NULL REFERENCES todo_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (todo_id, tag_id)
);

CREATE INDEX idx_todos_user    ON todos(user_id);
CREATE INDEX idx_projects_user ON todo_projects(user_id);
CREATE INDEX idx_tags_user     ON todo_tags(user_id);

-- +goose Down
DROP TABLE todo_tag_map;
DROP TABLE todo_tags;
DROP TABLE todos;
DROP TABLE todo_projects;
