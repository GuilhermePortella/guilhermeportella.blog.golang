# ADR 0002: Home renderizada com templates Go

## Status

Aceita

## Data

2026-05-03

## Contexto

Depois da estrutura inicial do projeto, foi necessario criar a primeira pagina web: a Home do site. A pagina deveria seguir a organizacao proposta anteriormente:

- HTML em `web/templates`;
- CSS e assets em `web/static`;
- handlers e renderizacao em `internal/transport/http`;
- dominio de blog preservado em `internal/blog`, sem receber codigo de apresentacao.

A Home deve nascer como estrutura tecnica de blog, nao como uma pagina editorial definitiva. O template deve oferecer regioes para hero, posts em destaque, posts recentes e assuntos. Enquanto nao existe uma fonte real de conteudo, o handler pode fornecer dados mockados para validar layout, responsividade e fluxo visual.

## Decisao

Foi decidido renderizar a Home usando `html/template`, da biblioteca padrao do Go.

A estrutura criada foi:

```text
web/templates/
  layouts/
    base.html
  pages/
    home.html
  partials/
    site_header.html
    site_footer.html

web/static/
  css/
    main.css

internal/transport/http/
  home.go
  render.go
```

O roteador agora registra:

- `GET /` para a Home;
- `GET /static/*` para arquivos estaticos;
- `GET /healthz` e `GET /readyz` para operacao.

## Consequencias

Beneficios:

- a Home fica separada do codigo Go;
- o layout, os partials e a pagina podem evoluir separadamente;
- a pagina inicial nao fica acoplada a conteudo hard-coded;
- os mocks permitem ver a experiencia de blog antes da camada real de posts existir;
- o projeto continua sem dependencias externas;
- o renderer centraliza parsing e execucao de templates;
- os testes HTTP passam a cobrir a rota raiz;
- o CSS fica servido por `/static/`, mantendo apresentacao fora dos handlers.

Custos:

- os templates precisam existir no filesystem em tempo de execucao;
- o binario sozinho nao contem os arquivos HTML e CSS;
- se o projeto exigir deploy como binario unico, uma decisao futura pode migrar templates e assets para `embed.FS`.

## Alternativas consideradas

### Conteudo hard-coded no template

Foi rejeitado porque confundiria a estrutura tecnica da Home com conteudo editorial especifico. Conteudo real deve vir de uma camada propria, como posts versionados, repositorio, banco de dados ou outro mecanismo definido em ADR futuro.

### HTML dentro do handler Go

Foi rejeitado porque misturaria apresentacao com transporte HTTP e tornaria a pagina dificil de manter.

### `embed.FS`

E uma boa alternativa futura para empacotar templates e assets no binario. Neste momento, os caminhos ja existem em configuracao e o uso direto do filesystem e mais simples para desenvolvimento local.

## Diretriz futura

Novas paginas devem seguir a mesma divisao:

- `web/templates/pages/<pagina>.html` para conteudo especifico;
- `web/templates/layouts/` para estruturas compartilhadas;
- `web/templates/partials/` para blocos reutilizaveis;
- `web/static/` para CSS, imagens, fontes e JavaScript;
- `internal/transport/http/<pagina>.go` para handlers.

Se o numero de paginas crescer, o renderer deve evoluir para evitar colisoes de blocos globais de template, especialmente o bloco `content`.
