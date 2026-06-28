package todo

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/TimSchwietzke/pad/backend/internal/core/auth"
	"github.com/TimSchwietzke/pad/backend/internal/core/config"
	"github.com/TimSchwietzke/pad/backend/internal/core/module"
	"github.com/TimSchwietzke/pad/backend/internal/core/storage"
)

// testDB is the shared connection to the test database. It stays nil when
// TEST_DATABASE_URL isn't set, in which case the integration tests skip.
var testDB *sql.DB

// TestMain opens and migrates the test database once for the whole package.
func TestMain(m *testing.M) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		os.Exit(m.Run()) // no DB configured -> tests below skip
	}

	d, err := storage.Open(url)
	if err != nil {
		log.Fatalf("open test db: %v", err)
	}
	if err := storage.Migrate(d); err != nil {
		log.Fatalf("migrate test db: %v", err)
	}
	testDB = d

	code := m.Run()
	_ = d.Close()
	os.Exit(code)
}

// newTestServer wipes the ToDo tables and returns a router wired exactly like
// production: behind the auth boundary, with the todo module mounted.
func newTestServer(t *testing.T) http.Handler {
	t.Helper()
	if testDB == nil {
		t.Skip("TEST_DATABASE_URL not set")
	}
	if _, err := testDB.Exec("TRUNCATE todo_tag_map, todo_tags, todos, todo_projects RESTART IDENTITY CASCADE"); err != nil {
		t.Fatalf("reset tables: %v", err)
	}

	authSvc := auth.New(config.AuthNone)
	r := chi.NewRouter()
	r.Route("/api", func(api chi.Router) {
		api.Use(authSvc.Middleware)
		New().RegisterRoutes(api, module.Deps{Auth: authSvc, DB: testDB})
	})
	return r
}

// do fires a request at the handler and returns the recorder.
func do(t *testing.T, h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	var req *http.Request
	if body == "" {
		req = httptest.NewRequest(method, path, nil)
	} else {
		req = httptest.NewRequest(method, path, strings.NewReader(body))
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

// TestProjectsCRUD walks a project through create, list, update, delete and the
// 404 after deletion — the full happy path against real PostgreSQL.
func TestProjectsCRUD(t *testing.T) {
	srv := newTestServer(t)

	rec := do(t, srv, http.MethodPost, "/api/todo/projects", `{"name":"Inbox","color":"#fff"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: status=%d body=%s", rec.Code, rec.Body)
	}
	var created projectResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode created: %v", err)
	}
	if created.ID == 0 || created.Name != "Inbox" || created.Color != "#fff" {
		t.Fatalf("unexpected created project: %+v", created)
	}

	rec = do(t, srv, http.MethodGet, "/api/todo/projects", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("list: status=%d", rec.Code)
	}
	var list []projectResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if len(list) != 1 || list[0].Name != "Inbox" {
		t.Fatalf("unexpected list: %+v", list)
	}

	rec = do(t, srv, http.MethodPut, fmt.Sprintf("/api/todo/projects/%d", created.ID), `{"name":"Work"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("update: status=%d body=%s", rec.Code, rec.Body)
	}
	var updated projectResponse
	_ = json.Unmarshal(rec.Body.Bytes(), &updated)
	if updated.Name != "Work" {
		t.Fatalf("update: name=%q, want Work", updated.Name)
	}

	rec = do(t, srv, http.MethodDelete, fmt.Sprintf("/api/todo/projects/%d", created.ID), "")
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete: status=%d", rec.Code)
	}

	rec = do(t, srv, http.MethodGet, fmt.Sprintf("/api/todo/projects/%d", created.ID), "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("get after delete: status=%d, want 404", rec.Code)
	}
}

// TestCreateProjectValidation rejects a blank name with 400.
func TestCreateProjectValidation(t *testing.T) {
	srv := newTestServer(t)

	rec := do(t, srv, http.MethodPost, "/api/todo/projects", `{"name":"   "}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status=%d, want 400", rec.Code)
	}
}

// TestGetProjectNotFound returns 404 for an id that doesn't exist.
func TestGetProjectNotFound(t *testing.T) {
	srv := newTestServer(t)

	rec := do(t, srv, http.MethodGet, "/api/todo/projects/9999", "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status=%d, want 404", rec.Code)
	}
}
