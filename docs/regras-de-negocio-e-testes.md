# Mapa de regras de negócio e base de testes

O fluxo editorial em produção é `content/articles` e `content/notes` → validação
em `cmd/contentlint` → carregamento e preparação em `internal/transport/http` →
templates → exportação em `cmd/export`. O pacote `internal/blog` define um modelo
e um serviço, mas ainda não participa desse fluxo: seus testes não substituem os
testes do carregamento de Markdown.

## Arquivos relevantes

Prioridade P0 protege publicação, identidade e integridade do conteúdo; P1
protege apresentação e comportamento do leitor; P2 protege infraestrutura.

| Prioridade | Arquivos | Regras e proteção |
| --- | --- | --- |
| P0 | `cmd/contentlint/main.go` | Campos obrigatórios, corpo não vazio, datas, duplicidade de slugs normalizados entre subpastas. `main_test.go` e `publication_test.go`. |
| P0 | `internal/transport/http/markdown.go` | Leitura recursiva, slug explícito ou nome do arquivo, preferência de `publishedAt` sobre `publishedDate`, sanitização, links e assets. `markdown_test.go`, `router_test.go` e contratos de publicação. |
| P0 | `internal/transport/http/feed.go`, `blog.go` | Mesma identidade e metadados no feed e arquivo, ordem decrescente por instante, empates estáveis, busca por título/resumo/corpo. `blog_unit_test.go` e `publication_test.go`. |
| P0 | `cmd/export/main.go`, `seo.go`, `feed.go` | Rotas exportáveis, caminhos seguros, base path, canonical, sitemap, robots, RSS e política de dados NASA obrigatórios/opcionais. `main_test.go`, incluindo export completo e referências locais. |
| P1 | `internal/transport/http/notes.go` | Tag padrão `nota`, contagem por tag, ordenação, rótulos de data e 21 notas por página como configuração da interface. `notes_unit_test.go`, `router_test.go` e `publication_test.go`; paginação efetiva depende de JavaScript. |
| P1 | `internal/transport/http/blog_article.go` | Artigo individual, tempo de leitura e JSON-LD com valores padrão e sobrescritas. `blog_article_unit_test.go`, `publication_test.go` e contratos HTTP/export. |
| P1 | `internal/blog/post.go`, `service.go`, `repository.go` | ID/slug/título/data obrigatórios, rejeição de slug vazio, delegação com contexto e propagação de erros. `post_test.go` e `service_test.go`. |
| P1 | `web/static/js/site.js` | Busca e filtros de blog, filtros/paginação de notas e projetos, regras dos jogos, armazenamento e estados da interface. Os testes Go verificam contratos da página, mas não executam essas regras no navegador. |
| P1 | `web/static/js/nasa-apod-app.js`, `rick-and-morty-app.js` | Integrações no navegador, seleção de dados e estados de erro. Há contratos Go da página/export, sem cobertura direta da interação JavaScript. |
| P1 | `web/templates/`, `internal/transport/http/router.go`, `jogos.go`, `projetos.go`, `astronomia.go`, `curiosidades.go` | Rotas, aliases, conteúdo e atributos usados pela interface. `router_test.go` e export completo. |
| P2 | `internal/config/config.go`, `internal/server/server.go`, `internal/transport/http/{middleware,static,security,render}.go` | Configuração válida, ciclo HTTP, cabeçalhos, acesso a arquivos e falhas de renderização. Testes dos respectivos pacotes. |
| P2 | `web/static/service-worker.js` | Cache e atualização offline; a rota é testada, mas o ciclo de cache no navegador ainda precisa de testes próprios. |

## Base aplicada

Os testes novos usam a biblioteca padrão de Go e fixtures em `t.TempDir()`.
Não dependem dos textos reais do blog, da data atual, de credenciais ou de APIs
externas. Os testes existentes de rede usam servidores locais `httptest`.

- `cmd/contentlint/publication_test.go`: executa o lint e o carregamento público
  do feed sobre o mesmo conteúdo para detectar divergências entre os dois
  parsers. Cobre extensão `.MD`, subpastas, acentos, slug explícito e fallback,
  data YAML sem aspas, data legada e sua precedência. Também protege colisões
  entre slug do arquivo e slug explícito e datas nos limites do calendário.
- `internal/transport/http/publication_test.go`: protege ordenação por instante
  com fusos diferentes, estabilidade de empates e preservação da entrada,
  contagem de tags com fallback, limites do tempo de leitura e rejeição de
  coleções com YAML inválido sem devolver resultados parciais.
- `internal/blog/post_test.go`: verifica cada campo obrigatório isoladamente,
  evitando que a falta de outro campo esconda uma validação removida.
- `internal/blog/service_test.go`: verifica que contexto e erros do repositório
  chegam intactos através do serviço.
- `cmd/export/main_test.go`: o teste da política NASA usa diretórios temporários
  de artigos, notas e imagens. Isso evita renderizar o corpus editorial com
  detector de corrida para testar uma política de integração. Os testes
  dedicados ao export completo continuam verificando o conteúdo real. O teste
  de RSS também usa artigo temporário e verifica quantidade exata de itens e
  escape XML do resumo, além dos metadados e links já protegidos.

Estes testes caracterizam o comportamento atual. O tempo de leitura usa 200
palavras por minuto, arredonda para o inteiro mais próximo e tem mínimo de um
minuto. Tags `Go` e `go` são distintas, embora a ordenação ignore maiúsculas no
primeiro critério. Não foi introduzida uma regra de agendamento para datas futuras.

## Execução e critérios

```sh
# Validação editorial e análise estática
make content-lint
make fmt-check
make vet

# Suíte completa, incluindo os novos contratos, com detector de corrida
make test

# Repetição em ordem aleatória e limites de cobertura existentes
make test-shuffle
make cover-check
```

Os novos testes entram automaticamente em `go test ./...` e no `make ci`
existente. Os limites atuais permanecem HTTP 85%, configuração 90%, export 80%
e contentlint 85%. Cobertura mede execução, não a correção das regras: preservar
as asserções de comportamento é o critério principal. Não é necessário adicionar
framework, serviço externo nem alterar código de produção para esta base.

Se o cache Go local apresentar erros de preparação, use um cache isolado:
`GOCACHE="$PWD/tmp/go-test-cache" make test`. A suíte completa precisa de
permissão para abrir portas locais por causa dos servidores de teste.

## Lacunas que permanecem

Priorizar testes de navegador para busca combinada com filtros, paginação ao
trocar tags, falhas das APIs, jogadas válidas/inválidas e reinício dos jogos.
Usar respostas simuladas, relógio e aleatoriedade controlados. A presença de
HTML ou scripts em um teste Go não comprova esses comportamentos. Regras dos
jogos podem depois ser extraídas em módulos puros para testes unitários, com
testes de navegador cobrindo sua integração; essa refatoração não faz parte da
base aplicada aqui.

Há normalização de slugs e datas duplicada entre lint e runtime. Os contratos
novos reduzem o risco de divergência para os casos descritos, mas não demonstram
equivalência para toda entrada possível. Uma futura consolidação deve preservar
esses contratos e os limites arquiteturais existentes.
