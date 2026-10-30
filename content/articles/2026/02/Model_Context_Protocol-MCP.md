---
title: "Model Context Protocol (MCP): arquitetura, funcionamento e limites"
summary: "Como hosts, clientes e servidores MCP trocam contexto e executam operações: transportes, primitivas, ciclo de vida, sampling, segurança e decisões de implementação."
author: "Guilherme Portella"
publishedDate: "2026-02-07"
updatedDate: "2026-10-29"
keywords:
  - MCP
  - Model Context Protocol
  - LLM
  - JSON-RPC
  - Arquitetura
  - Segurança
seo:
  title: "MCP: arquitetura, funcionamento e limites"
  description: "Guia técnico de MCP com exemplos de resources, prompts, tools, sampling e controles de segurança."
  image: "/images/mcp_architecture.png"
  locale: "pt-BR"
---

# Model Context Protocol (MCP): arquitetura, funcionamento e limites

O Model Context Protocol (MCP) é um protocolo aberto para conectar aplicações de IA a dados e funcionalidades externas. Ele padroniza a descoberta de capacidades e a troca de mensagens entre clientes e servidores. Não substitui as APIs de negócio, não executa o modelo por conta própria e não torna uma integração segura apenas por ser adotado.

Este artigo usa a **revisão 2025-11-25 da especificação** como referência. Os exemplos são ilustrativos e não pressupõem que todo host ou SDK implemente todas as capacidades dessa revisão. A compatibilidade deve ser verificada entre as implementações utilizadas. [1–3]

## 1. Qual problema o MCP resolve?

Sem uma interface compartilhada, cada aplicação de IA precisa construir integrações próprias para descobrir ferramentas, representar seus argumentos e obter contexto. O MCP oferece um contrato comum para essa parte da comunicação.

Imagine um assistente de engenharia conectado a documentação, repositórios e incidentes. Um servidor pode oferecer documentos para leitura; outro, operações de consulta de incidentes; um terceiro, modelos de prompt para revisão de código. O host coordena como essas capacidades entram na interação com o usuário.

O ganho é reutilizar a interface de integração. Ainda é necessário implementar acesso às fontes, regras de negócio, permissões, tratamento de falhas e observabilidade. Se uma aplicação precisa chamar uma única API estável, uma integração direta pode ser mais simples e barata de operar.

## 2. Arquitetura: host, client e server

### Host

O host é a aplicação que coordena a experiência de IA: uma aplicação desktop, uma IDE ou um sistema próprio com suporte a MCP. Ele cria clientes MCP, controla conexões e permissões, agrega contexto e coordena o acesso ao modelo.

O modelo pode executar localmente ou em um provedor remoto. Portanto, o host não é necessariamente o lugar onde a inferência acontece. O servidor MCP também não deve receber automaticamente toda a conversa ou os dados de outros servidores. O host controla essas fronteiras. [1]

### Client

O cliente MCP é um componente do host responsável pela comunicação com um servidor específico. Ele negocia a versão e as capacidades, encaminha mensagens e administra a sessão e as notificações suportadas.

A relação lógica é **um cliente para um servidor**. Um host que utiliza dois servidores cria duas instâncias de cliente. Um servidor remoto pode, por sua vez, atender diversos clientes. Sessão lógica não significa necessariamente uma conexão TCP persistente. [1]

### Server

O servidor implementa as capacidades oferecidas pelo protocolo e as conecta à sua lógica interna. Pode expor dados, fornecer modelos de prompt e executar operações. Não precisa usar um LLM para cumprir esse papel.

SDKs ajudam a implementar esses componentes, mas não são componentes obrigatórios da arquitetura. É possível implementar o protocolo diretamente, assumindo o custo de manter sua conformidade.

![Arquitetura MCP: um host com dois clientes, cada um conectado a um servidor por um transporte diferente. As implementações dos servidores acessam sistemas externos.](/images/mcp_architecture.png)

*Figura 1 — Cada cliente mantém sua própria relação com um servidor. stdio e Streamable HTTP são alternativas de transporte; o exemplo utiliza servidores distintos para deixar essa separação explícita. As primitivas não possuem correspondência obrigatória com arquivos, bancos ou APIs.*

Para publicar em um site que armazena imagens em `/public/images`, copie a imagem para esse diretório e altere o endereço da figura para `/images/mcp_architecture.png`.

## 3. Mensagens e transportes

O MCP utiliza JSON-RPC 2.0 para representar requisições, respostas e notificações. Uma requisição possui identificador para correlacionar sua resposta; uma notificação não espera resposta JSON-RPC. Os métodos MCP definem o significado das mensagens; o transporte define como elas circulam. [2]

### stdio

No transporte stdio, o cliente inicia o servidor como subprocesso. O servidor lê mensagens em `stdin` e escreve respostas, requisições e notificações em `stdout`.

Cada mensagem é delimitada por uma quebra de linha. Quebras dentro de strings JSON precisam ser escapadas. **Logs devem ser enviados para `stderr`**, pois `stdout` é reservado às mensagens do protocolo. Um simples log no canal errado pode interromper a comunicação. [2]

Esse transporte evita a rede entre cliente e subprocesso, mas não elimina serialização, cópias de dados, processamento ou a latência de APIs acessadas pelo servidor. Não há garantia universal de melhor desempenho. O processo também consome recursos locais e precisa de gestão de dependências e permissões.

### Streamable HTTP

O Streamable HTTP permite que o servidor opere como serviço independente, inclusive em localhost. O cliente envia mensagens por POST ao endpoint MCP; o transporte também define GET para recepção de mensagens do servidor, com possibilidade de resposta 405 quando esse canal não é oferecido. SSE é opcional e permite transmitir mensagens ao cliente. [2]

SSE não significa, por si só, transmissão de tokens do LLM. Ele transporta mensagens MCP, que podem incluir respostas, notificações e requisições do servidor.

**Streamable HTTP substitui o transporte HTTP+SSE da revisão 2024-11-05.** SSE continua podendo ser usado no transporte mais novo; o transporte legado e Streamable HTTP não são sinônimos. [2]

| Decisão | stdio | Streamable HTTP |
|---|---|---|
| Execução | Subprocesso iniciado pelo cliente | Serviço independente, local ou remoto |
| Operação | Instalação e recursos por ambiente local | Hospedagem, rede e controle de acesso ao endpoint |
| Compartilhamento | Normalmente associado ao subprocesso daquele cliente | Pode atender múltiplos clientes |
| Custo relevante | Processos, memória e distribuição de dependências | Rede, hospedagem, autenticação e gestão de sessões quando adotadas |

Não escolha pelo rótulo “mais rápido”. Meça latência de ponta a ponta, concorrência esperada, tamanho de mensagens e tempo dos sistemas externos.

## 4. Resources, prompts e tools

Essas são as três principais primitivas oferecidas por servidores, não uma lista de todos os recursos do protocolo. Seu suporte depende das capacidades declaradas. [4–6]

| Primitiva | Responsabilidade | Exemplo |
|---|---|---|
| Resource | Expor conteúdo identificado por URI | Esquema de pagamentos em `banking://schemas/pagamentos` |
| Prompt | Fornecer mensagens parametrizadas | `revisar_integracao`, com argumentos sobre código e contexto |
| Tool | Executar uma operação com argumentos | `consultar_pagamento`, recebendo um identificador |

Um banco de dados pode fornecer conteúdo para um resource e ser consultado por uma tool. Uma tool pode ler arquivos; um prompt pode estar definido em código. A origem dos dados não determina a primitiva.

### Resources: conteúdo para contexto

Resources são identificados por URI e podem conter texto ou conteúdo binário codificado em base64. O cliente pode usar `resources/list` e `resources/read`. Templates de URI são descobertos por `resources/templates/list` e permitem representar famílias de recursos. [4]

O modelo de interação é descrito como *application-driven*: o host decide como incorporar o conteúdo, podendo considerar seleção do usuário ou sugestões do modelo. A especificação não impõe uma interface única.

Assinaturas e notificações são opcionais. `resources/subscribe` depende de suporte anunciado; mudanças de catálogo e de conteúdo usam notificações distintas. **Não se deve prometer que qualquer alteração será comunicada, entregue ou processada em tempo real.**

A URI também não autoriza acesso direto ao sistema correspondente. Uma URI `file://` anunciada por um servidor não concede acesso irrestrito ao disco do usuário.

### Prompts: mensagens reutilizáveis

O cliente descobre modelos com `prompts/list` e obtém suas mensagens com `prompts/get`, fornecendo os argumentos necessários. O padrão de interação é *user-controlled*, como um comando de revisão selecionado pelo usuário, sem obrigatoriedade de uma interface específica. [5]

Obter um prompt não executa automaticamente uma inferência. O host recebe as mensagens e decide como utilizá-las. Texto, imagens, áudio e recursos incorporados podem compor essas mensagens.

### Tools: operações executadas pelo servidor

O cliente descobre ferramentas com `tools/list` e solicita execução com `tools/call`. Cada ferramenta possui nome, descrição e `inputSchema`; pode também declarar `outputSchema` para resultados estruturados. [6]

O termo *model-controlled* indica que o modelo pode selecionar ferramentas no fluxo da aplicação. Na execução concreta, o modelo propõe a chamada, o host aplica suas políticas, o cliente envia a mensagem e o servidor valida e executa a operação.

Exemplo de requisição após a inicialização:

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "consultar_pagamento",
    "arguments": {
      "pagamentoId": "pg-123"
    }
  }
}
```

Exemplo de resposta:

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Pagamento pg-123 liquidado."
      }
    ],
    "structuredContent": {
      "pagamentoId": "pg-123",
      "status": "LIQUIDADO"
    },
    "isError": false
  }
}
```

`structuredContent` não exige que exista `outputSchema`, mas, se declarado, o resultado estruturado deve respeitá-lo. Conteúdo de ferramentas deve ser tratado como dado externo, não como instrução privilegiada.

A especificação recomenda participação humana com capacidade de negar chamadas. Isso não estabelece confirmação manual obrigatória para toda operação. Leituras e operações destrutivas podem receber políticas diferentes, sem dispensar autorização no servidor. [6]

## 5. Ciclo de vida e capacidades

A conexão passa por inicialização, operação e encerramento. O fluxo básico é: [3]

1. O cliente envia `initialize`, informando versão do protocolo, capacidades e identificação da implementação.
2. O servidor responde com a versão e as capacidades que suporta.
3. Se a versão retornada não for suportada pelo cliente, ele deve encerrar a conexão.
4. Após a inicialização bem-sucedida, o cliente envia `notifications/initialized`.
5. Durante a operação, utiliza as funcionalidades anunciadas e encerra a comunicação conforme o transporte.

Capacidades não são permissões de negócio. Anunciar suporte a tools não autoriza um usuário a acessar pagamentos de qualquer cliente. Compatibilidade de protocolo e autorização de dados são verificações separadas.

Notificações de alteração de catálogo também dependem do suporte declarado. Uma implementação não deve presumir que todos os servidores oferecem resources, prompts, tools ou notificações.

## 6. Sampling: o servidor solicita uma geração

Sampling permite ao servidor enviar `sampling/createMessage` ao cliente para solicitar uma geração de modelo. O cliente precisa ter declarado a capability `sampling`. Ele controla o acesso ao modelo, a escolha efetiva e as permissões. Preferências informadas pelo servidor são sugestões, não ordens. [7]

Por exemplo: durante uma análise de incidentes, o servidor reúne registros e solicita uma síntese ao cliente. O host avalia a solicitação, utiliza um modelo permitido e devolve o resultado. Isso dispensa credenciais próprias do provedor de modelo no servidor **para esse fluxo**; não elimina credenciais necessárias para bancos e APIs.

Sampling é opcional e não é requisito para construir agentes. O host pode realizar suas próprias chamadas ao modelo. Também há custo: inferências aninhadas acrescentam latência, consumo de tokens e risco de ciclos. Defina orçamento e limites de profundidade.

Na revisão adotada, uso de ferramentas dentro de sampling depende ainda da capability `sampling.tools`. A especificação recomenda revisão humana de solicitações e respostas, sem impor uma interface única. [7]

## 7. Segurança: protocolo não substitui controles

### Autenticação e autorização

Autenticação verifica identidade; autorização determina o que uma entidade pode fazer. OAuth é um framework de autorização. A especificação MCP define um fluxo de autorização para transportes HTTP baseado em OAuth, incluindo descoberta e uso de access tokens. [8]

API keys podem existir em soluções específicas, mas não equivalem a implementar esse fluxo interoperável. Em stdio, a orientação é obter credenciais do ambiente, em vez de aplicar o fluxo HTTP. Isso não torna seguro executar qualquer pacote local.

No servidor, valide permissões por operação, recurso e tenant. Um token válido não autoriza todas as ações. Tokens recebidos para um servidor MCP não devem ser simplesmente repassados a APIs de terceiros; respeite audiência, escopos e os fluxos próprios dessas APIs. [8–9]

### Controles práticos

- Trate descrições de ferramentas, documentos e resultados como conteúdo não confiável. Validar JSON não impede prompt injection.
- Valide argumentos e regras de negócio antes de executar; use consultas parametrizadas e restrinja caminhos, URLs e comandos aceitos.
- Em HTTP, valide `Origin` conforme a especificação. Para execução local, prefira escuta em localhost; para comunicação remota, proteja o tráfego com TLS.
- Aplique quotas, limites de concorrência e rate limiting no servidor ou gateway. Controles apenas no cliente não impedem outros clientes de sobrecarregar o serviço.
- Restrinja credenciais e dados ao mínimo necessário. Revise origem, dependências e permissões de servidores locais antes de executá-los.

Esses controles reduzem riscos como SSRF, exfiltração, comprometimento local e abuso de privilégios; não constituem garantia absoluta de segurança. [2, 9]

## 8. Falhas, desempenho e custo operacional

Um timeout informa que o cliente não obteve a conclusão dentro do prazo. **Não prova que a operação falhou no sistema externo.** Se uma ferramenta criou um pagamento antes da perda de comunicação, repetir a chamada pode duplicar o efeito.

Para operações de escrita, defina idempotência e consulta de estado ou reconciliação. Um identificador JSON-RPC correlaciona mensagens; não é, por si só, chave de idempotência de negócio. Cancelamento também não deve ser tratado como rollback garantido.

Separe erros do protocolo de falhas da ferramenta. Uma operação conhecida que falhou durante sua execução pode retornar um resultado com `isError: true`; isso é diferente de uma mensagem JSON-RPC inválida. O host precisa lidar com ambos. [6]

Mensure separadamente inferência, transporte MCP, execução da ferramenta e dependências externas. Registre duração, taxa de erro, timeouts e volume de dados, sem registrar segredos ou dados pessoais desnecessários.

Catálogos extensos, documentos grandes e binários em base64 aumentam transferência, memória e custo de contexto quando enviados ao modelo. Prefira seleção de conteúdo relevante e paginação quando suportada. Repetir contexto indiscriminadamente pode custar mais do que o transporte em si.

Essas são recomendações de engenharia para a implementação; não são garantias fornecidas pelo protocolo.

## 9. Quando adotar

MCP tende a ser útil quando várias aplicações precisam consumir capacidades reutilizáveis, ou quando descoberta padronizada e integração com hosts compatíveis justificam o custo operacional.

Uma chamada direta a uma API pode ser melhor quando o contrato é pequeno, fixo e usado por uma única aplicação. MCP também não substitui um workflow determinístico quando a sequência e as condições de execução precisam ser controladas pelo negócio.

Um primeiro exercício útil é implementar uma tool de consulta sem efeitos externos, adicionar validação e autorização e testar com um host compatível. Depois, introduza resources e prompts apenas se houver necessidade. Para escritas, teste também perda de resposta após execução, duplicidade e reconciliação.

O valor do MCP está no contrato compartilhado. A qualidade da solução continua dependendo dos limites de acesso, do comportamento sob falha e das decisões de operação.

## Referências

Todas as referências normativas abaixo apontam para a revisão 2025-11-25, evitando misturar requisitos de versões diferentes.

1. [Architecture](https://modelcontextprotocol.io/specification/2025-11-25/architecture).
2. [Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).
3. [Lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle).
4. [Resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources).
5. [Prompts](https://modelcontextprotocol.io/specification/2025-11-25/server/prompts).
6. [Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).
7. [Sampling](https://modelcontextprotocol.io/specification/2025-11-25/client/sampling).
8. [Authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization).
9. [Security Best Practices](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices).
