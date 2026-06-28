// Command pad starts the PAD backend HTTP server.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/TimSchwietzke/pad/backend/internal/core/auth"
	"github.com/TimSchwietzke/pad/backend/internal/core/config"
	"github.com/TimSchwietzke/pad/backend/internal/core/module"
	"github.com/TimSchwietzke/pad/backend/internal/modules/health"
)

func main() {
	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		log.Fatalf("invalid configuration: %v", err)
	}
	cfg.WarnIfInsecure()

	authSvc := auth.New(cfg.AuthMode)
	deps := module.Deps{Config: cfg, Auth: authSvc}

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	// Every /api route sits behind the auth boundary.
	r.Route("/api", func(api chi.Router) {
		api.Use(authSvc.Middleware)

		// Module registry: enable a module by adding it here. Disabling or
		// swapping a module is a one-line change and touches nothing else.
		modules := []module.Module{
			health.New(),
		}
		for _, m := range modules {
			m.RegisterRoutes(api, deps)
			log.Printf("module registered: %s", m.Name())
		}
	})

	srv := &http.Server{
		Addr:              cfg.Addr(),
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("pad backend listening on http://%s (auth=%s)", cfg.Addr(), cfg.AuthMode)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}
	log.Println("pad backend stopped")
}
