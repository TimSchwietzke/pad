// Package logging configures the application's structured logger (slog) and the
// HTTP request-logging middleware.
package logging

import (
	"log/slog"
	"os"

	"github.com/TimSchwietzke/pad/backend/internal/core/config"
)

// Setup builds the structured logger for the configured format and installs it
// as the slog default, so any package can log through slog.Info/Warn/Error
// without being handed a logger explicitly.
//
// cfg supplies the format: text for readable local-dev output, json for one
// JSON object per line when hosted (and for later analysis with Python).
// It returns the logger in case a caller wants to keep an explicit reference.
func Setup(cfg config.Config) *slog.Logger {
	opts := &slog.HandlerOptions{Level: slog.LevelInfo}

	var handler slog.Handler
	switch cfg.LogFormat {
	case config.LogJSON:
		handler = slog.NewJSONHandler(os.Stdout, opts)
	default:
		// Text is the fallback. Config.Validate already rejects unknown formats,
		// so in practice we only land here for LogText.
		handler = slog.NewTextHandler(os.Stdout, opts)
	}

	logger := slog.New(handler)
	slog.SetDefault(logger)
	return logger
}
