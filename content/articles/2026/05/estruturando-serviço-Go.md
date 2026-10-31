---
title: "Estruturando um serviço Go para crescer com segurança"
summary: "Uma visão prática sobre organização de pacotes, configuração, transporte HTTP e pontos de extensão, mantendo a estrutura proporcional às necessidades da aplicação."
author: "Guilherme Portella"
publishedAt: "2026-05-03"
tags:
  - Go
  - arquitetura
keywords:
  - backend
  - templates
  - HTTP
---

## Um começo que não precisa correr

Um serviço Go pequeno costuma começar com poucas rotas, algumas consultas e um logger. Nesse momento, quase tudo cabe no mesmo arquivo, e isso nem sempre é um problema. Com pouco comportamento para entender, a proximidade ajuda.

A dificuldade aparece quando decisões provisórias começam a sustentar o restante da aplicação. O handler passa a consultar o banco, escolher quais publicações estão disponíveis e preparar os dados do template. Uma alteração simples começa a exigir atenção a partes que, em princípio, não deveriam estar envolvidas.

É nesse ponto que organizar o código ganha um propósito concreto: limitar o que precisamos conhecer e modificar para realizar uma mudança.

## Separar responsabilidades sem antecipar o sistema inteiro

Em uma aplicação de blog, o transporte HTTP precisa interpretar a requisição e produzir uma resposta. Isso inclui ler parâmetros, validar sua representação e traduzir resultados para códigos de status ou páginas.

Já as regras que determinam se uma publicação está disponível pertencem ao comportamento da aplicação. Se um texto só pode aparecer depois da data de publicação, essa regra precisa continuar válida mesmo que amanhã ele seja consultado por uma tarefa agendada ou por outro transporte.

A infraestrutura cuida dos mecanismos usados para realizar esse trabalho: ler arquivos Markdown, consultar um banco ou acessar um CMS.

Essa separação pode começar pequena. Não exige criar uma camada para cada função nem introduzir interfaces para todas as estruturas. Exige observar quais responsabilidades estão se misturando e quais dependências precisam de um limite.

## Uma organização possível

Para esse serviço, uma estrutura inicial poderia distribuir o código assim:

- `cmd/blog/`: ponto de entrada e montagem da aplicação;
- `internal/blog/`: tipos, operações e regras relacionadas às publicações;
- `internal/transport/http/`: handlers, rotas e tradução dos resultados para HTTP;
- `internal/storage/markdown/`: leitura e interpretação das publicações em arquivos;
- `web/templates/` e `web/static/`: arquivos de apresentação.

Essa estrutura é uma possibilidade. Em uma aplicação menor, menos pacotes podem ser suficientes.

`cmd/` é uma convenção de organização, enquanto diretórios chamados `internal` recebem restrições de importação aplicadas pelas ferramentas do Go. Isso protege um limite de acesso ao código, mas não garante que os módulos internos tenham responsabilidades bem definidas.

O critério mais útil é a responsabilidade de cada pacote. `internal/blog` deveria representar algo reconhecível no negócio, em vez de virar uma coleção de interfaces desconectadas. Da mesma forma, nomes genéricos como `utils`, `common` ou `helpers` merecem atenção quando começam a reunir código sem uma responsabilidade comum.

As pastas ajudam a localizar o código. Os limites dependem de como os pacotes se relacionam.

> A estrutura começa a ajudar quando uma mudança pode ser entendida sem exigir conhecimento de todos os detalhes da aplicação.

## Interfaces quando existe uma dependência para limitar

Se as operações do blog precisam consultar publicações, um contrato pequeno pode representar essa necessidade. Considerando `Post` como um tipo da aplicação e o pacote `context` importado:

```go
type Repository interface {
    ListPublished(ctx context.Context) ([]Post, error)
    FindBySlug(ctx context.Context, slug string) (Post, error)
}
```

O valor desse contrato está em permitir que o código consumidor dependa das operações de que precisa, sem conhecer os detalhes da persistência.

Ainda assim, os nomes deixam perguntas abertas. O que acontece quando o slug não existe? A listagem possui uma ordenação definida? `FindBySlug` pode retornar um rascunho? Quem determina se uma publicação agendada já está disponível?

Essas decisões também fazem parte do contrato. A assinatura descreve como chamar uma operação; seu comportamento define o que o restante do sistema pode esperar dela.

Em Go, a interface pode ficar próxima de quem a consome. Se apenas uma operação precisa buscar publicações por slug, talvez ela dependa de uma interface menor, com somente esse método. Não é necessário criar antecipadamente um repositório capaz de atender a todos os usos futuros.

O `context.Context` permite propagar cancelamento e prazos para operações que os respeitem. Recebê-lo na assinatura, por si só, não garante que a implementação interrompa uma leitura ou uma chamada externa.

## Trocar a implementação ainda exige cuidado

Com essa separação, uma implementação em memória pode atender aos primeiros testes. Depois, uma implementação pode ler Markdown do disco, enquanto outra consulta um banco.

Isso reduz a propagação da mudança, mas não torna as implementações equivalentes por definição. Um banco pode estar indisponível; um arquivo pode conter metadados inválidos; um CMS pode impor limites de acesso. Também podem existir diferenças de ordenação, consistência e desempenho.

O contrato precisa estabelecer quais diferenças serão absorvidas pela implementação e quais serão comunicadas ao consumidor.

Por exemplo, a ausência de uma publicação pode ser representada por um erro conhecido pela aplicação. O handler traduz esse resultado para HTTP 404. Uma falha de leitura recebe outro tratamento. Assim, o pacote de persistência não precisa conhecer códigos HTTP, e o handler não precisa interpretar erros específicos do banco.

Os testes também precisam respeitar essa distinção. Um repositório em memória ajuda a testar o comportamento da aplicação, mas não verifica consultas SQL, interpretação de Markdown ou falhas de comunicação com um CMS. Cada implementação precisa de verificações adequadas ao mecanismo que utiliza.

## O ponto de entrada conecta as partes

O ponto de entrada é um lugar adequado para carregar a configuração, preparar o logger, criar as dependências e iniciar o servidor.

É ali que a aplicação decide usar um repositório Markdown ou uma implementação em memória. O handler recebe a dependência pronta; não precisa consultar uma variável de ambiente para descobrir como criá-la.

A configuração também merece validação no início. Uma porta inválida, um diretório inexistente ou uma credencial obrigatória ausente deveriam produzir um erro compreensível antes de o serviço começar a atender requisições.

Para um serviço HTTP, crescer com segurança também envolve limites de execução: timeouts apropriados, controle do tamanho das requisições, propagação de cancelamento e encerramento que dê às requisições em andamento uma oportunidade de terminar, dentro de um prazo definido.

Esses cuidados têm efeito mais direto na operação do que uma árvore extensa de diretórios.

## Apresentação também tem suas fronteiras

Templates devem receber dados preparados para a apresentação. Consultar o repositório ou decidir se um usuário pode acessar uma publicação durante a renderização espalha responsabilidades e torna as falhas mais difíceis de acompanhar.

Para HTML, o pacote `html/template` oferece escape contextual. Isso exige cuidado com tipos que marcam conteúdo como confiável: converter uma string externa para `template.HTML` pode contornar essa proteção. O conteúdo precisa ser tratado conforme sua origem e o contexto em que será exibido.

Os arquivos em `web/` também precisam de uma estratégia de distribuição. Podem acompanhar o executável como arquivos externos ou ser incorporados com `embed`. Arquivos externos permitem atualização independente, conforme o processo de entrega; arquivos incorporados acompanham a versão do binário. A escolha muda a operação, não apenas a localização dos arquivos.

## Deixar o próximo passo compreensível

Uma estrutura inicial não precisa prever todas as versões futuras da aplicação. Precisa permitir que a próxima mudança seja feita com um alcance razoável.

Se adicionar uma regra de publicação exige entender o transporte, a persistência e a renderização ao mesmo tempo, talvez as responsabilidades estejam misturadas. Se uma alteração pequena atravessa várias abstrações que apenas repassam chamadas, talvez a estrutura tenha ido além do necessário.

O equilíbrio aparece durante o trabalho: manter próximas as partes que mudam juntas, proteger detalhes que não precisam se espalhar e introduzir abstrações quando elas esclarecem uma dependência real.

Em um serviço pequeno, isso já é uma base suficiente para crescer com mais controle.
