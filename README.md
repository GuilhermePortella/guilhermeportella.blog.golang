# Blog em Go

Estrutura inicial para um site estilo blog em Go. A base usa apenas a biblioteca padrao, deixando o projeto simples de auditar e pronto para receber armazenamento, templates, renderizacao, autenticacao ou CMS depois.

## Requisitos

- Go 1.26.2
- Make opcional, apenas para atalhos locais

## Comandos

```sh
make fmt
make vet
make test
make run
make build
```

Sem `make`, use os equivalentes com `go fmt ./...`, `go vet ./...`, `go test ./...` e `go run ./cmd/blog`.

## Estrutura

```text
cmd/blog/                 ponto de entrada da aplicacao
internal/config/          leitura e validacao de configuracao
internal/server/          servidor HTTP com timeouts e graceful shutdown
internal/transport/http/  rotas, renderizacao, handlers e middlewares HTTP
internal/blog/            tipos e contratos iniciais do dominio de blog
internal/platform/        adaptadores de infraestrutura compartilhados
content/articles/         textos Markdown do blog
content/notes/            notas curtas em Markdown
web/static/               assets publicos, como CSS
web/templates/            templates HTML da aplicacao
migrations/               migracoes futuras de banco de dados
configs/                  configuracoes versionaveis por ambiente
docs/adr/                 decisoes arquiteturais
scripts/                  automacoes locais
```

## Publicando conteudo

Os artigos longos ficam em `content/articles/**/*.md`. A subpasta e livre, entao voce pode organizar por ano e mes:

```text
content/articles/2026/05/meu-artigo.md
content/articles/2026/04/outro-artigo.md
```

Cada artigo vira `/blog/{slug}`. O slug vem do nome do arquivo ou de `slug` no frontmatter:

```md
---
title: "Meu artigo"
summary: "Resumo curto para listas e SEO."
author: "Guilherme Portella"
publishedAt: "2026-05-04"
tags:
  - Go
  - arquitetura
---

## Primeira secao

Texto do artigo.
```

As notas curtas ficam em `content/notes/**/*.md`:

```text
content/notes/2026/05/minha-nota.md
```

Notas usam `tag` como pino de filtro em `/notas`. Se `tag` nao existir, entram no pino `nota`.

```md
---
title: "Minha nota"
tag: "rotina"
date: "2026-05-04"
---

Texto curto da nota.
```

## Configuracao

Copie as variaveis de `.env.example` para o ambiente do processo quando necessario. O projeto nao carrega arquivos `.env` automaticamente para evitar dependencia externa no bootstrap.

## Arquitetura

As decisoes arquiteturais ficam em `docs/adr/`.

- `docs/adr/0001-estrutura-inicial-do-projeto.md`: estrutura inicial do projeto.
- `docs/adr/0002-home-com-templates-go.md`: primeira Home renderizada por templates Go.

## Rotas

- `GET /`
- `GET /blog`
- `GET /blog/{slug}`
- `GET /notas`
- `GET /static/*`
- `GET /healthz`
- `GET /readyz`
