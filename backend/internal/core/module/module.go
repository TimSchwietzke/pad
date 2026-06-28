// Package module defines the contract every feature module implements and the
// core dependencies the registry injects into them.
package module

import (
	"github.com/go-chi/chi/v5"

	"github.com/TimSchwietzke/pad/backend/internal/core/auth"
	"github.com/TimSchwietzke/pad/backend/internal/core/config"
)

// Deps are the core services handed to every module. It grows over the slices:
// DB, Relations, Notify and the job scheduler join it as those land (Slice 1+).
type Deps struct {
	Config config.Config
	Auth   auth.Service
}

// Module is a self-contained feature. The registry calls RegisterRoutes for
// each enabled module; not registering a module removes it cleanly.
//
// The interface will grow with Migrations() and Jobs() once storage and the
// scheduler exist — modules stay decoupled behind this single contract.
type Module interface {
	Name() string
	RegisterRoutes(r chi.Router, deps Deps)
}
