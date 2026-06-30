// Package config loads and validates runtime configuration from the environment.
package config

import (
	"fmt"
	"log/slog"
	"net"
	"os"
	"strconv"
)

// AuthMode selects how requests are authenticated.
type AuthMode string

const (
	// AuthNone injects a fixed default user. Local development ONLY.
	AuthNone AuthMode = "none"
	// AuthOAuth uses Google OAuth (login + Calendar/Gmail consent). Not yet implemented.
	AuthOAuth AuthMode = "oauth"
)

// LogFormat selects how log lines are rendered.
type LogFormat string

const (
	// LogText is human-readable output, meant for local development.
	LogText LogFormat = "text"
	// LogJSON is one JSON object per line, meant for hosting and later analysis.
	LogJSON LogFormat = "json"
)

// Config is the resolved runtime configuration.
type Config struct {
	Host        string
	Port        string
	AuthMode    AuthMode
	LogFormat   LogFormat
	DatabaseURL string
	// AllowNonloopbackBind opts out of the loopback-only bind guard while
	// AUTH_MODE=none. It exists for running inside a container, where the process
	// must bind 0.0.0.0 but the published port is meant to be kept on the host's
	// loopback (see docker-compose.yml + SECURITY.md). Off by default.
	AllowNonloopbackBind bool
}

// Load reads configuration from the environment, applying safe defaults.
func Load() Config {
	return Config{
		Host:                 getenv("PAD_HOST", "127.0.0.1"),
		Port:                 getenv("PAD_PORT", "8080"),
		AuthMode:             AuthMode(getenv("AUTH_MODE", string(AuthNone))),
		LogFormat:            LogFormat(getenv("PAD_LOG_FORMAT", string(LogText))),
		DatabaseURL:          getenv("DATABASE_URL", ""),
		AllowNonloopbackBind: getenvBool("PAD_ALLOW_NONLOOPBACK_BIND", false),
	}
}

// Addr returns the host:port the server binds to.
func (c Config) Addr() string {
	return net.JoinHostPort(c.Host, c.Port)
}

// Validate rejects unknown values and enforces the bind guard from SECURITY.md:
// the server may only bind beyond loopback when real auth is active.
func (c Config) Validate() error {
	switch c.AuthMode {
	case AuthNone, AuthOAuth:
	default:
		return fmt.Errorf("unknown AUTH_MODE %q (want none|oauth)", c.AuthMode)
	}
	switch c.LogFormat {
	case LogText, LogJSON:
	default:
		return fmt.Errorf("unknown PAD_LOG_FORMAT %q (want text|json)", c.LogFormat)
	}
	if c.AuthMode == AuthNone && !isLoopback(c.Host) && !c.AllowNonloopbackBind {
		return fmt.Errorf(
			"refusing to bind %s with AUTH_MODE=none: set AUTH_MODE=oauth, bind 127.0.0.1, or "+
				"(container only, loopback-published) PAD_ALLOW_NONLOOPBACK_BIND=1 (see SECURITY.md)",
			c.Host,
		)
	}
	return nil
}

// WarnIfInsecure emits a WARN log whenever auth is disabled. Structured logging
// replaced the old ASCII banner: a WARN line is just as impossible to miss in
// the dev text output and stays machine-filterable once we ship JSON.
func (c Config) WarnIfInsecure() {
	if c.AuthMode != AuthNone {
		return
	}
	slog.Warn("authentication disabled — local development only, do not expose (see SECURITY.md)",
		slog.String("auth_mode", string(c.AuthMode)))
	if c.AllowNonloopbackBind && !isLoopback(c.Host) {
		slog.Warn("bind guard overridden (PAD_ALLOW_NONLOOPBACK_BIND) — only safe if the published port stays on the host loopback",
			slog.String("host", c.Host))
	}
}

func isLoopback(host string) bool {
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func getenv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

// getenvBool parses a boolean env var (1/0, t/f, true/false). An unset, empty or
// unparseable value falls back to the default.
func getenvBool(key string, fallback bool) bool {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return fallback
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return b
}
