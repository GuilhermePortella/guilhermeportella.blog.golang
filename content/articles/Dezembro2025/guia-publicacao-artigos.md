---
title: "Guia completo: decisoes tecnicas e como publicar artigos aqui"
summary: "Explicacao detalhada da arquitetura dos artigos, estrutura do Markdown e passo a passo de publicacao."
author: "Guilherme Portella"
publishedAt: "2025-12-24"
keywords:
  - Docs
  - Blog
  - Markdown
  - SEO
  - Publicacao
seoTitle: "Guia completo de publicacao de artigos | Guilherme Portella"
seoDescription: "Guia detalhado sobre como publicar artigos em Markdown, organizar metadata e manter SEO basico no site."
canonicalUrl: "https://www.guilhermeportella.com.br/#/blog/artigos/guia-publicacao-artigos"
locale: "pt-BR"
tags: ["Docs", "Blog", "Markdown"]
---

## Por que esta arquitetura?
O objetivo aqui e simples: publicar conteudo com o menor custo de manutencao possivel.
Para isso, o site usa arquivos `.md` dentro de `src/articles` e um loader leve
em `src/lib/articles.js` que mapeia os arquivos automaticamente no build.

Vantagens principais:
- Conteudo editavel sem mexer em componentes React.
- Publicacao rapida: so adicionar o arquivo.
- Sem dependencia de banco ou CMS externo.
- Sem scripts ou index manual para atualizar.

## Estrutura geral do projeto (somente o que importa para o blog)
Dentro do projeto, o fluxo de artigos depende destas pastas:

- `src/articles/` -> guarda os arquivos `.md` com o conteudo.
- `src/lib/articles.js` -> carrega os arquivos e monta a lista automaticamente.
- `src/hooks/useArticles.js` -> hook que entrega status, erro e lista.
- `src/pages/Articles.js` -> lista completa com filtro por ano/mes.
- `src/pages/Article.js` -> pagina de artigo individual.
- `src/utils/markdown.js` -> parser de Markdown + front matter.
- `src/utils/articleUtils.js` -> helpers de data e formato.

## Estrutura do arquivo Markdown
Cada artigo precisa ter:
1) Um bloco de **front matter** no topo.
2) O corpo do artigo em Markdown logo abaixo.

Exemplo minimo:
```md
---
title: "Titulo do artigo"
summary: "Resumo curto para cards e SEO basico."
author: "Guilherme Portella"
publishedAt: "2026-02-01"
tags: ["Back-end", "Docs"]
---

## Primeiro bloco
Conteudo aqui.
```

Campos do front matter:
- `title` (obrigatorio): titulo que aparece no artigo.
- `summary` (recomendado): aparece nos cards.
- `author` (opcional): por padrao usa "Guilherme Portella".
- `publishedAt` (recomendado): formato `YYYY-MM-DD`.
- `publishedDate` (alternativo): mesmo formato de `publishedAt`.
- `tags` (opcional): lista de tags.
- `keywords` (opcional): termos para SEO e busca.
- `slug` (opcional): slug customizado para a URL.

## Campos extras para SEO
Para indexacao basica, este projeto aceita campos **planos** e tambem o bloco `seo:`.

- `seoTitle`: titulo pensado para buscadores.
- `seoDescription`: descricao curta para meta description.
- `canonicalUrl`: URL canonica absoluta.
- `ogImage`: imagem usada no Open Graph (opcional).
- `locale`: idioma, exemplo `pt-BR`.

Exemplo com SEO:
```md
---
title: "Titulo do artigo"
summary: "Resumo curto."
author: "Guilherme Portella"
publishedAt: "2026-02-01"
keywords:
  - Blog
  - SEO
seoTitle: "Titulo para SEO | Guilherme Portella"
seoDescription: "Descricao otimizada para buscadores."
canonicalUrl: "https://www.guilhermeportella.com.br/blog/artigos/meu-artigo"
ogImage: "/images/meu-artigo.jpg"
locale: "pt-BR"
tags: ["Docs"]
---
```

Ou, se preferir, use o bloco `seo:` com os mesmos campos:
```md
---
title: "Titulo do artigo"
summary: "Resumo curto."
seo:
  title: "Titulo para SEO | Guilherme Portella"
  description: "Descricao otimizada para buscadores."
  canonicalUrl: "https://www.guilhermeportella.com.br/blog/artigos/meu-artigo"
  image: "/images/meu-artigo.jpg"
  locale: "pt-BR"
---
```

Opcionalmente, voce pode informar um bloco `jsonLd:` para sobrescrever o schema:
```md
---
title: "Titulo do artigo"
jsonLd:
  "@context": "https://schema.org"
  "@type": "Article"
  "headline": "Titulo do artigo"
---
```

> Obs: o parser e leve e aceita apenas objetos simples (sem logicas YAML avancadas).

## Onde salvar o arquivo
O arquivo deve ficar em `src/articles/`.
O nome do arquivo vira o **slug** (normalizado) do artigo:

```
src/articles/<slug>.md
```

Exemplo:
```
src/articles/guia-publicacao-artigos.md
```

Se precisar de um slug diferente, use `slug:` no front matter.

## Como os artigos sao mapeados automaticamente
Nao existe index manual. O arquivo `src/lib/articles.js` usa um mapeamento direto
dos `.md` dentro de `src/articles/`, carrega o conteudo e monta a lista em runtime.

Regras importantes:
- `publishedAt` ou `publishedDate` deve estar no formato `YYYY-MM-DD`.
- Se `readTime` nao existir, ele e calculado automaticamente.
- Slugs sao normalizados (acentos e espacos viram `-`).

## Passo a passo para publicar
1. Crie o arquivo `.md` em `src/articles/`.
2. Escreva o front matter completo.
3. Escreva o conteudo em Markdown (titulos, listas, blocos de codigo).
4. Rode o projeto normalmente.
5. Acesse `/blog/artigos/<slug>`.

## Como a pagina de artigo funciona
A listagem em `src/pages/Articles.js` nao renderiza HTML do artigo. Ela so usa o front matter.

Quando o usuario acessa `/blog/artigos/:slug`:
1) `src/lib/articles.js` localiza o arquivo `.md` (inclui subpastas).
2) `src/utils/markdown.js` separa front matter e corpo e converte Markdown para HTML (titulos, listas, tabelas, codigo).
3) O HTML pronto e injetado em `src/pages/Article.js` via `dangerouslySetInnerHTML`.
4) O visual do conteudo vem de `src/App.css` (ex.: `.article-content table`, `.article-content pre`).
5) As datas sao formatadas por `src/utils/articleUtils.js`.
6) Meta tags e JSON-LD sao montados a partir do front matter.

## Dicas e cuidados
- Evite caracteres especiais no nome do arquivo (use apenas letras, numeros e `-`).
- Prefira datas no formato `YYYY-MM-DD` para evitar erros de fuso.
- Mantenha o `summary` curto (1-2 linhas).
- Se o artigo nao aparecer, verifique se o `slug` bate com o nome do arquivo.

## Checklist final
- [ ] Arquivo em `src/articles/`
- [ ] `slug` correto no nome do arquivo (ou no front matter)
- [ ] `publishedAt` no formato certo
- [ ] Conteudo validado no navegador

Pronto. Com isso, a publicacao fica simples, leve e consistente com o resto do site.
