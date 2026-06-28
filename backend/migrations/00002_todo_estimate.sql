-- +goose Up
-- Personal effort estimate in minutes (nullable: not every todo has one).
ALTER TABLE todos ADD COLUMN estimate_minutes INTEGER;

-- +goose Down
ALTER TABLE todos DROP COLUMN estimate_minutes;
