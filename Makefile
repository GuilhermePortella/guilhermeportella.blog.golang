APP_NAME ?= blog
EXPORT_DIR ?= dist
GO ?= go
PKG := ./...
DOCKER ?= docker
CURL ?= curl
PYTHON ?= python3
NPX ?= npx
SEMGREP_IMAGE ?= semgrep/semgrep
ZAP_IMAGE ?= ghcr.io/zaproxy/zaproxy:stable
ZAP_PORT ?= 18080
ZAP_REPORT_DIR ?= tmp/zap
COVER_HTTP_MIN ?= 85.0
COVER_CONFIG_MIN ?= 90.0
COVER_EXPORT_MIN ?= 80.0

.PHONY: help fmt fmt-check vet staticcheck content-lint architecture quality-gate test test-shuffle cover cover-check vuln secrets security semgrep zap lighthouse docker-prune run build export ci clean

help: ## Lista os comandos disponiveis.
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "%-12s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

fmt: ## Formata o codigo Go.
	$(GO) fmt $(PKG)

fmt-check: ## Verifica se o codigo Go esta formatado.
	@unformatted="$$(gofmt -l $$(find . -name '*.go' -not -path './vendor/*'))"; \
	test -z "$$unformatted" || (printf 'Arquivos Go sem gofmt:\n%s\n' "$$unformatted"; exit 1)

vet: ## Executa analise estatica basica do Go.
	$(GO) vet $(PKG)

staticcheck: ## Executa analise estatica avancada do Go.
	$(GO) run honnef.co/go/tools/cmd/staticcheck@latest $(PKG)

content-lint: ## Valida frontmatter e estrutura minima dos arquivos Markdown.
	$(GO) run ./cmd/contentlint

architecture: ## Valida regras arquiteturais dos pacotes Go.
	$(GO) test ./internal/architecture

quality-gate: ## Bloqueia mudancas sensiveis sem teste relacionado em PRs.
	./scripts/quality-gate.sh

test: ## Executa a suite de testes com detector de corrida.
	$(GO) test -race $(PKG)

test-shuffle: ## Repete testes em ordem aleatoria para encontrar flakes.
	$(GO) test -shuffle=on -count=3 $(PKG)

cover: ## Executa testes com relatorio de cobertura por pacote.
	$(GO) test -cover $(PKG)

cover-check: ## Garante limites minimos de cobertura nos pacotes criticos.
	@mkdir -p tmp
	@$(GO) test -coverprofile=tmp/http.cover ./internal/transport/http >/dev/null
	@$(GO) tool cover -func=tmp/http.cover | awk -v pkg="internal/transport/http" -v min="$(COVER_HTTP_MIN)" '/total:/ { value=$$3; sub(/%/, "", value); if (value + 0 < min + 0) { printf "%s coverage %.1f%% below %.1f%%\n", pkg, value, min; exit 1 } printf "%s coverage %.1f%% >= %.1f%%\n", pkg, value, min }'
	@$(GO) test -coverprofile=tmp/config.cover ./internal/config >/dev/null
	@$(GO) tool cover -func=tmp/config.cover | awk -v pkg="internal/config" -v min="$(COVER_CONFIG_MIN)" '/total:/ { value=$$3; sub(/%/, "", value); if (value + 0 < min + 0) { printf "%s coverage %.1f%% below %.1f%%\n", pkg, value, min; exit 1 } printf "%s coverage %.1f%% >= %.1f%%\n", pkg, value, min }'
	@$(GO) test -coverprofile=tmp/export.cover ./cmd/export >/dev/null
	@$(GO) tool cover -func=tmp/export.cover | awk -v pkg="cmd/export" -v min="$(COVER_EXPORT_MIN)" '/total:/ { value=$$3; sub(/%/, "", value); if (value + 0 < min + 0) { printf "%s coverage %.1f%% below %.1f%%\n", pkg, value, min; exit 1 } printf "%s coverage %.1f%% >= %.1f%%\n", pkg, value, min }'

vuln: ## Verifica CVEs conhecidas em dependencias e codigo Go alcancavel.
	$(GO) run golang.org/x/vuln/cmd/govulncheck@latest $(PKG)

secrets: ## Procura segredos acidentais em arquivos versionaveis.
	$(GO) run github.com/zricethezav/gitleaks/v8@latest detect --source . --no-git --redact --no-banner

security: ## Executa verificacoes locais de seguranca.
	$(GO) mod verify
	$(GO) vet $(PKG)
	$(GO) run golang.org/x/vuln/cmd/govulncheck@latest $(PKG)
	$(GO) run github.com/securego/gosec/v2/cmd/gosec@latest -quiet $(PKG)
	$(GO) run github.com/zricethezav/gitleaks/v8@latest detect --source . --no-git --redact --no-banner

semgrep: ## Executa Semgrep p/ci localmente ou via Docker.
	@set -eu; \
	if command -v semgrep >/dev/null 2>&1; then \
		semgrep scan --config p/ci --exclude dist --exclude tmp --exclude bin --error; \
	else \
		if $(DOCKER) info >/dev/null 2>&1; then \
			if $(DOCKER) run --rm -v "$(CURDIR):/src" -w /src $(SEMGREP_IMAGE) semgrep scan --config p/ci --exclude dist --exclude tmp --exclude bin --error; then \
				exit 0; \
			fi; \
			echo "Docker Semgrep failed; falling back to a temporary Python venv."; \
		else \
			echo "Docker is not available; falling back to a temporary Python venv."; \
		fi; \
		venv="tmp/semgrep-venv"; \
		rm -rf "$$venv"; \
		$(PYTHON) -m venv "$$venv"; \
		trap 'rm -rf "$$venv"' EXIT INT TERM; \
		"$$venv/bin/pip" install --quiet semgrep; \
		"$$venv/bin/semgrep" scan --config p/ci --exclude dist --exclude tmp --exclude bin --error; \
	fi

zap: ## Executa OWASP ZAP baseline contra o servidor local em Docker.
	@rm -rf $(ZAP_REPORT_DIR)
	@mkdir -p $(ZAP_REPORT_DIR)
	@APP_ENV=test HTTP_HOST=0.0.0.0 HTTP_PORT=$(ZAP_PORT) $(GO) run ./cmd/blog >$(ZAP_REPORT_DIR)/server.log 2>&1 & \
	server_pid=$$!; \
	trap 'kill "$$server_pid" 2>/dev/null || true; wait "$$server_pid" 2>/dev/null || true' EXIT INT TERM; \
	ready=0; \
	for _ in $$(seq 1 60); do \
		if $(CURL) -fsS "http://127.0.0.1:$(ZAP_PORT)/" >/dev/null 2>&1; then ready=1; break; fi; \
		if ! kill -0 "$$server_pid" 2>/dev/null; then cat "$(ZAP_REPORT_DIR)/server.log"; exit 1; fi; \
		sleep 1; \
	done; \
	if test "$$ready" != "1"; then cat "$(ZAP_REPORT_DIR)/server.log"; echo "server did not become ready"; exit 1; fi; \
	$(DOCKER) run --rm --add-host=host.docker.internal:host-gateway -v "$(CURDIR)/$(ZAP_REPORT_DIR):/zap/wrk:rw" $(ZAP_IMAGE) zap-baseline.py -I -t "http://host.docker.internal:$(ZAP_PORT)" -r zap-baseline.html -J zap-baseline.json -w zap-baseline.md

lighthouse: export ## Audita performance, acessibilidade, boas praticas e SEO no export estatico.
	$(NPX) --yes @lhci/cli@0.15.1 autorun

docker-prune: ## Remove imagens, containers, redes e cache Docker nao usados.
	$(DOCKER) system prune -a -f

run: ## Inicia o servidor local.
	$(GO) run ./cmd/blog

build: ## Gera binario otimizado em ./bin.
	CGO_ENABLED=0 $(GO) build -trimpath -ldflags="-s -w" -o bin/$(APP_NAME) ./cmd/blog

export: ## Gera o site estatico em ./dist para publicacao no GitHub Pages.
	EXPORT_DIR=$(EXPORT_DIR) $(GO) run ./cmd/export

ci: fmt-check content-lint architecture quality-gate security staticcheck test cover-check build export ## Executa as validacoes usadas no CI.

clean: ## Remove artefatos locais.
	rm -rf bin dist
