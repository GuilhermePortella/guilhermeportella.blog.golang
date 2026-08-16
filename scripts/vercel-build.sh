#!/usr/bin/env bash
set -Eeuo pipefail

export GOTOOLCHAIN="${GOTOOLCHAIN:-go1.26.6}"
export APP_ENV="${APP_ENV:-production}"

run_step() {
  local label="$1"
  shift

  local stage_log
  stage_log="$(mktemp "${TMPDIR:-/tmp}/vercel-build.XXXXXX")"
  printf 'vercel-build: %s\n' "$label"

  if "$@" >"$stage_log" 2>&1; then
    cat "$stage_log"
    rm -f "$stage_log"
    return 0
  else
    local status=$?
    printf 'vercel-build: ERROR in "%s" (exit %d)\n' "$label" "$status" >&2
    cat "$stage_log" >&2
    rm -f "$stage_log"
    return "$status"
  fi
}

run_step 'selecting Go toolchain' go version
run_step 'downloading Go modules' go mod download
run_step 'exporting static site' go run ./cmd/export

if [[ ! -f dist/index.html ]]; then
  printf '%s\n' 'vercel-build: ERROR: dist/index.html was not generated' >&2
  exit 1
fi
printf '%s\n' 'vercel-build: dist/index.html generated successfully'
