# Evolucao e qualidade do projeto

Este documento registra intencoes de evolucao para o blog e criterios para manter a qualidade enquanto o projeto cresce. Ele nao substitui as ADRs: quando uma decisao arquitetural for tomada, ela deve ganhar uma ADR propria em `docs/adr/`.

## Visao

O projeto deve continuar sendo um site pessoal rapido, simples de publicar e facil de auditar, com Go cuidando da renderizacao, validacao de conteudo e export estatico para GitHub Pages.

A evolucao deve privilegiar:

- conteudo facil de escrever e revisar;
- rotas estaveis e amigaveis para SEO;
- HTML acessivel e progressivamente melhorado por JavaScript;
- baixo acoplamento com servicos externos;
- seguranca explicita para conteudo, assets e integracoes;
- testes pequenos, confiaveis e proximos do comportamento real.

## Principios de evolucao

### Simplicidade operacional

O deploy principal deve continuar funcionando como site estatico sempre que possivel. Novas funcionalidades que exigirem servidor em producao, banco de dados ou credenciais em runtime precisam justificar o custo operacional em uma ADR.

### Conteudo como contrato

Markdown, frontmatter, slugs, datas, tags e imagens fazem parte do contrato publico do site. Mudancas nesse contrato devem vir acompanhadas de validacao no `cmd/contentlint`, testes e exemplos no README quando afetarem o fluxo de publicacao.

### Progressive enhancement

Paginas devem entregar uma experiencia minima com HTML renderizado pelo servidor ou pelo export. JavaScript pode enriquecer a interface, mas nao deve ser a unica forma de entender a pagina quando houver conteudo editorial.

### Dependencias conscientes

Novas bibliotecas devem resolver um problema real, ter manutencao ativa e reduzir complexidade do projeto. Dependencias para conteudo, seguranca e renderizacao precisam ser revisadas com mais cuidado por afetarem a superficie publica do site.

### Seguranca por padrao

Conteudo Markdown deve continuar sanitizado, links e assets externos devem ser tratados explicitamente, e novas origens externas devem aparecer na CSP e em testes. Segredos nao devem chegar ao HTML, JavaScript ou atributos `data-*`.

## Frentes de melhoria

### Plataforma de conteudo

- Melhorar mensagens do `content-lint` para orientar o autor sobre como corrigir frontmatter, slugs e datas.
- Criar validacoes para imagens referenciadas nos artigos, incluindo arquivo inexistente, alt text vazio e caminhos quebrados.
- Adicionar testes de regressao para renderizacao de Markdown com imagens, tabelas, KaTeX, embeds e headings.
- Avaliar uma pagina de arquivo por tag, ano ou serie quando o volume de textos crescer.

### Experiencia e acessibilidade

- Validar paginas principais com testes automatizados de HTML e atributos acessiveis criticos.
- Manter navegacao, estados vazios, erros e fallbacks sem JavaScript como parte dos testes de handler/template.
- Criar uma rotina periodica de Lighthouse ou Pa11y para performance, acessibilidade, SEO e boas praticas.
- Garantir que novas paginas tenham titulo, descricao, canonical, navegacao ativa e conteudo principal bem identificado.

### Export estatico e SEO

- Fortalecer testes do `cmd/export` para links internos, sitemap, robots, feed RSS e reescrita de caminhos com `SITE_BASE_PATH`.
- Validar que rotas publicas importantes continuam exportadas antes do deploy.
- Adicionar verificacao de links internos quebrados no artefato `dist/`.
- Documentar politica para redirects ou aliases quando rotas antigas forem substituidas.

### Qualidade de codigo

- Manter handlers finos, com preparacao de dados testavel em funcoes separadas.
- Evitar logica de dominio em templates; templates devem receber dados ja normalizados.
- Preferir testes unitarios para transformacoes puras e testes de handler para contratos HTTP e HTML essencial.
- Refatorar `cmd/blog` apenas quando houver necessidade real de testar o ciclo de bootstrap sem fragilidade.
- Acompanhar cobertura por pacote critico, sem perseguir 100% global quando isso gerar testes artificiais.

### Seguranca

- Continuar rodando `make security`, `make semgrep` e `make zap` em rodadas periodicas.
- Revisar CSP sempre que uma pagina nova usar API, imagem, iframe, audio ou video externo.
- Manter `SECURITY.md` atualizado quando surgirem formularios, comentarios, autenticacao ou qualquer entrada de usuario.
- Validar dependencias com Dependabot, `govulncheck` e revisao humana antes de atualizar libs ligadas a HTML/Markdown.

### Observabilidade local

- Padronizar logs de erro relevantes nos handlers sem expor dados sensiveis.
- Avaliar metricas simples apenas se o projeto passar a rodar como servidor em producao.
- Para GitHub Pages, priorizar validacoes de build/export, ja que nao ha processo backend observavel em runtime.

## Guardrails de qualidade

Antes de abrir PR ou publicar uma mudanca relevante, rode:

```sh
make ci
```

Para mudancas em conteudo:

```sh
make content-lint
make export
```

Para mudancas em handlers, Markdown, templates, export ou seguranca:

```sh
make test
make cover-check
make security
```

Para rodadas periodicas ou antes de mudancas maiores:

```sh
make test-shuffle
make semgrep
make zap
```

## Criterios para novas funcionalidades

Uma nova funcionalidade deve responder:

- Qual problema do site ou do autor ela resolve?
- Ela precisa funcionar no export estatico?
- Ela exige nova dependencia, origem externa ou credencial?
- Como ela falha quando a rede, API externa ou JavaScript nao esta disponivel?
- Quais testes protegem o comportamento essencial?
- A decisao precisa de uma ADR?

## Indicadores saudaveis

Sinais de que o projeto esta evoluindo bem:

- `make ci` continua sendo o caminho principal de validacao.
- Pacotes criticos mantem cobertura minima configurada em `make cover-check`.
- Conteudo novo falha cedo quando frontmatter, datas, slugs ou links estao invalidos.
- Novas origens externas sao documentadas na ADR/CSP/testes.
- Templates continuam simples e orientados a dados preparados em Go.
- O export estatico continua reproduzindo as rotas publicas esperadas.

## Proximos passos sugeridos

1. Adicionar validacao de imagens locais referenciadas em Markdown.
2. Criar teste de links internos no `dist/` apos `make export`.
3. Elevar gradualmente `COVER_HTTP_MIN` quando os handlers com menor cobertura ganharem testes uteis.
4. Adicionar checagem automatizada de acessibilidade para paginas principais.
5. Documentar uma politica de aliases e redirects para rotas antigas.
