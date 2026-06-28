// Package auth provides the request auth boundary and current-user resolution.
package auth

import (
	"context"
	"net/http"

	"github.com/TimSchwietzke/pad/backend/internal/core/config"
)

// User is the authenticated principal carried on every request context.
type User struct {
	ID    int64
	Email string
}

type ctxKey struct{}

// Service guards requests and attaches the current user to the context.
type Service interface {
	Middleware(next http.Handler) http.Handler
}

// New returns the Service for the configured auth mode.
func New(mode config.AuthMode) Service {
	switch mode {
	case config.AuthOAuth:
		return notImplementedService{}
	default:
		return noneService{}
	}
}

// defaultUser is injected in AUTH_MODE=none. DEV ONLY.
var defaultUser = User{ID: 1, Email: "local@pad"}

// noneService injects a fixed default user without authentication.
type noneService struct{}

func (noneService) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := context.WithValue(r.Context(), ctxKey{}, defaultUser)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// notImplementedService rejects all requests until OAuth lands.
type notImplementedService struct{}

func (notImplementedService) Middleware(http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "auth mode not implemented yet", http.StatusNotImplemented)
	})
}

// FromContext returns the authenticated user for the request, if present.
func FromContext(ctx context.Context) (User, bool) {
	u, ok := ctx.Value(ctxKey{}).(User)
	return u, ok
}
