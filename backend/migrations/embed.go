// Package migrations embeds the SQL migration files so they ship inside the
// binary and are applied at startup.
package migrations

import "embed"

// FS holds the goose migration files (NNNNN_name.sql) for storage.Migrate.
//
//go:embed *.sql
var FS embed.FS
