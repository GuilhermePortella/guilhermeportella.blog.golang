#!/usr/bin/env bash
set -euo pipefail

base_ref="${QUALITY_BASE_REF:-origin/main}"

if ! git rev-parse --verify "$base_ref" >/dev/null 2>&1; then
  echo "quality-gate: base ref '$base_ref' not found; skipping diff based checks."
  exit 0
fi

changed_files="$(
  {
    git diff --name-only "$base_ref"...HEAD
    git diff --name-only --cached
    git diff --name-only
    git ls-files --others --exclude-standard
  } | sed '/^$/d' | sort -u
)"

if [[ -z "$changed_files" ]]; then
  echo "quality-gate: no changed files against $base_ref."
  exit 0
fi

has_change() {
  local pattern="$1"
  grep -Eq "$pattern" <<<"$changed_files"
}

require_change() {
  local sensitive_pattern="$1"
  local required_pattern="$2"
  local message="$3"

  if has_change "$sensitive_pattern" && ! has_change "$required_pattern"; then
    printf 'quality-gate: %s\n\n' "$message" >&2
    printf 'Arquivos alterados contra %s:\n%s\n' "$base_ref" "$changed_files" >&2
    exit 1
  fi
}

require_change \
  '(^internal/transport/http/.*\.go$|^web/templates/.*\.html$)' \
  '(^internal/transport/http/.*(_test|_unit_test)\.go$|^cmd/export/.*_test\.go$)' \
  'mudanca em handler/template exige teste HTTP ou teste de export relacionado.'

require_change \
  '^cmd/export/.*\.go$' \
  '^cmd/export/.*_test\.go$' \
  'mudanca no export estatico exige teste em cmd/export.'

require_change \
  '(^internal/config/.*\.go$|^\.env\.example$)' \
  '^internal/config/.*_test\.go$' \
  'mudanca de configuracao exige teste em internal/config.'

require_change \
  '(^internal/blog/.*\.go$|^content/(articles|notes)/.*\.md$)' \
  '(^internal/blog/.*_test\.go$|^cmd/contentlint/.*_test\.go$|^internal/transport/http/.*(_test|_unit_test)\.go$)' \
  'mudanca em conteudo ou modelo de blog exige teste de blog, lint de conteudo ou contrato HTTP.'

require_change \
  '(^web/static/js/.*\.js$|^internal/transport/http/(astronomia|curiosidades|projetos)\.go$)' \
  '(^internal/transport/http/.*(_test|_unit_test)\.go$|^cmd/export/.*_test\.go$)' \
  'mudanca em integracao client-side ou pagina com API externa exige teste de contrato da pagina.'

echo "quality-gate: diff checks passed."
