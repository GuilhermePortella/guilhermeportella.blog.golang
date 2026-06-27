# Blog em Go

Estrutura inicial para um site estilo blog em Go. A base usa a biblioteca padrao para HTTP e templates, com dependencias pontuais para carregar YAML Front Matter, renderizar Markdown/GFM, sanitizar HTML e exibir formulas matematicas.

## Requisitos

- Go 1.26.4
- Make opcional, apenas para atalhos locais

## Comandos

```sh
make fmt
make vet
make content-lint
make test
make cover-check
make run
make build
make export
make ci
```
 
Sem `make`, use os equivalentes com `go fmt ./...`, `go vet ./...`, `go test ./...`, `go run ./cmd/blog` e `go run ./cmd/export`.

## Estrutura

```text
cmd/blog/                 ponto de entrada da aplicacao
cmd/export/               gerador estatico para GitHub Pages
internal/config/          leitura e validacao de configuracao
internal/server/          servidor HTTP com timeouts e graceful shutdown
internal/transport/http/  rotas, renderizacao, handlers e middlewares HTTP
internal/blog/            tipos e contratos iniciais do dominio de blog
internal/platform/        adaptadores de infraestrutura compartilhados
content/articles/         textos Markdown do blog
content/notes/            notas curtas em Markdown
public/images/            imagens referenciadas por artigos em /images/*
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

O corpo dos artigos aceita Markdown padrao, GFM, tabelas, quebras de linha, HTML controlado, imagens, video/audio, emojis via Twemoji e formulas com KaTeX (`$inline$` ou `$$bloco$$`). O HTML final passa por sanitizacao antes de ser renderizado, e os headings `h2`/`h3` recebem ids para alimentar o sumario da pagina.

Antes de publicar, `make content-lint` valida frontmatter, datas, slugs duplicados e corpo minimo dos artigos e notas.

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

## Qualidade e seguranca

`make ci` roda formatacao, lint de conteudo, verificacoes de seguranca, analise estatica, testes com race detector, limites minimos de cobertura, build e export.

Comandos complementares:

```sh
make test-shuffle
make cover
make cover-check
make semgrep
make zap
make docker-prune
```

`make semgrep` usa uma instalacao local do Semgrep quando existir, ou Docker como fallback. `make zap` sobe o servidor local, executa OWASP ZAP baseline via Docker e grava os relatórios em `tmp/zap/`.
`make docker-prune` remove imagens, containers, redes e cache Docker nao usados, util depois de rodadas com ferramentas em container.

## Publicacao no GitHub Pages

O GitHub Pages publica arquivos estaticos, entao o servidor Go nao roda em producao nesse modo. Para publicar, o comando abaixo renderiza as rotas HTML e copia os assets para `dist/`:

```sh
make export
```

O workflow `.github/workflows/pages.yml` valida o projeto, gera `dist/`, envia o artefato do Pages e publica quando houver push na branch `main`. O workflow `.github/workflows/ci.yml` roda as mesmas validacoes em `main`, `dev` e pull requests para `main`.

Configuracoes iniciais sugeridas no repositorio:

- Em Settings > Pages, selecione GitHub Actions como source.
- Em Settings > Environments, mantenha o ambiente `github-pages` com as protecoes desejadas.
- Para Project Pages, o workflow assume automaticamente `/<nome-do-repositorio>` quando `SITE_BASE_PATH` nao estiver definido.
- `SITE_URL` define a origem absoluta usada em `sitemap.xml`, `robots.txt` e `feed.xml`.
- O export tambem gera `feed.xml` com os artigos publicados para leitores RSS.
- Se este site for publicado como User Pages ou com dominio proprio na raiz, configure a variavel do repositorio `SITE_BASE_PATH` como `/`.
- Mantenha segredos fora do repo; o deploy atual nao precisa de secrets.

## Arquitetura

As decisoes arquiteturais ficam em `docs/adr/`.

- `docs/adr/0001-estrutura-inicial-do-projeto.md`: estrutura inicial do projeto.
- `docs/adr/0002-home-com-templates-go.md`: primeira Home renderizada por templates Go.
- `docs/adr/0003-conteudo-markdown-sanitizado.md`: artigos e notas em Markdown com frontmatter e HTML sanitizado.
- `docs/adr/0004-export-estatico-para-github-pages.md`: export de rotas HTML, assets, sitemap, robots e feed para GitHub Pages.
- `docs/adr/0005-integracoes-client-side-com-apis-publicas.md`: integracoes frontend com APIs publicas, dados pregerados e CSP explicita.

## Rotas

- `GET /`
- `GET /404`
- `GET /about`
- `GET /astronomia`
- `GET /articles` (atalho para o arquivo de textos)
- `GET /blog`
- `GET /blog/{slug}`
- `GET /curiosidades`
- `GET /curiosidades/rick-and-morty`
- `GET /erro`
- `GET /feed.xml` (gerado no export estatico)
- `GET /rick-morty`
- `GET /rick-morty/personagem/{id}`
- `GET /rick-morty/local/{id}`
- `GET /rick-morty/episodio/{id}`
- `GET /games` (atalho para jogos)
- `GET /jogos`
- `GET /jogos/{slug}`
- `GET /notas`
- `GET /projects` (atalho para projetos)
- `GET /projetos`
- `GET /robots.txt` (gerado no export estatico)
- `GET /sitemap.xml` (gerado no export estatico)
- `GET /service-worker.js`
- `GET /static/*`
- `GET /healthz`
- `GET /readyz`
