APP_NAME ?= blog
GO ?= go
PKG := ./...

.PHONY: help fmt vet test run build clean

help: ## Lista os comandos disponiveis.
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "%-12s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

fmt: ## Formata o codigo Go.
	$(GO) fmt $(PKG)

vet: ## Executa analise estatica basica do Go.
	$(GO) vet $(PKG)

test: ## Executa a suite de testes com detector de corrida.
	$(GO) test -race $(PKG)

run: ## Inicia o servidor local.
	$(GO) run ./cmd/blog

build: ## Gera binario otimizado em ./bin.
	CGO_ENABLED=0 $(GO) build -trimpath -ldflags="-s -w" -o bin/$(APP_NAME) ./cmd/blog

clean: ## Remove artefatos locais.
	rm -rf bin
