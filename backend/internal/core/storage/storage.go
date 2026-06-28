// Package storage connects to PostgreSQL and applies schema migrations.
package storage

import (
	"database/sql"
	"fmt"

	_ "github.com/jackc/pgx/v5/stdlib" // registers the "pgx" database/sql driver
	"github.com/pressly/goose/v3"

	"github.com/TimSchwietzke/pad/backend/migrations"
)

// Open connects to PostgreSQL using a libpq-style URL (postgres://user:pass@host:port/db).
// It pings once so a bad URL or down server fails fast at startup rather than on
// the first query.
//
// databaseURL is the full connection string (from DATABASE_URL).
// It returns the open *sql.DB, or an error if the database can't be reached.
func Open(databaseURL string) (*sql.DB, error) {
	database, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("open postgres: %w", err)
	}
	if err := database.Ping(); err != nil {
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	return database, nil
}

// Migrate applies all pending migrations embedded in the migrations package,
// bringing the schema up to the latest version. It is safe to call on every
// startup; already-applied migrations are skipped.
func Migrate(database *sql.DB) error {
	goose.SetBaseFS(migrations.FS)
	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("set goose dialect: %w", err)
	}
	if err := goose.Up(database, "."); err != nil {
		return fmt.Errorf("run migrations: %w", err)
	}
	return nil
}
