#!/usr/bin/env bash
set -Eeuo pipefail

export GOTOOLCHAIN="${GOTOOLCHAIN:-go1.26.6}"
export APP_ENV="${APP_ENV:-production}"

printf '%s\n' 'vercel-build: selecting Go toolchain'
go version

printf '%s\n' 'vercel-build: downloading Go modules'
go mod download

printf '%s\n' 'vercel-build: exporting static site'
go run ./cmd/export

test -f dist/index.html
printf '%s\n' 'vercel-build: dist/index.html generated successfully'
