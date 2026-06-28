// Command pad starts the pad backend HTTP server.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/TimSchwietzke/pad/backend/internal/core/auth"
	"github.com/TimSchwietzke/pad/backend/internal/core/config"
	"github.com/TimSchwietzke/pad/backend/internal/core/logging"
	"github.com/TimSchwietzke/pad/backend/internal/core/module"
	"github.com/TimSchwietzke/pad/backend/internal/modules/health"
)

func main() {
	cfg := config.Load()

	// Bring logging up first so everything below — a config error included — is
	// reported through the structured logger rather than the bare std logger.
	logging.Setup(cfg)

	if err := cfg.Validate(); err != nil {
		slog.Error("invalid configuration", slog.Any("err", err))
		os.Exit(1)
	}
	cfg.WarnIfInsecure()

	authSvc := auth.New(cfg.AuthMode)
	deps := module.Deps{Config: cfg, Auth: authSvc}

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	// Every /api route sits behind the auth boundary.
	r.Route("/api", func(api chi.Router) {
		api.Use(authSvc.Middleware)
		// Request logging runs after auth so each line carries the user id.
		api.Use(logging.RequestLogger)

		// Module registry: enable a module by adding it here. Disabling or
		// swapping a module is a one-line change and touches nothing else.
		modules := []module.Module{
			health.New(),
		}
		for _, m := range modules {
			m.RegisterRoutes(api, deps)
			slog.Info("module registered", slog.String("module", m.Name()))
		}
	})

	srv := &http.Server{
		Addr:              cfg.Addr(),
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		slog.Info("server starting",
			slog.String("addr", cfg.Addr()),
			slog.String("auth_mode", string(cfg.AuthMode)))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server error", slog.Any("err", err))
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("graceful shutdown failed", slog.Any("err", err))
	}
	slog.Info("server stopped")
}
