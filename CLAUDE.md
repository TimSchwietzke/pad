# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

pad is a personal-assistant dashboard. Monorepo: `backend/` (Go) and `frontend/` (React + Vite). See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design, [DESIGN.md](DESIGN.md) for theming/UI, [SECURITY.md](SECURITY.md) for the auth/network rules.

## Commands

Use `go -C backend …` so the commands work regardless of the current directory. On Windows, Go may not be on the Git Bash PATH — prepend `C:\Program Files\Go\bin` (and `~/go/bin` for `sqlc`) or run from PowerShell.

**Backend (Go 1.26):**
- Run: `go -C backend run ./cmd/pad` — needs `DATABASE_URL`, loads `backend/.env`, runs migrations on start, listens on `:8080`
- Build / vet: `go -C backend build ./...` · `go -C backend vet ./...`
- Test (all): `go -C backend test ./...`
- Test one package: `go -C backend test ./internal/modules/todo/...`
- Test one test: `go -C backend test ./internal/modules/todo/ -run TestTodosSorting`
- Regenerate the typed query layer after editing SQL: run `sqlc generate` from `backend/`
- Migrations are goose files in `backend/migrations/`, embedded and applied automatically on startup (and in test setup)

**Frontend (Node 22):**
- Dev: `npm --prefix frontend run dev` — Vite, proxies `/api` to the backend on `:8080`
- Build (also typechecks): `npm --prefix frontend run build`

**Database:** PostgreSQL. A `pad` role plus `pad` and `pad_test` databases must exist; connection strings live in `backend/.env` (gitignored) as `DATABASE_URL` and `TEST_DATABASE_URL`. Integration tests **skip** unless `TEST_DATABASE_URL` is set and Postgres is reachable.

## Architecture

**Backend is a modular monolith.** `cmd/pad/main.go` loads config, brings up logging, opens the DB + migrates, then mounts modules. Everything under `/api` sits behind the auth boundary.

- **Module registry** (`internal/core/module`): each feature implements `module.Module` (`Name`, `RegisterRoutes`). Enable a module by adding it to the slice in `main.go`; removing or swapping one touches nothing else. Modules receive `module.Deps` (Config, Auth, `*sql.DB`).
- **Auth boundary** (`internal/core/auth`): middleware on every `/api` route attaches the current user to the context. `AUTH_MODE=none` (dev) injects a fixed default user and logs a loud WARN; `config.Validate` refuses to bind beyond loopback in that mode (see SECURITY.md). OAuth is planned, not implemented.
- **Core services** (`internal/core`): `config` (env + `.env`), `logging` (slog; `PAD_LOG_FORMAT=text|json`; plus a request-logging middleware mounted after auth so each line carries `user_id`), `storage` (opens Postgres via the `pgx` stdlib driver, runs goose migrations), `httputil` (JSON + the `{"error":{code,message}}` envelope).
- **Data access:** `sqlc` generates `internal/db` from `backend/queries/*.sql`; the schema source is the goose migrations. The one deliberate exception is the todo list's dynamic `ORDER BY` (`internal/modules/todo/sort.go`): sqlc can't parameterize `ORDER BY`, so that query is hand-written with a column **whitelist** (safe from injection).
- **Handlers** map DB rows to response DTOs so `sql.Null*` wrappers and internal columns (like `user_id`) never leak. Every query is scoped by `user_id`, and cross-user references are checked explicitly (e.g. `ensureProjectOwned`, `ensureTodoOwned`/`ensureTagOwned`) because foreign keys alone don't enforce ownership.

**Frontend is a token-themed SPA.** Theming is two-dimensional: `data-preset` (`standard` | `google`) × `data-mode` (`light` | `dark`) attributes on `<html>` drive CSS variables in `src/styles/tokens.scss`. Components read only those variables, never hardcoded colors — adding a theme is a token set, not component changes. The `impeccable` design skill reads `PRODUCT.md` + `DESIGN.md` before any UI work.

## Conventions

- **GitHub Flow:** never commit to `main`. Feature branch → PR → merge. Scoped, conventional-commit-style messages. **Do not add `Co-Authored-By` trailers.** `gh` is not installed, so provide the compare/PR URL instead of opening PRs from the CLI.
- **Comment while writing:** doc blocks (Go doc comments / JSDoc with `@param`/`@returns`) plus meaningful inline comments that explain *why*. Write in a natural, human voice — not AI-formulaic.
- **Tests are required** for every feature: real unit *and* integration tests. Integration tests run the full router → auth → sqlc path against real Postgres. GitHub Actions (`.github/workflows/ci.yml`) gates every PR; the backend job spins up a `postgres:18` service.
- **Keep README.md current:** update the **Done** and **WIP / ToDo** sections before each PR.
- The database is **PostgreSQL** (an earlier SQLite plan was dropped) — don't reintroduce SQLite-isms.
- **The schema stays normalized.** This is a hard project standard, not a per-slice judgement call: a multi-valued attribute gets its own table with a composite primary key, never a bitmask, a comma-separated string or an array column. `todo_tag_map` and `todo_recurrence_days` are the pattern to follow. When that costs an extra query for the list endpoint, aggregate it into **one** round-trip (see `ListTagsForUserTodos`) rather than denormalizing.
