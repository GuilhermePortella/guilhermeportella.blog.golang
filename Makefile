APP_NAME ?= blog
EXPORT_DIR ?= dist
GO ?= go
PKG := ./...

.PHONY: help fmt fmt-check vet test run build export ci clean

help: ## Lista os comandos disponiveis.
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "%-12s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

fmt: ## Formata o codigo Go.
	$(GO) fmt $(PKG)

fmt-check: ## Verifica se o codigo Go esta formatado.
	@unformatted="$$(gofmt -l $$(find . -name '*.go' -not -path './vendor/*'))"; \
	test -z "$$unformatted" || (printf 'Arquivos Go sem gofmt:\n%s\n' "$$unformatted"; exit 1)

vet: ## Executa analise estatica basica do Go.
	$(GO) vet $(PKG)

test: ## Executa a suite de testes com detector de corrida.
	$(GO) test -race $(PKG)

run: ## Inicia o servidor local.
	$(GO) run ./cmd/blog

build: ## Gera binario otimizado em ./bin.
	CGO_ENABLED=0 $(GO) build -trimpath -ldflags="-s -w" -o bin/$(APP_NAME) ./cmd/blog

export: ## Gera o site estatico em ./dist para publicacao no GitHub Pages.
	EXPORT_DIR=$(EXPORT_DIR) $(GO) run ./cmd/export

ci: fmt-check vet test build export ## Executa as validacoes usadas no CI.

clean: ## Remove artefatos locais.
	rm -rf bin $(EXPORT_DIR)
