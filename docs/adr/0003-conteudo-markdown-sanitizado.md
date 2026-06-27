# ADR 0003: Conteudo Markdown com frontmatter e HTML sanitizado

## Status

Aceita

## Data

2026-06-26

## Contexto

O projeto deixou de ser apenas uma estrutura de blog e passou a publicar artigos longos e notas curtas versionados no repositorio.

As necessidades atuais sao:

- escrever artigos em Markdown dentro de `content/articles`;
- escrever notas curtas em Markdown dentro de `content/notes`;
- manter metadados editoriais e de SEO em YAML Front Matter;
- renderizar Markdown com recursos de escrita tecnica, como GFM, tabelas, quebras de linha, headings com ids, imagens, videos, emojis e formulas matematicas;
- evitar que HTML arbitrario no conteudo vire uma superficie ampla de XSS;
- validar conteudo antes de publicar, incluindo frontmatter, datas, slugs duplicados e corpo minimo.

## Decisao

Foi decidido tratar Markdown como a fonte de conteudo editorial do site.

Artigos ficam em `content/articles/**/*.md` e geram paginas em `/blog/{slug}`. Notas ficam em `content/notes/**/*.md` e alimentam `/notas`.

O pipeline de leitura e renderizacao fica em `internal/transport/http/markdown.go`, compartilhado pelos handlers de blog, artigo e notas. O frontmatter e lido com `gopkg.in/yaml.v3`; o Markdown e renderizado com `goldmark`, extensao GFM e KaTeX; o HTML final passa por sanitizacao com `bluemonday` antes de ser enviado aos templates como `template.HTML`.

O comando `cmd/contentlint` valida os arquivos Markdown e e chamado pelo `make content-lint` e pelo `make ci`.

## Consequencias

Beneficios:

- conteudo editorial fica versionado junto do site;
- artigos e notas podem evoluir sem recompilar regras no codigo Go;
- slugs e metadados de SEO podem ser declarados por arquivo;
- o site consegue publicar textos tecnicos mais ricos do que Markdown basico;
- a sanitizacao cria uma fronteira clara antes do uso de `template.HTML`;
- o lint reduz erros de publicacao antes do export ou deploy.

Custos:

- o projeto passou a ter dependencias externas para YAML, Markdown, sanitizacao e renderizacao de formulas;
- a politica de HTML permitido precisa ser mantida quando novos elementos forem usados nos textos;
- a busca e a listagem ainda leem arquivos do filesystem em tempo de requisicao no servidor local;
- validacoes editoriais novas devem ser adicionadas no `cmd/contentlint`, nao apenas nos handlers.

## Alternativas consideradas

### HTML escrito manualmente

Foi rejeitado porque aumentaria o custo de escrita, misturaria conteudo com apresentacao e dificultaria validar metadados.

### Banco de dados ou CMS

Foi adiado porque o site atual e versionado, pequeno e publicado como estatico no GitHub Pages. Um CMS adicionaria operacao e persistencia antes de existir essa necessidade.

### Markdown sem HTML permitido

Foi considerado mais simples, mas limitaria imagens, midias e trechos tecnicos ja usados nos artigos. A decisao foi permitir HTML controlado e sanitizado.

## Diretrizes futuras

- Novos campos de frontmatter devem ser documentados no README e cobertos por testes ou pelo `contentlint`.
- Mudancas na sanitizacao devem ser conservadoras e acompanhadas de testes com exemplos reais de conteudo.
- O dominio `internal/blog` ainda representa contratos iniciais e nao deve receber detalhes de Markdown ou HTML de apresentacao sem uma nova decisao.
