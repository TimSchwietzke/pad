package config

import "testing"

// TestValidate covers the two guards Validate enforces: known enum values and
// the SECURITY.md bind rule (no non-loopback bind while auth is off).
func TestValidate(t *testing.T) {
	tests := []struct {
		name    string
		cfg     Config
		wantErr bool
	}{
		{"none on loopback is fine", Config{Host: "127.0.0.1", AuthMode: AuthNone, LogFormat: LogText}, false},
		{"none on localhost is fine", Config{Host: "localhost", AuthMode: AuthNone, LogFormat: LogText}, false},
		{"oauth may bind any host", Config{Host: "0.0.0.0", AuthMode: AuthOAuth, LogFormat: LogJSON}, false},
		{"unknown auth mode rejected", Config{Host: "127.0.0.1", AuthMode: "foo", LogFormat: LogText}, true},
		{"unknown log format rejected", Config{Host: "127.0.0.1", AuthMode: AuthNone, LogFormat: "yaml"}, true},
		{"none beyond loopback rejected", Config{Host: "0.0.0.0", AuthMode: AuthNone, LogFormat: LogText}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.cfg.Validate(); (err != nil) != tt.wantErr {
				t.Fatalf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

// TestLoadEnv checks that an env value overrides the default and that an empty
// value falls back to the default (the getenv contract).
func TestLoadEnv(t *testing.T) {
	t.Setenv("PAD_PORT", "9999")
	t.Setenv("PAD_HOST", "") // empty must fall back, not become ""
	cfg := Load()

	if cfg.Port != "9999" {
		t.Errorf("Port = %q, want 9999 (override)", cfg.Port)
	}
	if cfg.Host != "127.0.0.1" {
		t.Errorf("Host = %q, want 127.0.0.1 (empty env -> default)", cfg.Host)
	}
}
