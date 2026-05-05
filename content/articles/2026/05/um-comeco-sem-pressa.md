---
title: "Estruturando um serviço Go para crescer com segurança"
summary: "Uma visão prática sobre organização de pacotes, configuração, transporte HTTP e pontos de extensão."
author: "Guilherme Portella"
publishedAt: "2026-05-03"
tags:
  - Go
  - arquitetura
keywords:
  - backend
  - templates
  - HTTP
---

## Um começo que não precisa correr

Um serviço Go pequeno costuma nascer com poucas rotas, um logger simples e algumas decisões que parecem óbvias. O problema é que essas decisões viram fundação antes de a gente perceber.

Por isso, gosto de separar cedo o que pertence ao transporte HTTP, o que pertence ao domínio e o que é infraestrutura de apoio.

## Organização inicial

A estrutura não precisa ser grande. Ela só precisa deixar claro onde cada coisa mora:

- `cmd/` inicia a aplicação;
- `internal/transport/http` cuida das rotas;
- `internal/blog` guarda contratos do domínio;
- `web/templates` e `web/static` concentram apresentação.

> A simplicidade boa não é ausência de estrutura. É estrutura suficiente para não precisar explicar tudo de novo amanhã.

## Pontos de extensão

Quando uma aplicação começa assim, trocar mocks por Markdown, banco ou outro repositório fica menos traumático. A rota não precisa saber se o texto veio do filesystem, de um CMS ou de uma tabela.

```go
type Repository interface {
    ListPublished(ctx context.Context) ([]Post, error)
    FindBySlug(ctx context.Context, slug string) (Post, error)
}
```

O contrato pequeno segura o desenho enquanto o resto ainda está mudando.
