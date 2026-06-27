# ADR 0005: Integracoes client-side com APIs publicas e CSP explicita

## Status

Aceita

## Data

2026-06-26

## Contexto

Algumas paginas do site funcionam como pequenas interfaces exploratorias sobre APIs publicas e midias externas. Exemplos atuais incluem:

- `/astronomia`, com dados APOD pregerados e eventos EONET da NASA;
- `/curiosidades/rick-and-morty` e aliases de `/rick-morty`, com dados da Rick and Morty API;
- embeds de Spotify e YouTube em areas especificas do site.

Essas paginas precisam ser interativas mesmo no site estatico, mas nao devem exigir um backend em producao nem expor chaves privadas no navegador.

## Decisao

Foi decidido colocar integracoes exploratorias no frontend quando elas puderem usar APIs publicas ou dados pregerados.

Cada integracao fica isolada em JavaScript proprio dentro de `web/static/js`, inicializada por atributos `data-*` no template da pagina. O HTML inicial continua renderizado por Go e deve conter estados de carregamento, `noscript` quando fizer sentido e regioes acessiveis para atualizacoes dinamicas.

APIs que exigem segredo nao devem receber a chave no browser. O caso APOD usa JSON gerado no export quando `NASA_API_KEY` esta disponivel; a pagina consome `/static/data/nasa/*.json`. Eventos EONET e Rick and Morty usam endpoints publicos diretamente.

A Content Security Policy fica centralizada no middleware HTTP e deve listar explicitamente as origens necessarias em `connect-src`, `img-src`, `media-src` e `frame-src`.

## Consequencias

Beneficios:

- o site estatico consegue oferecer experiencias interativas;
- cada pagina carrega apenas o JavaScript de que precisa;
- chaves privadas continuam fora do bundle entregue ao usuario;
- a CSP documenta e restringe as origens externas permitidas;
- os templates preservam uma experiencia minima de carregamento e fallback sem JavaScript.

Custos:

- mudancas em APIs externas podem quebrar widgets sem alteracao no backend;
- a CSP precisa ser atualizada junto com qualquer nova origem externa;
- paginas client-side precisam lidar com falhas de rede, cache e estados vazios;
- dados pregerados podem ficar defasados ate o proximo export.

## Alternativas consideradas

### Proxy backend para todas as APIs

Foi rejeitado para o deploy atual porque exigiria operar um servidor em producao, contrariando o fluxo estatico do GitHub Pages.

### Inserir chaves de API no frontend

Foi rejeitado por seguranca. Mesmo chaves de baixa criticidade nao devem ser publicadas quando o export consegue pregerar os dados.

### Remover integracoes dinamicas

Foi rejeitado porque essas paginas fazem parte da proposta exploratoria do site e podem funcionar bem com APIs publicas e CSP restrita.

## Diretrizes futuras

- Toda nova origem externa deve aparecer na CSP e nos testes de roteador quando for parte do contrato da pagina.
- Scripts de pagina devem usar atributos `data-*` para encontrar elementos, evitando acoplamento com estilos visuais.
- Dados sensiveis ou credenciais devem existir apenas no ambiente de build ou servidor, nunca em HTML, JS ou atributos `data-*`.
