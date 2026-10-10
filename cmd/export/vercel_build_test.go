package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestVercelBuildNASAPolicy(t *testing.T) {
	root, err := findProjectRoot()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ name, configured, want string }{
		{"default", "", "false"},
		{"optional", "false", "false"},
		{"required", "true", "true"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			bin := filepath.Join(dir, "bin")
			if err := os.Mkdir(bin, 0o755); err != nil {
				t.Fatal(err)
			}
			// Exercise the real build script without downloading tools or calling NASA.
			stub := `#!/bin/sh
set -eu
if [ "$1" = "run" ]; then
 printf '%s' "$NASA_DATA_REQUIRED" > nasa-policy
 mkdir -p dist
 printf '<html></html>' > dist/index.html
fi
`
			if err := os.WriteFile(filepath.Join(bin, "go"), []byte(stub), 0o755); err != nil {
				t.Fatal(err)
			}
			t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
			t.Setenv("NASA_DATA_REQUIRED", tc.configured)
			cmd := exec.Command("bash", filepath.Join(root, "scripts", "vercel-build.sh"))
			cmd.Dir = dir
			if output, err := cmd.CombinedOutput(); err != nil {
				t.Fatalf("build script: %v\n%s", err, output)
			}
			value, err := os.ReadFile(filepath.Join(dir, "nasa-policy"))
			if err != nil {
				t.Fatal(err)
			}
			if strings.TrimSpace(string(value)) != tc.want {
				t.Fatalf("NASA_DATA_REQUIRED = %q, want %q", value, tc.want)
			}
		})
	}
}
