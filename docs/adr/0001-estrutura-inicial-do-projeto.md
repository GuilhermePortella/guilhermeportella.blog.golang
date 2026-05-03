# ADR 0001: Estrutura inicial do projeto de blog em Go

## Status

Aceita

## Data

2026-05-03

## Contexto

O projeto precisa nascer como uma base solida para um site estilo blog em Go, usando recursos modernos da linguagem e boas praticas de organizacao, seguranca, manutencao e evolucao.

Neste momento, o objetivo nao e criar paginas web, layout visual, templates HTML ou funcionalidades de publicacao. O foco e preparar uma fundacao tecnica limpa para que o projeto possa crescer depois com menos retrabalho.

As necessidades iniciais sao:

- organizar o codigo com fronteiras claras;
- manter o bootstrap simples e auditavel;
- evitar dependencias externas prematuras;
- preparar pontos de extensao para conteudo, assets, templates, banco de dados e documentacao arquitetural;
- criar um servidor HTTP com timeouts, logs estruturados, graceful shutdown e middlewares basicos de seguranca;
- criar contratos iniciais do dominio de blog sem escolher ainda uma persistencia definitiva.

## Decisao

Foi escolhida uma estrutura baseada em um binario principal em `cmd/blog`, codigo interno em `internal/`, documentacao arquitetural em `docs/adr`, conteudo futuro em `content/posts`, recursos web futuros em `web/` e espacos separados para configuracoes, migracoes e scripts.

Tambem foi decidido iniciar o projeto usando apenas a biblioteca padrao do Go. Isso reduz a superficie de ataque, evita acoplamento cedo demais com frameworks e deixa a arquitetura mais facil de entender antes de adicionar banco de dados, renderizacao, cache, autenticacao ou bibliotecas de roteamento.

O projeto usa Go `1.26.2`, conforme o ambiente local e a versao estavel disponivel no momento da criacao.

## Consequencias

Beneficios:

- a base e pequena, facil de auditar e facil de testar;
- as responsabilidades principais ja estao separadas;
- o servidor nasce com timeouts e encerramento gracioso;
- o dominio de blog ja possui tipos e contratos, mas ainda nao depende de banco ou filesystem;
- a estrutura permite evoluir para blog estatico, CMS simples, banco relacional, SQLite, PostgreSQL ou outro backend sem reescrever a entrada da aplicacao.

Custos:

- algumas pastas existem como pontos de extensao e ainda nao possuem implementacao real;
- nao ha renderizacao de paginas, painel administrativo, persistencia ou leitura de posts neste momento;
- a ausencia inicial de framework exige que futuras decisoes de roteamento, templates e middleware sejam documentadas quando forem tomadas.

## Alternativas consideradas

### Framework web completo

Um framework poderia acelerar certas funcionalidades, mas tambem adicionaria dependencias e convencoes antes de existir clareza sobre as necessidades reais do blog.

### Projeto totalmente flat

Manter todos os arquivos na raiz ou em poucos pacotes seria simples no primeiro dia, mas dificultaria a separacao de responsabilidades quando conteudo, templates, persistencia, cache e administracao fossem adicionados.

### Gerador estatico puro

Um gerador estatico pode ser uma boa direcao futura, mas ainda assim e util ter uma base Go organizada para comandos, validacao, renderizacao, build e publicacao.

## Inventario da estrutura

### Raiz do projeto

#### `.editorconfig`

Define regras basicas de edicao compartilhadas entre editores e IDEs.

Responsabilidades:

- padronizar fim de linha como `lf`;
- manter charset `utf-8`;
- inserir linha final;
- remover espacos finais;
- usar tabs em arquivos Go, acompanhando o padrao do `gofmt`;
- usar tabs em `Makefile`, como exigido pela sintaxe de make.

Esse arquivo reduz diferencas artificiais em diffs e evita problemas de formatacao entre ambientes.

#### `.env.example`

Documenta as variaveis de ambiente reconhecidas pela aplicacao.

Responsabilidades:

- servir como referencia para configuracao local;
- listar valores seguros para desenvolvimento;
- explicitar timeouts HTTP;
- declarar caminhos futuros para conteudo, assets e templates.

O projeto nao carrega `.env` automaticamente porque isso exigiria dependencia externa. A aplicacao le configuracoes diretamente do ambiente do processo.

#### `.gitignore`

Define arquivos e diretorios que nao devem ser versionados.

Responsabilidades:

- ignorar arquivos locais do sistema, como `.DS_Store`;
- impedir versionamento acidental de `.env` e variantes com segredos;
- ignorar artefatos de build, como `bin/`, `dist/` e `tmp/`;
- ignorar arquivos de cobertura, profiling e logs.

#### `Makefile`

Fornece atalhos para tarefas comuns de desenvolvimento.

Responsabilidades:

- `make fmt`: formatar codigo Go;
- `make vet`: rodar analise estatica basica;
- `make test`: executar testes com detector de corrida;
- `make run`: iniciar o servidor local;
- `make build`: gerar binario otimizado em `bin/`;
- `make clean`: remover artefatos locais.

O `Makefile` nao substitui os comandos Go originais. Ele apenas padroniza atalhos convenientes.

#### `README.md`

Documento de entrada do projeto.

Responsabilidades:

- explicar rapidamente o objetivo da estrutura;
- listar requisitos;
- mostrar comandos essenciais;
- resumir a organizacao das pastas;
- indicar as rotas tecnicas existentes;
- deixar claro que nenhuma pagina HTML foi criada.

O README deve continuar curto e pratico. Decisoes arquiteturais detalhadas devem ir para `docs/adr/`.

#### `SECURITY.md`

Documento inicial de seguranca.

Responsabilidades:

- registrar escolhas conservadoras ja presentes na base;
- lembrar temas que precisam de politica antes da publicacao;
- orientar futuras decisoes sobre segredos, dependencias, backups, autenticacao administrativa, spam e monitoramento.

Ele nao substitui uma politica completa de seguranca, mas cria um ponto formal para evolucao.

#### `go.mod`

Define o modulo Go do projeto.

Responsabilidades:

- declarar o caminho do modulo;
- fixar a versao de Go usada no bootstrap;
- permitir builds, testes e organizacao de pacotes pelo Go toolchain.

Como nao ha dependencias externas, nao existe `go.sum` neste momento.

## Diretorios e arquivos Go

### `cmd/`

Diretorio reservado para pontos de entrada executaveis.

Em Go, `cmd/<nome>` e uma convencao comum para separar binarios da logica interna. Isso permite adicionar futuramente outros comandos, como importadores, geradores, jobs ou ferramentas de manutencao.

### `cmd/blog/`

Contem o binario principal do site.

#### `cmd/blog/main.go`

Ponto de entrada da aplicacao.

Responsabilidades:

- carregar configuracao;
- criar logger estruturado;
- montar o roteador HTTP;
- criar o servidor;
- escutar sinais de encerramento (`SIGINT` e `SIGTERM`);
- executar graceful shutdown com timeout;
- retornar erros de inicializacao ou execucao de forma clara.

Esse arquivo deve permanecer fino. Ele orquestra componentes, mas nao deve concentrar regra de negocio, acesso a dados ou renderizacao.

### `internal/`

Diretorio para codigo privado da aplicacao.

Pacotes dentro de `internal/` nao podem ser importados por outros modulos Go fora deste projeto. Essa restricao e aplicada pelo proprio compilador Go e ajuda a preservar fronteiras internas.

### `internal/blog/`

Pacote do dominio de blog.

Responsabilidades:

- representar conceitos centrais do blog;
- declarar contratos de repositorio;
- concentrar validacoes e casos de uso do dominio;
- evitar dependencia de HTTP, banco de dados ou detalhes de infraestrutura.

#### `internal/blog/post.go`

Define a entidade inicial `Post`.

Responsabilidades:

- declarar campos centrais de um post, como `ID`, `Slug`, `Title`, `Excerpt`, `Body`, `Tags`, `PublishedAt` e `UpdatedAt`;
- validar dados obrigatorios basicos;
- manter regras simples proximas do conceito que elas protegem.

Esse arquivo prepara o dominio para receber validacoes mais ricas depois, como slug canonico, estado de publicacao, autor, idioma, SEO e revisoes.

#### `internal/blog/repository.go`

Define o contrato de persistencia de posts.

Responsabilidades:

- declarar `Repository`;
- expor `ListPublished`;
- expor `FindBySlug`;
- declarar `ErrPostNotFound`.

Esse contrato permite trocar a origem dos posts sem alterar o dominio ou o transporte HTTP. Uma implementacao futura pode ler Markdown, banco SQL, arquivo JSON, API externa ou cache.

#### `internal/blog/service.go`

Define o servico inicial de blog.

Responsabilidades:

- receber um `Repository`;
- validar que o repositorio foi fornecido;
- expor operacoes de leitura de posts publicados;
- normalizar entradas simples, como slug em branco;
- manter casos de uso fora dos handlers HTTP.

Esse servico e o ponto natural para futuras regras de negocio, como filtros por tag, paginacao, drafts, posts relacionados e politicas de visibilidade.

### `internal/config/`

Pacote de configuracao da aplicacao.

Responsabilidades:

- ler variaveis de ambiente;
- aplicar valores padrao;
- converter tipos;
- validar configuracoes antes do servidor iniciar.

#### `internal/config/config.go`

Implementa a configuracao principal.

Responsabilidades:

- definir `Config`, `AppConfig`, `HTTPConfig` e `PathConfig`;
- ler ambiente com `Load`;
- validar valores com `Validate`;
- montar endereco HTTP com `HTTPConfig.Address`;
- converter booleanos, inteiros e duracoes de forma explicita.

A validacao falha cedo quando alguma configuracao invalida e encontrada, evitando que o servidor suba em estado parcial ou perigoso.

#### `internal/config/config_test.go`

Testa o comportamento da configuracao.

Responsabilidades:

- garantir que os valores padrao funcionam;
- garantir que configuracoes customizadas sao aplicadas;
- garantir que portas invalidas sao rejeitadas.

Esses testes protegem o bootstrap da aplicacao, que e uma area critica porque falhas aqui impedem o site de iniciar corretamente.

### `internal/platform/`

Diretorio para adaptadores e utilitarios de infraestrutura compartilhados.

Ele deve conter codigo que da suporte a aplicacao, mas nao pertence diretamente ao dominio de blog nem ao transporte HTTP.

### `internal/platform/logger/`

Pacote de logging.

#### `internal/platform/logger/logger.go`

Cria o logger estruturado da aplicacao usando `log/slog`.

Responsabilidades:

- escolher nivel de log conforme ambiente e debug;
- usar formato texto em desenvolvimento;
- usar formato JSON fora de desenvolvimento;
- adicionar atributos globais, como servico e ambiente.

Logs estruturados facilitam observabilidade, busca e integracao futura com plataformas de monitoramento.

### `internal/server/`

Pacote responsavel pelo ciclo de vida do servidor HTTP.

#### `internal/server/server.go`

Encapsula `http.Server`.

Responsabilidades:

- configurar endereco;
- aplicar timeouts de leitura, escrita, cabecalho e conexao idle;
- iniciar `ListenAndServe`;
- tratar `http.ErrServerClosed` como encerramento normal;
- executar shutdown com contexto.

Separar esse codigo evita que `main.go` fique carregado de detalhes operacionais.

### `internal/transport/`

Diretorio reservado para interfaces de entrada e saida ligadas a transporte.

Neste momento existe apenas HTTP, mas a separacao permite adicionar futuramente CLI, jobs, webhooks ou APIs distintas sem misturar com dominio.

### `internal/transport/http/`

Pacote de transporte HTTP.

Responsabilidades:

- registrar rotas;
- aplicar middlewares;
- responder endpoints tecnicos;
- proteger bordas HTTP sem misturar regra de negocio.

#### `internal/transport/http/router.go`

Monta o roteador principal.

Responsabilidades:

- criar `http.ServeMux`;
- registrar `GET /healthz`;
- registrar `GET /readyz`;
- aplicar a cadeia de middlewares.

O projeto usa o `ServeMux` moderno da biblioteca padrao, com padroes contendo metodo HTTP, evitando dependencia inicial de roteadores externos.

#### `internal/transport/http/health.go`

Implementa endpoints tecnicos de saude.

Responsabilidades:

- responder `GET /healthz`;
- responder `GET /readyz`;
- serializar respostas JSON;
- manter as respostas simples e adequadas para probes locais, containers ou balanceadores.

Essas rotas nao sao paginas do blog. Elas existem para operacao e diagnostico.

#### `internal/transport/http/middleware.go`

Implementa middlewares HTTP.

Responsabilidades:

- adicionar headers basicos de seguranca;
- criar ou reaproveitar `X-Request-ID`;
- recuperar panics e responder erro interno;
- registrar logs por requisicao;
- capturar status code e bytes escritos;
- extrair IP remoto.

Os headers de seguranca estao em postura restritiva porque ainda nao ha paginas, CSS, scripts ou imagens servidos pelo projeto.

#### `internal/transport/http/request_context.go`

Guarda e recupera o request ID no contexto da requisicao.

Responsabilidades:

- adicionar request ID ao `context.Context`;
- recuperar request ID em logs e middlewares;
- evitar chaves de contexto baseadas em strings publicas.

#### `internal/transport/http/router_test.go`

Testa o roteador HTTP.

Responsabilidades:

- garantir que `/healthz` responde `200 OK`;
- garantir `Content-Type` JSON;
- garantir header de seguranca;
- garantir geracao de `X-Request-ID`;
- garantir `404 Not Found` para rota ausente.

Esses testes protegem o comportamento tecnico minimo do servidor.

## Diretorios de conteudo, web e operacao

### `content/`

Diretorio reservado para conteudo versionado.

Ele permite que o blog evolua para posts em Markdown, MDX-like, JSON, YAML ou outro formato sem misturar conteudo com codigo Go.

### `content/posts/`

Diretorio reservado para posts.

#### `content/posts/.gitkeep`

Arquivo placeholder para manter o diretorio versionado mesmo vazio.

Quando posts reais forem adicionados, este arquivo pode ser removido se nao for mais necessario.

### `web/`

Diretorio reservado para recursos web.

Ele foi criado para separar assets e templates do codigo Go, sem criar nenhuma pagina neste momento.

### `web/static/`

Diretorio reservado para arquivos estaticos futuros.

Exemplos futuros:

- CSS compilado;
- imagens;
- fontes;
- JavaScript minimo;
- arquivos gerados para publicacao.

#### `web/static/.gitkeep`

Arquivo placeholder para versionar o diretorio vazio.

### `web/templates/`

Diretorio reservado para templates futuros.

Exemplos futuros:

- layouts base;
- partials;
- templates de lista de posts;
- templates de post individual;
- templates de erro.

#### `web/templates/.gitkeep`

Arquivo placeholder para versionar o diretorio vazio.

### `migrations/`

Diretorio reservado para migracoes de banco de dados.

Ele existe mesmo sem banco escolhido porque deixa claro onde migracoes devem entrar caso o projeto evolua para SQLite, PostgreSQL ou outro armazenamento persistente.

#### `migrations/.gitkeep`

Arquivo placeholder para versionar o diretorio vazio.

### `configs/`

Diretorio reservado para configuracoes versionaveis.

Exemplos futuros:

- configuracoes por ambiente sem segredos;
- arquivos de deploy;
- parametros publicos de build;
- configuracoes de ferramentas.

Segredos nao devem ser colocados aqui.

#### `configs/.gitkeep`

Arquivo placeholder para versionar o diretorio vazio.

### `docs/`

Diretorio de documentacao tecnica.

Ele deve receber documentos que expliquem decisoes, convencoes e operacao do projeto sem sobrecarregar o README principal.

### `docs/adr/`

Diretorio de Architecture Decision Records.

ADRs registram decisoes arquiteturais importantes em formato historico. Cada arquivo deve explicar contexto, decisao, consequencias e alternativas relevantes.

#### `docs/adr/.gitkeep`

Arquivo placeholder criado inicialmente para versionar o diretorio vazio.

Com a existencia deste ADR, ele pode ser removido no futuro se desejado.

#### `docs/adr/0001-estrutura-inicial-do-projeto.md`

Este documento.

Responsabilidades:

- registrar por que a estrutura inicial foi escolhida;
- explicar consequencias e alternativas;
- documentar cada pasta e arquivo criados no bootstrap.

### `scripts/`

Diretorio reservado para automacoes locais.

Exemplos futuros:

- scripts de importacao de posts;
- scripts de geracao de assets;
- scripts de deploy;
- scripts de manutencao.

Scripts devem ser pequenos, auditaveis e documentados quando tiverem impacto operacional.

#### `scripts/.gitkeep`

Arquivo placeholder para versionar o diretorio vazio.

## Diretrizes futuras

Novas decisoes arquiteturais devem ganhar novos ADRs quando alterarem de forma relevante:

- persistencia de posts;
- formato de conteudo;
- estrategia de renderizacao;
- uso de cache;
- autenticacao administrativa;
- sistema de comentarios;
- pipeline de build e deploy;
- bibliotecas externas centrais;
- estrategia de observabilidade.

O README deve continuar sendo a porta de entrada rapida. Os ADRs devem guardar o raciocinio detalhado para que as decisoes continuem compreensiveis depois que o projeto crescer.
