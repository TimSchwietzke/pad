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
	"github.com/joho/godotenv"

	"github.com/TimSchwietzke/pad/backend/internal/core/auth"
	"github.com/TimSchwietzke/pad/backend/internal/core/config"
	"github.com/TimSchwietzke/pad/backend/internal/core/logging"
	"github.com/TimSchwietzke/pad/backend/internal/core/module"
	"github.com/TimSchwietzke/pad/backend/internal/core/storage"
	"github.com/TimSchwietzke/pad/backend/internal/modules/health"
	"github.com/TimSchwietzke/pad/backend/internal/modules/todo"
)

func main() {
	// Load .env if present — local-dev convenience. In production the real
	// environment already carries these values, so a missing file isn't an error.
	_ = godotenv.Load()

	cfg := config.Load()

	// Logging first, so even a config error below is reported structured.
	logging.Setup(cfg)

	if err := cfg.Validate(); err != nil {
		slog.Error("invalid configuration", slog.Any("err", err))
		os.Exit(1)
	}
	cfg.WarnIfInsecure()

	if cfg.DatabaseURL == "" {
		slog.Error("DATABASE_URL is required (see backend/.env.example)")
		os.Exit(1)
	}
	database, err := storage.Open(cfg.DatabaseURL)
	if err != nil {
		slog.Error("database connection failed", slog.Any("err", err))
		os.Exit(1)
	}
	defer database.Close()
	if err := storage.Migrate(database); err != nil {
		slog.Error("migrations failed", slog.Any("err", err))
		os.Exit(1)
	}
	slog.Info("database ready")

	authSvc := auth.New(cfg.AuthMode)
	deps := module.Deps{Config: cfg, Auth: authSvc, DB: database}

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

		// Module registry: enable a module by adding it here.
		modules := []module.Module{
			health.New(),
			todo.New(),
		}
		for _, mod := range modules {
			mod.RegisterRoutes(api, deps)
			slog.Info("module registered", slog.String("module", mod.Name()))
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
