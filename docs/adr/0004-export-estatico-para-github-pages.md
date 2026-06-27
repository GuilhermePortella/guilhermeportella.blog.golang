# ADR 0004: Export estatico para GitHub Pages

## Status

Aceita

## Data

2026-06-26

## Contexto

O repositorio publica em `guilhermeportella.github.io`, onde o GitHub Pages serve arquivos estaticos. Isso significa que o servidor Go e util para desenvolvimento, testes, renderizacao e validacao, mas nao roda em producao nesse modo de deploy.

O projeto precisa:

- gerar HTML estatico para as rotas publicas;
- copiar assets de `web/static` e imagens de `public/images`;
- manter suporte a Project Pages com `SITE_BASE_PATH`;
- gerar `sitemap.xml`, `robots.txt` e `feed.xml`;
- exportar tambem rotas dinamicas descobertas a partir de links internos, como artigos e jogos;
- manter segredos fora do navegador, especialmente chaves de APIs usadas durante o build.

## Decisao

Foi criado o comando `cmd/export`.

O exportador instancia o mesmo roteador HTTP da aplicacao, renderiza rotas usando `httptest`, escreve os arquivos correspondentes em `dist/` e copia assets publicos.

As rotas estaticas base ficam em uma lista explicita. Durante o export, o HTML dessas rotas e analisado com `golang.org/x/net/html` para descobrir links internos exportaveis. URLs relativas a raiz podem ser reescritas com `SITE_BASE_PATH`, o que permite publicar o mesmo site na raiz ou em Project Pages.

Quando `NASA_API_KEY` existe no ambiente, o export busca dados APOD da NASA e grava JSON em `static/data/nasa`. A chave fica restrita ao ambiente de build e nao e enviada ao navegador.

## Consequencias

Beneficios:

- o comportamento renderizado em desenvolvimento e no export usa o mesmo roteador;
- o GitHub Pages recebe apenas arquivos estaticos;
- o projeto nao precisa de servidor Go em producao nesse deploy;
- sitemap, robots e feed acompanham o conjunto de rotas exportadas;
- o suporte a `SITE_BASE_PATH` reduz ajustes manuais para GitHub Pages;
- dados APOD podem ser pregerados sem expor segredo no frontend.

Custos:

- rotas novas precisam estar linkadas ou adicionadas ao conjunto base para aparecer no export;
- o export depende de o handler responder `200 OK` para cada rota publica;
- qualquer atributo novo com URL absoluta de raiz pode precisar entrar na lista de atributos reescritos;
- chamadas externas no build, como NASA APOD, podem falhar por rede, quota ou indisponibilidade da API.

## Alternativas consideradas

### Servir o binario Go em producao

Foi rejeitado para o deploy atual porque GitHub Pages ja atende o objetivo com menos operacao.

### Gerador estatico separado dos handlers

Foi rejeitado porque duplicaria regras de rota, templates e dados. Reusar o roteador reduz divergencia entre desenvolvimento e publicacao.

### `embed.FS` para templates e assets

Continua sendo uma alternativa possivel para empacotar o binario, mas nao e necessaria para o fluxo atual de export.

## Diretrizes futuras

- Toda rota publica nova deve ter teste de roteador e ser exportavel por lista base ou link interno.
- Mudancas em `SITE_BASE_PATH` devem ser cobertas por testes de reescrita de URL.
- O export nao deve gravar fora do diretorio permitido nem sobrescrever codigo-fonte do projeto.
