// Package config loads and validates runtime configuration from the environment.
package config

import (
	"fmt"
	"log"
	"net"
	"os"
	"strings"
)

// AuthMode selects how requests are authenticated.
type AuthMode string

const (
	// AuthNone injects a fixed default user. Local development ONLY.
	AuthNone AuthMode = "none"
	// AuthOAuth uses Google OAuth (login + Calendar/Gmail consent). Not yet implemented.
	AuthOAuth AuthMode = "oauth"
)

// Config is the resolved runtime configuration.
type Config struct {
	Host     string
	Port     string
	AuthMode AuthMode
}

// Load reads configuration from the environment, applying safe defaults.
func Load() Config {
	return Config{
		Host:     getenv("PAD_HOST", "127.0.0.1"),
		Port:     getenv("PAD_PORT", "8080"),
		AuthMode: AuthMode(getenv("AUTH_MODE", string(AuthNone))),
	}
}

// Addr returns the host:port the server binds to.
func (c Config) Addr() string {
	return net.JoinHostPort(c.Host, c.Port)
}

// Validate rejects unknown modes and enforces the bind guard from SECURITY.md:
// the server may only bind beyond loopback when real auth is active.
func (c Config) Validate() error {
	switch c.AuthMode {
	case AuthNone, AuthOAuth:
	default:
		return fmt.Errorf("unknown AUTH_MODE %q (want none|oauth)", c.AuthMode)
	}
	if c.AuthMode == AuthNone && !isLoopback(c.Host) {
		return fmt.Errorf(
			"refusing to bind %s with AUTH_MODE=none: set AUTH_MODE=oauth or bind 127.0.0.1 (see SECURITY.md)",
			c.Host,
		)
	}
	return nil
}

// WarnIfInsecure prints a loud banner whenever auth is disabled.
func (c Config) WarnIfInsecure() {
	if c.AuthMode != AuthNone {
		return
	}
	bar := strings.Repeat("!", 72)
	log.Println(bar)
	log.Println("!!  AUTH_MODE=none — NO AUTHENTICATION. Local development only.")
	log.Println("!!  Do NOT host, expose, or publish pad in this mode. See SECURITY.md.")
	log.Println(bar)
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
