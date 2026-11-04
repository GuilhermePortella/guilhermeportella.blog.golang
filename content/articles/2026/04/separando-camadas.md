---
title: "Separando domínio, transporte e infraestrutura"
summary: "Como organizar regras de negócio, casos de uso e detalhes técnicos enquanto a aplicação ganha rotas, templates e integrações."
author: "Guilherme Portella"
publishedDate: "2026-04-29"
tags:
  - design
  - backend
slug: "separando-camadas"
---

## Camadas como linguagem

Separar domínio, transporte e infraestrutura ajuda a indicar onde uma mudança deve acontecer e quais partes precisam conhecê-la. Essa organização começa a fazer diferença quando uma aplicação passa a reunir regras, páginas e integrações no mesmo fluxo.

Em um blog pequeno, é tentador colocar tudo no handler: localizar arquivos, interpretar metadados, decidir quais textos estão publicados e montar o HTML. Funciona no início. O custo aparece quando alterar uma regra de publicação exige entender também a leitura de arquivos e a resposta HTTP.

Uma separação útil permite discutir essas decisões com nomes próprios. A regra de publicação tem um lugar; o acesso ao conteúdo tem outro; a forma de responder ao usuário também. Os componentes continuam colaborando, mas passam a depender de menos detalhes uns dos outros.

## O que pertence a cada responsabilidade

O domínio representa os conceitos e as regras do negócio. Em uma aplicação editorial, isso pode incluir publicação, rascunho, agendamento e critérios de disponibilidade. Esses comportamentos precisam fazer sentido independentemente de uma requisição HTTP ou de um arquivo Markdown.

O transporte recebe uma interação externa e traduz seus dados para uma operação da aplicação. No HTTP, isso envolve parâmetros, headers, autenticação conforme o desenho adotado e construção da resposta. Ele também traduz resultados conhecidos para o contrato público: uma publicação inexistente pode resultar em 404, enquanto uma falha inesperada exige outro tratamento.

A infraestrutura implementa mecanismos de acesso e comunicação: ler arquivos, consultar um banco ou chamar um CMS. Esses mecanismos precisam respeitar o comportamento esperado pela aplicação, sem obrigá-la a interpretar erros específicos de cada tecnologia.

Entre essas responsabilidades, existe ainda o trabalho de coordenar um caso de uso. Essa é a função da camada de aplicação: buscar informações, acionar regras e organizar o resultado necessário para uma operação. Ela pode ser pequena, mas nomeá-la evita atribuir toda a coordenação ao domínio ou ao handler.

| Responsabilidade | Exemplo no blog |
|---|---|
| Domínio | Definir se uma publicação está disponível em determinado instante |
| Aplicação | Coordenar a consulta das publicações disponíveis e preparar o resultado do caso de uso |
| Transporte e apresentação | Interpretar a requisição e responder com HTML ou JSON |
| Infraestrutura | Ler Markdown, interpretar seus metadados e recuperar o conteúdo |

Essas responsabilidades não exigem quatro diretórios nem uma classe para cada linha da tabela. A divisão precisa ajudar a entender o comportamento e controlar dependências.

## O domínio fica mais focado

Dizer que o domínio deve ficar menor pode induzir a uma simplificação ruim. Retirar regras das entidades e espalhá-las em handlers ou serviços genéricos reduz o tamanho de um pacote, mas enfraquece o modelo.

O objetivo é manter o domínio concentrado nas decisões que lhe pertencem. Ele pode crescer conforme o negócio se torna mais complexo. O que não precisa crescer junto é seu conhecimento sobre códigos HTTP, nomes de templates ou formatos de arquivos.

Considere a regra de que um texto agendado só fica público a partir de certo instante. A decisão precisa ter uma definição clara, incluindo o tratamento do horário informado. Receber o instante como entrada permite verificar a regra sem depender diretamente do relógio durante o teste.

A implementação de persistência pode usar essa condição para filtrar resultados com eficiência. Isso exige preservar a mesma semântica. O risco está em manter versões independentes da regra no handler, na consulta SQL e no leitor de Markdown, cada uma com um comportamento diferente.

## Dependências com direção clara

O handler precisa conhecer a operação que vai chamar e os resultados que deve traduzir. Portanto, a ideia de que ele deve conhecer “pouco do domínio” merece precisão: ele deve conhecer o necessário para cumprir seu papel, preservando o encapsulamento das regras.

O caso de uso pode depender de um contrato de consulta de publicações. Uma implementação desse contrato lê arquivos; outra acessa um banco. O ponto de entrada da aplicação escolhe a implementação e conecta as partes.

Assim, a operação não precisa criar conexões, descobrir diretórios ou consultar variáveis de ambiente para decidir de onde virão os dados. Essas decisões ficam na montagem da aplicação.

Uma interface faz sentido quando representa uma dependência que vale a pena limitar. Ela não precisa existir para cada estrutura. Também precisa de comportamento definido: o que significa não encontrar um item, como a listagem é ordenada e quais falhas podem ser reconhecidas pelo consumidor.

A assinatura de um método é apenas parte desse acordo.

## Templates e JSON preservam a intenção do caso de uso

Uma página HTML e uma resposta JSON podem utilizar a mesma operação de listagem, cada uma com sua representação. O template precisa de títulos e links; uma API pode precisar de campos e metadados de paginação. Essas diferenças não deveriam redefinir quem está autorizado a consultar o conteúdo ou quando uma publicação se torna pública.

Isso também não significa que trocar a representação será sempre uma alteração local. Uma API pode trazer requisitos novos de paginação, seleção de campos ou autorização que exigem evolução do caso de uso.

A fronteira ajuda a localizar o impacto. Ela não promete que toda mudança ficará restrita a um único componente.

Vale o mesmo cuidado com middlewares. Logging e correlação de requisições costumam atuar na borda HTTP. Já uma autorização baseada nas características da publicação precisa ser aplicada no ponto adequado da operação, para continuar válida se ela for chamada por outro transporte.

## Quando o conteúdo sai da memória e passa para Markdown

Uma implementação em memória pode ajudar a começar a aplicação e verificar seus fluxos. Quando os textos passam a vir de arquivos reais, a intenção da listagem permanece: apresentar as publicações disponíveis de acordo com o contrato definido.

O leitor de Markdown assume responsabilidades concretas: localizar os arquivos permitidos, interpretar o front matter, validar os campos exigidos e converter a representação persistida para os dados usados pela aplicação.

Essa troca também revela situações que a implementação em memória talvez não representasse. Um arquivo pode estar ilegível, dois textos podem ter o mesmo slug e uma data pode estar inválida. É necessário decidir se um item inválido interrompe toda a consulta ou se é descartado com registro da falha. Essa decisão afeta o resultado percebido pelo usuário e precisa ser deliberada.

A ordenação também deve ser explícita. A ordem em que os arquivos são encontrados não substitui uma regra como “mais recentes primeiro, com desempate por slug”.

Por isso, trocar a origem dos dados exige verificar compatibilidade de comportamento. A separação reduz o alcance da mudança; não elimina o trabalho de integração.

## Testar as fronteiras que importam

Uma regra de publicação pode ser testada com datas definidas, sem iniciar servidor ou ler arquivos. O caso de uso pode ser exercitado com uma dependência controlada que retorna conteúdo, ausência ou erro.

A implementação Markdown precisa de testes próprios com arquivos representativos: metadados válidos, campos ausentes e conteúdo inválido. Um teste que usa apenas dados em memória não verifica o parser nem o acesso ao filesystem.

No transporte, os testes verificam a tradução para HTTP: status, headers e conteúdo relevante. Alguns testes com as partes reais conectadas ajudam a detectar divergências de montagem e de contrato que os testes isolados não encontram.

O valor dessa divisão é tornar a falha mais fácil de localizar. Se a regra funciona e a leitura falha, a investigação começa na adaptação dos dados. Se o caso de uso retorna o resultado correto e a página responde com o status errado, o problema está na tradução HTTP.

## Estrutura suficiente para a próxima mudança

Uma aplicação pequena pode preservar essas responsabilidades com poucas funções e pacotes. Acrescentar camadas que apenas repassam argumentos pode tornar o caminho mais difícil de acompanhar, sem proteger uma decisão relevante.

O sinal de que a separação está ajudando aparece nas mudanças reais. Corrigir a interpretação de uma data não deveria exigir reescrever o handler. Alterar o HTML não deveria modificar a regra de publicação. Introduzir um CMS deveria concentrar o trabalho de integração no acesso aos dados, com ajustes adicionais apenas onde o contrato realmente mudar.

A fronteira não precisa estar completa no primeiro dia. Precisa ser compreensível e verificável o bastante para orientar a evolução. Com isso, rotas, templates e integrações podem crescer sem carregar todas as decisões do sistema para dentro do mesmo componente.
