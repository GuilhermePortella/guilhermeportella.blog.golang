---
title: "Lendo logs sem perder o fio da história"
summary: "Um roteiro pequeno para transformar logs em pistas úteis durante incidentes e investigação local."
author: "Guilherme Portella"
publishedAt: "2026-01-20"
tags:
  - observabilidade
  - debug
---

## Logs como narrativa

Logs bons contam uma história curta. O que a aplicação recebeu? Que decisão tomou? Como a operação terminou? Em um fluxo de pagamento, isso pode significar registrar a conclusão da requisição e, quando houver falha, indicar em qual etapa ela ocorreu.

Uma linha por etapa nem sempre vale o custo. Um registro de conclusão com duração e status já responde a muita coisa. Os outros eventos entram quando registram algo que muda a investigação, como uma tentativa adicional, uma dependência que excedeu o prazo ou um trabalho que ficou pendente.

## Campos que ajudam

Alguns campos pagam aluguel todos os dias. Com nomes consistentes e unidades explícitas, dá para filtrar e comparar eventos de serviços diferentes sem interpretar mensagens à mão.

| Campo | O que ajuda a descobrir |
|---|---|
| Horário em UTC | Quando o evento ocorreu, mesmo com serviços em fusos diferentes |
| Serviço, ambiente e versão | Qual componente registrou o evento e se ele coincide com uma mudança recente |
| `request_id` | Quais eventos pertencem à mesma requisição, onde o identificador foi propagado |
| `trace_id` e `span_id` | A qual fluxo distribuído e etapa instrumentada o evento pertence |
| Método e padrão da rota | Qual operação foi chamada, como `GET /posts/{slug}` |
| Status HTTP e `duration_ms` | Como a requisição terminou e quanto tempo o serviço levou para atendê-la |
| Tipo de erro e dependência | Qual falha foi observada e durante qual operação |

Para agrupar tráfego, prefiro o padrão da rota ao caminho completo. Ele reúne chamadas equivalentes e evita guardar identificadores que vieram na URL. Também vale selecionar os campos registrados. Headers, parâmetros e corpos podem conter tokens, cookies ou dados pessoais.

## Durante um incidente

Comece pelo sintoma, pela janela de tempo e pela operação afetada. Se o alerta mostra que os erros aumentaram em `POST /checkout`, encontre uma requisição que falhou e siga seu identificador. Depois compare com uma requisição bem-sucedida da mesma rota e do mesmo período, quando houver uma disponível.

Imagine que a busca encontrou estes dois eventos. Os horários foram omitidos no exemplo.

```json
{"service":"checkout","event":"payment.timeout","request_id":"req-42","dependency":"payment-gateway","timeout_ms":800}
{"service":"checkout","event":"http.request.completed","request_id":"req-42","method":"POST","route":"/checkout","status":504,"duration_ms":823}
```

O primeiro evento mostra que a chamada ao provedor ultrapassou o prazo observado pelo checkout. O segundo mostra como o serviço respondeu ao cliente. Isso localiza a etapa em que a requisição falhou. Para entender a causa, ainda é preciso descobrir se a chamada chegou ao provedor e onde o tempo foi gasto. Um trace, as métricas de latência da integração ou os registros do provedor podem ajudar a separar fila local, conexão lenta e processamento remoto.

Em um pagamento, o timeout também deixa o resultado em aberto. O provedor pode ter concluído a operação sem que a resposta chegasse a tempo. Antes de repetir um pagamento em produção, consulte o estado da operação ou siga o mecanismo de idempotência previsto pela integração.

Depois de entender uma requisição, volte para o conjunto. Verifique se o mesmo padrão aparece em outras falhas, se está concentrado em uma versão ou instância e se também existia antes do incidente. Uma requisição dá uma hipótese concreta. A comparação mostra até onde ela explica o problema.

## Quando falta um pedaço da história

Se o identificador para em um serviço, confira se ele foi enviado na chamada seguinte e se o destino o registrou. Em fluxos assíncronos, pode ser preciso usar o identificador da mensagem ou da operação de negócio para ligar a publicação ao consumo. Registre a tentativa de processamento quando houver reentregas, para distinguir eventos repetidos de operações diferentes.

Use o horário como pista quando faltar um identificador compartilhado. Relógios podem divergir e a coleta pode atrasar. Dois eventos próximos no tempo podem pertencer a requisições diferentes. Nesse caso, combine o horário com outros campos e indique onde a correlação ainda é uma hipótese.

## Na investigação local

Em desenvolvimento, reproduza o problema com uma entrada conhecida e acompanhe uma execução por vez. Quando encontrar a decisão que mudou o fluxo, registre o dado que explica essa decisão. Um evento como `post.skipped` com `reason=scheduled` ajuda a entender por que um texto ficou fora da listagem. Despejar o objeto inteiro costuma dar mais trabalho para quem precisa ler o resultado.

Se o registro só serviu à investigação atual, remova-o ao terminar. Se ele responde a uma pergunta que pode voltar em produção, dê ao evento um nome estável e mantenha apenas os campos necessários.
