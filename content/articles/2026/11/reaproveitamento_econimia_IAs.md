---
title: "KV Cache e Prompt Caching: memória, desempenho e custo na inferência de LLMs"
summary: "Uma análise técnica do KV cache e do reaproveitamento de prefixos, com equações de atenção, estimativas de memória, modelos de custo e comparações com cache semântico, RAG, batching e fine-tuning."
author: "Guilherme Portella"
publishedAt: "2026-11-27"
tags:
  - inteligência artificial
  - arquitetura
  - performance
  - inferência
keywords:
  - KV cache
  - prompt caching
  - prefix caching
  - Transformers
  - GPU
  - RAG
  - semantic caching
  - LLM serving
slug: "kv-cache-prompt-caching-inferencia-llms"
---

## 1. O que exatamente estamos reaproveitando?

Uma aplicação que consulta repetidamente um modelo pode repetir trabalho em várias escalas. O mesmo documento reaparece no prompt. A geração usa novamente o contexto dos tokens anteriores. Duas consultas pedem uma resposta equivalente. Milhares de tarefas independentes aguardam processamento.

Essas situações permitem otimizações diferentes. Para escolher uma delas, precisamos identificar o resultado intermediário que pode ser reutilizado e as condições que tornam esse resultado válido.

| Técnica | O que reutiliza ou organiza | Unidade de equivalência |
|---|---|---|
| KV cache na geração | Keys e values calculados nas camadas de atenção | Histórico causal e configuração de inferência compatíveis |
| Prefix caching | Estado de um prefixo já processado, frequentemente blocos de KV | Prefixo compatível de tokens e demais entradas do modelo |
| Cache exato de resposta | Resposta final já produzida | Entrada e contexto de aplicação equivalentes segundo uma chave |
| Cache semântico | Resposta considerada adequada para outra consulta | Critério aproximado de equivalência, condicionado ao contexto |
| RAG | Evidências recuperadas para compor a entrada | Relevância para a consulta e autorização de acesso |
| Batching | Capacidade computacional entre tarefas | Compatibilidade de execução e política do scheduler |
| Fine-tuning e distillation | Comportamento aprendido nos parâmetros | Generalização estatística avaliada na tarefa |

O restante do texto se concentra em Transformers autoregressivos com atenção causal, especialmente arquiteturas decoder-only. Outras arquiteturas, atenção local, mecanismos recorrentes e representações latentes podem usar estados e custos diferentes. As equações apresentadas deixam explícitas as hipóteses de cada estimativa.

As referências técnicas e de produto foram consultadas em 27 de novembro de 2026. Valores comerciais, limites mínimos e nomes de campos de API precisam ser verificados para o modelo e o endpoint adotados.

## 2. Por que a analogia com cache de CPU tem limites

Caches L1, L2 e L3 guardam cópias de linhas de memória e exploram localidade temporal e espacial. Sua validade depende, entre outros fatores, da coerência com as escritas observadas pelo sistema. O KV cache guarda estados intermediários produzidos pela inferência de uma sequência.

A analogia ajuda a reconhecer a troca entre capacidade de memória e trabalho repetido. Entretanto, um cache miss de prefixo pode exigir novas multiplicações de matrizes e processamento de várias camadas. A identidade do dado reutilizável depende da sequência que produziu seus estados, além do modelo e da configuração.

Memoization é uma comparação mais próxima em termos de resultado intermediário. Ainda assim, é preciso identificar a função completa. Um bloco de texto isolado não determina seus próprios tensores em qualquer posição de qualquer prompt. O prefixo anterior influencia os estados nas camadas seguintes.

Compiladores também podem eliminar expressões redundantes ou mover cálculos invariantes. Memoization é uma técnica mais geral, aplicável ao software e a runtimes, sem depender de um compilador.

## 3. Queries, keys e values dentro de uma camada

Considere uma camada de atenção e uma matriz de estados de entrada:

$$
X \in \mathbb{R}^{T \times d_{model}}
$$

Para uma cabeça, omitindo batch e outras transformações, as projeções são:

$$
Q = XW_Q, \qquad K = XW_K, \qquad V = XW_V
$$

A atenção calcula:

$$
\operatorname{Attention}(Q,K,V)
= \operatorname{softmax}\left(\frac{QK^\top}{\sqrt{d_k}}+M\right)V
$$

A máscara causal $M$ impede que uma posição consulte posições futuras. Os scores relacionam queries e keys. Após a normalização, os pesos combinam os values. [1]

Em um Transformer com várias camadas, cada camada possui suas próprias projeções e estados. Os tensores de uma camada mais profunda derivam de representações que já incorporaram o contexto permitido nas camadas anteriores. Isso explica por que substituir o início da sequência pode alterar o estado necessário para o restante dela.

Mecanismos posicionais também fazem parte da validade do estado. RoPE, por exemplo, aplica transformações posicionais a queries e keys. Reaproveitar tensores exige respeitar as posições e a implementação usada para representá-los.

### O que permanece válido quando a sequência cresce

Ao acrescentar um token no final de uma sequência causal, as representações anteriores continuam dependendo apenas dos mesmos tokens anteriores. Podemos preservar os keys e values já calculados em cada camada e calcular as projeções da nova posição.

Para o passo $t$:

$$
K_{1:t} = [K_{1:t-1}; k_t]
$$

$$
V_{1:t} = [V_{1:t-1}; v_t]
$$

$$
o_t = \operatorname{softmax}\left(\frac{q_tK_{1:t}^{\top}}{\sqrt{d_k}}\right)V_{1:t}
$$

A implementação pode usar blocos pré-alocados, evitando concatenar e copiar o tensor inteiro a cada passo. A notação descreve o crescimento lógico do estado.

A query da posição atual ainda precisa interagir com as keys do histórico visível. O modelo também continua executando projeções, MLPs ou experts, normalizações e outras operações para a nova posição. O trabalho por token permanece dependente da arquitetura e do tamanho do contexto acessível. [2]

### Por que normalmente se guardam K e V

A query de um token passado foi usada para produzir a saída daquela posição. Na geração seguinte, a nova query consulta os keys e values acumulados. Esse padrão dá ao armazenamento persistente de K e V sua utilidade direta no decoding.

O runtime pode manter outros estados ou buffers por conveniência, por otimizações ou por requisitos específicos. A expressão KV cache se refere ao estado de atenção reutilizado dessa maneira.

## 4. Prefill e decode exigem análise separada

No prefill, o modelo processa os tokens fornecidos e prepara o estado necessário para continuar a sequência. Em operações densas usuais, há paralelismo entre posições, respeitando a máscara causal. Em contextos grandes, as multiplicações de matrizes e a atenção podem representar uma carga computacional elevada.

No decode autoregressivo convencional, uma sequência avança um token por passo. O próximo token depende da execução anterior. O servidor pode processar várias sequências simultaneamente, mas existe dependência sequencial dentro de cada uma.

| Aspecto | Prefill | Decode convencional |
|---|---|---|
| Posições processadas | Muitas posições de entrada, possivelmente em chunks | Uma nova posição por sequência em cada passo |
| Paralelismo | Entre tokens, sequências e operações do modelo | Entre sequências e operações internas |
| Pressão típica | FLOPs, workspace e movimentação de dados | Leitura de pesos e KV, largura de banda e execução do modelo |
| Benefício de um prefix hit | Evita parte do processamento já realizado | Continua consultando o estado reaproveitado |
| Métrica frequente | Tempo até o primeiro token | Tempo entre tokens e tokens por segundo |

“Compute-bound no prefill” e “memory-bound no decode” são tendências de workloads, não uma classificação universal. Batch, comprimento, quantização, hardware, paralelismo e kernels podem mudar o gargalo.

Chunked prefill divide prompts longos em unidades de trabalho que o scheduler intercala com outras requisições. Speculative decoding verifica candidatos em blocos. Essas estratégias mudam o planejamento da execução e precisam ser consideradas ao interpretar medições.

## 5. O custo assintótico com e sem KV cache

Considere $P$ tokens de prompt e $G$ tokens gerados, com atenção causal densa. Fixando camadas e dimensões, o prefill possui termo de atenção quadrático em $P$.

Uma implementação ingênua que reexecute todo o prefixo a cada passo de geração acumula trabalho de atenção proporcional a:

$$
\sum_{g=0}^{G-1}(P+g)^2
= O(GP^2 + PG^2 + G^3)
$$

Com KV cache, os passos incrementais acumulam interações de atenção proporcionais a:

$$
\sum_{g=0}^{G-1}(P+g)
= GP + \frac{G(G-1)}{2}
$$

Incluindo o prefill, a ordem desse componente é:

$$
O(P^2 + GP + G^2)
$$

Essas expressões são uma derivação do modelo simplificado. Elas descrevem o componente de atenção em função do comprimento, omitindo dimensões, camadas, operações de projeção e feed-forward. Os termos relativos aos pesos do modelo podem dominar o tempo real em determinados regimes.

O KV cache também evita repetir projeções e processamento de posições antigas. Em contrapartida, o estado ocupa memória e precisa ser lido durante a geração. Reduzir FLOPs pode deslocar a pressão para a movimentação de dados.

## 6. Quanto espaço o KV cache ocupa?

Para um Transformer convencional, com o mesmo número de cabeças KV em todas as camadas e a mesma precisão para K e V, uma estimativa do payload é:

$$
M_{KV} = 2 \times L \times B \times T \times H_{KV} \times d_h \times s
$$

| Símbolo | Significado |
|---|---|
| $2$ | Armazenamento de keys e values |
| $L$ | Número de camadas com esse padrão de atenção |
| $B$ | Quantidade de sequências de mesmo comprimento neste exemplo |
| $T$ | Tokens retidos por sequência, incluindo entrada e geração |
| $H_{KV}$ | Cabeças de keys e values |
| $d_h$ | Dimensão por cabeça |
| $s$ | Bytes por elemento |

Em comprimentos diferentes, substitua $BT$ pela soma dos tokens retidos de cada sequência. Em compartilhamento de prefixos, conte blocos físicos únicos, com os sufixos privados de cada ramo.

### Exemplo com GQA

Suponha uma arquitetura hipotética com 32 camadas, 8 cabeças KV, dimensão 128 e BF16, com 2 bytes por elemento. O payload por token e por sequência é:

$$
2 \times 32 \times 8 \times 128 \times 2
= 131\,072\ \text{bytes}
= 128\ \text{KiB}
$$

| Contexto retido | Payload estimado por sequência |
|---|---|
| 8.192 tokens | 1 GiB |
| 32.768 tokens | 4 GiB |
| 131.072 tokens | 16 GiB |

Oito sequências independentes de 32.768 tokens consumiriam aproximadamente 32 GiB somente nesse payload. Os pesos do modelo, ativações temporárias, buffers de comunicação, metadados e fragmentação entram em contas adicionais.

A fórmula também representa uma quantidade lógica agregada. Em tensor parallelism, o estado pode ser distribuído entre dispositivos. A divisão por GPU depende de sharding ou replicação das cabeças KV e das regras do runtime. Dividir simplesmente pelo número de GPUs pode produzir uma estimativa errada.

## 7. MHA, MQA e GQA

Na multi-head attention, usualmente há uma cabeça KV por cabeça de query. Na multi-query attention, várias queries compartilham uma única cabeça de keys e values. A grouped-query attention estabelece um número intermediário de cabeças KV. [3–4]

Para 32 cabeças de query, mantendo as demais dimensões do exemplo anterior:

| Configuração | Cabeças KV | Payload KV relativo | Payload com 32.768 tokens |
|---|---|---|---|
| MHA | 32 | 4× | 16 GiB |
| GQA | 8 | 1× | 4 GiB |
| MQA | 1 | 0,125× | 0,5 GiB |

A redução de cabeças KV diminui armazenamento e tráfego associado a esses tensores. Essa escolha integra o desenho ou a adaptação do modelo e pode afetar qualidade. Um runtime não pode simplesmente descartar cabeças e assumir comportamento equivalente.

Quantizar os pesos também não determina a precisão do KV cache. Um modelo com pesos de poucos bits pode manter seu estado KV em BF16. A memória usada por cada componente precisa ser medida separadamente.

## 8. Gerenciar blocos é tão importante quanto calcular tensores

Requisições chegam e terminam em momentos diferentes. Algumas geram poucas dezenas de tokens. Outras permanecem ativas por milhares de passos. Reservar antecipadamente um segmento contíguo grande para cada sequência desperdiça capacidade quando a reserva supera seu uso real.

PagedAttention organiza o estado em blocos, com um mapeamento entre posições lógicas e memória física. Essa estrutura permite alocação incremental e compartilhamento de blocos em cenários compatíveis. O artigo que introduziu a técnica discute fragmentação, duplicação e impacto sobre a capacidade de batching. [5]

A analogia com paginação descreve o gerenciamento. O estado pode continuar inteiramente na memória do acelerador. Um sistema que faz offload para CPU ou armazenamento adiciona uma política e um caminho de transferência próprios.

Aproximadamente, se a memória disponível para KV é $V_{KV}$ e cada sequência retém $m$ bytes exclusivos, a capacidade simultânea fica limitada por:

$$
B_{max} \lesssim \left\lfloor \frac{V_{KV}}{m} \right\rfloor
$$

Trata-se de um teto por memória, antes de considerar outros limites. Compartilhamento de prefixos pode reduzir o estado exclusivo. Contextos maiores, novos tokens e buffers adicionais podem consumir a folga.

## 9. Prefix caching entre requisições

Se duas requisições começam com um prefixo compatível, o servidor pode recuperar o estado calculado para esse trecho e processar a continuação. O estado usado no decode passa a ser também um ativo reutilizável entre chamadas.

KV cache descreve o conteúdo reutilizável da atenção. Prefix caching descreve uma política de descoberta, retenção e reutilização desse estado entre execuções. Prompt caching é uma expressão de produto que pode encapsular esse mecanismo e outras decisões internas.

O prefixo reaproveitado permanece no contexto lógico. As novas posições ainda podem atendê-lo. O cache poupa a reconstrução desse estado, enquanto a nova pergunta e a nova resposta continuam exigindo processamento.

Em um documento longo, a operação pode ser vista assim:

1. A primeira chamada processa instruções, documento e pergunta, construindo estado.
2. Outra chamada apresenta o mesmo prefixo e uma pergunta diferente.
3. O runtime encontra uma entrada compatível e obtém seus blocos.
4. A continuação calcula atenção contra o estado preservado e gera uma nova resposta.

Mesmo com o prefixo inteiro disponível, o runtime pode precisar reconstruir estados de fronteira ou logits, dependendo do que foi armazenado. Cachear K e V não implica conservar todo resultado intermediário possível.

## 10. O prefixo exato e a primeira diferença

O texto “uma vírgula invalida tudo” omite onde a mudança ocorreu e como o cache foi organizado.

Considere duas entradas tokenizadas:

```text
Requisição A = [instruções v1] [documento v7] [pergunta A]
Requisição B = [instruções v1] [documento v7] [pergunta B]
```

O trecho anterior à diferença pode ser compartilhado, respeitando limites mínimos, blocos completos, disponibilidade e configuração. Uma alteração perto do final do documento pode preservar um prefixo extenso. Uma mudança no início tende a destruir grande parte desse reaproveitamento.

Em caches de blocos encadeados, a identidade de cada bloco inclui informação do prefixo anterior. Isso impede tratar duas ocorrências do mesmo parágrafo como estados equivalentes quando estão precedidas de contextos diferentes. A documentação do vLLM descreve hashes encadeados, tokens do bloco e entradas adicionais de identidade. [6]

### Texto igual ainda exige compatibilidade

O sistema precisa considerar a representação realmente recebida pelo modelo. Entre os elementos relevantes estão versão dos pesos, tokenização, chat template, posições, máscara de atenção, adaptadores e entradas multimodais.

Espaços e serialização podem alterar tokens. Imagens podem usar placeholders de texto iguais e representar conteúdo visual diferente. Uma tabela de ferramentas reordenada pode alterar o prefixo serializado. Esses detalhes precisam entrar no mecanismo de compatibilidade aplicável.

Alterar temperatura costuma modificar a seleção de saída, sem alterar os tensores do prefixo no modelo convencional. A possibilidade de reutilização ainda depende das regras que a API ou o runtime aplicam. Configurações de saída precisam entrar na chave quando o objeto cacheado é a resposta final.

### Prefixo disponível e cache hit são condições distintas

Um prefixo elegível pode ter sido removido, estar em outra réplica ou não satisfazer o mínimo exigido. Pressão de memória, retenção e roteamento influenciam a taxa de acerto.

Uma estratégia de afinidade pode concentrar requisições compatíveis na mesma instância. Ela também pode criar filas em uma réplica enquanto outras têm folga. O benefício do hit precisa compensar a espera adicional.

## 11. Montagem do prompt e hierarquia de confiança

A ordem de conteúdo deve preservar a semântica da aplicação e as regras do endpoint. Dentro desses limites, coloque blocos comuns e estáveis antes dos que mudam com maior frequência.

Uma composição possível é:

```text
Mensagem privilegiada
  política da aplicação e instruções estáveis

Conteúdo de referência, com papel e delimitação adequados
  documento versionado e metadados estáveis

Histórico preservado, quando necessário
  mensagens anteriores na ordem original

Entrada variável
  pergunta atual e dados específicos da operação
```

Um documento recuperado precisa conservar sua condição de dado externo. Torná-lo uma instrução privilegiada para favorecer cache muda o modelo de confiança da aplicação. Organização de prefixo e autoridade das mensagens exigem decisões compatíveis.

A montagem deve ser determinística onde o conteúdo é realmente equivalente. Preserve ordem de ferramentas e documentos, normalize serializações sob seu controle e versione o material. Datas atuais e identificadores voláteis no começo de todo prompt costumam encurtar o prefixo comum.

Na continuidade de uma conversa, acrescentar mensagens pode preservar estado anterior. Reescrever mensagens antigas, resumir o histórico ou alterar a seleção de ferramentas pode exigir novo processamento. Compaction troca custo e tamanho do contexto por uma representação resumida, que precisa manter informações necessárias à tarefa.

## 12. APIs gerenciadas têm contratos diferentes

Uma aplicação deve verificar o modelo, a API, os tamanhos mínimos, os contadores de uso e as regras de cobrança. A presença de “caching” no nome de dois produtos não garante parâmetros equivalentes.

| Plataforma | Comportamento documentado relevante | O que conferir na integração |
|---|---|---|
| OpenAI | A documentação distingue gerações de modelos, mecanismos de breakpoint e retenção, com contabilização de leitura e, em configurações aplicáveis, escrita | Endpoint, modelo, limite mínimo, campos de uso e custo de cache write |
| Anthropic | A Messages API oferece configuração por `cache_control`, com alternativas automáticas e breakpoints explícitos, além de TTLs documentados | Prefixo efetivo, duração, preço de escrita/leitura e mínimo do modelo |
| Gemini | A documentação apresenta cache implícito e diferenças de suporte ao cache explícito entre APIs e modelos | API usada, suporte do modelo e contabilização retornada |

A tabela resume as páginas consultadas, sem fixar percentuais como propriedade universal. [7–9]

Descontos de tokens de entrada e redução de latência medem coisas diferentes. Um desconto elevado na parcela cacheada pode produzir economia pequena no total se a saída, ferramentas ou armazenamento dominarem a cobrança.

A implementação interna de um provedor também pode manter estado em diferentes camadas de memória. Só a documentação pública ou uma observação suportada permite afirmar onde o conteúdo está armazenado. “Está sempre na VRAM” é uma hipótese excessiva para uma API gerenciada.

## 13. Modelo de custo e ponto de equilíbrio

Separe os tokens em categorias mutuamente exclusivas na medição adotada:

- $U$ tokens de entrada processados na tarifa comum.
- $H$ tokens atendidos por leitura de cache.
- $W$ tokens cobrados como escrita de cache.
- $O$ tokens de saída faturáveis.

Com preços por milhão de tokens, o custo é:

$$
C = \frac{Up_u + Hp_h + Wp_w + Op_o}{10^6} + C_{armazenamento} + C_{outros}
$$

Essa equação assume que $p_w$ é a tarifa total da categoria de escrita. Se um produto reporta apenas um adicional, a normalização precisa evitar omissão ou dupla cobrança. Em APIs com raciocínio faturável ou categorias adicionais, incorpore-as explicitamente.

### Exemplo hipotético de economia

Considere 100 requisições, um prefixo de 20.000 tokens, sufixo de 1.000 e saída de 500 em cada chamada. Os preços fictícios por milhão são $2 para entrada comum, $0,20 para leitura, $2,50 para escrita e $8 para saída.

Sem reaproveitamento:

$$
C_{entrada} = \frac{100 \times 21\,000 \times 2}{10^6} = \$4{,}20
$$

$$
C_{saida} = \frac{100 \times 500 \times 8}{10^6} = \$0{,}40
$$

O total é $4,60.

Agora suponha uma escrita inicial e 99 leituras completas, com todos os sufixos na tarifa comum:

| Parcela | Custo |
|---|---|
| Escrita de 20.000 tokens | $0,050 |
| 99 leituras de 20.000 tokens | $0,396 |
| 100 sufixos de 1.000 tokens | $0,200 |
| Saídas | $0,400 |
| Total | $1,046 |

A redução fica em aproximadamente 77,3%. Esse resultado depende da frequência, dos preços e da proporção do prefixo. Expiração e misses diminuem a economia.

### Quantas utilizações pagam a escrita?

Para um prefixo de $P$ tokens usado $N$ vezes, uma escrita e $N-1$ leituras, desprezando armazenamento:

$$
C_{cache} = \frac{P[p_w + (N-1)p_h]}{10^6}
$$

$$
C_{sem} = \frac{PNp_u}{10^6}
$$

Se $p_u > p_h$, há vantagem quando:

$$
N > \frac{p_w-p_h}{p_u-p_h}
$$

Com armazenamento total $S$ em moeda, o numerador passa a incluir $S10^6/P$. Um prefixo grande e pouco reutilizado pode gerar custo adicional de retenção e escrita sem retorno suficiente.

## 14. Latência e a parcela que o cache consegue reduzir

Um modelo simplificado para a latência total é:

$$
T = T_{rede} + T_{fila} + T_{cache} + T_{prefill\ residual}
+ T_{decode} + T_{ferramentas}
$$

Algumas etapas podem se sobrepor em implementações reais. A expressão serve para atribuir tempo e evitar confundir redução de prefill com redução integral da resposta.

Se 60% do tempo original pertence ao prefill e essa parcela fica cinco vezes mais rápida, mantendo o restante fixo, o speedup pela lei de Amdahl é:

$$
S = \frac{1}{(1-0{,}60)+0{,}60/5} \approx 1{,}92
$$

A redução total de tempo fica em 48%. Se a saída domina a execução, um hit excelente no prompt pode alterar pouco o tempo até o último token.

O TTFT mede o tempo até o primeiro token. O TPOT mede o tempo por token após o início da saída, conforme a definição do benchmark. Avalie também latência completa, throughput e percentis. Sistemas de streaming podem melhorar a percepção inicial enquanto a duração total continua alta.

Um prefixo longo reaproveitado continua ocupando contexto e pode exigir muita leitura durante o decode. Reduzir o volume de conteúdo irrelevante pode trazer benefício mesmo quando esse conteúdo já está em cache.

## 15. FlashAttention, quantização e offload

FlashAttention organiza o cálculo de atenção para reduzir tráfego de memória e evitar materializar integralmente a matriz de scores na memória de alta capacidade. A técnica usa tiling e um cálculo eficiente da normalização. Ela preserva a atenção exata no sentido algorítmico, sujeito às diferenças numéricas da implementação. [10]

KV cache e FlashAttention tratam aspectos complementares. O primeiro preserva K e V de posições já processadas. O segundo melhora a execução das operações de atenção. O kernel empregado no decode pode ter características diferentes do usado no prefill.

A quantização do KV reduz os bytes por elemento, com custos de escalas, metadados e conversões. Ela pode introduzir erro numérico. A qualidade deve ser avaliada em tarefas reais, especialmente com contextos longos.

Offload libera memória do acelerador ao mover estados para CPU ou outro nível. Isso adiciona transferência e sincronização. Se for necessário ler dados remotos a cada passo, a largura de banda do enlace pode limitar a geração. Reduzir uso de VRAM e reduzir latência são objetivos que precisam de medições próprias.

Uma arquitetura que separa workers de prefill e decode também pode transferir KV entre máquinas. O custo dessa transferência entra no balanço. Para um cache grande, economizar recomputação exige comparar o tempo de materializar o estado com o de reconstruí-lo.

## 16. Cache exato e cache semântico de respostas

Um cache de resposta pode evitar toda a inferência. Sua chave deve representar os fatores que tornam aquela resposta reutilizável.

Em uma consulta pública determinística, isso pode incluir pergunta normalizada, idioma, versão dos documentos, versão da política, modelo e configuração de resposta. Em uma consulta personalizada, entram identidade, tenant e escopo de acesso, conforme o contrato.

Cache semântico usa uma busca aproximada para encontrar candidatos. Embeddings e similaridade por cosseno são mecanismos comuns. Um score 0,95 depende do modelo, da métrica e do conjunto de dados. Ele não significa 95% de probabilidade de a resposta ser correta.

Considere “Que horas vocês abrem?” e “Que horas vocês abrem no feriado?”. As representações podem ser próximas, mas a segunda depende de uma condição operacional importante. O mesmo problema aparece com negação, unidades, datas, versões de produto e nomes de entidades.

Uma arquitetura de cache semântico pode usar filtros exatos de contexto, recuperação de candidatos, limiar calibrado e uma verificação adicional de adequação. Essa verificação tem custo. O benefício líquido depende de quantas inferências caras ela evita e da taxa de falsos acertos.

Defina invalidação quando uma fonte muda. Uma resposta adequada ontem pode estar desatualizada hoje. Para dados altamente voláteis, um TTL curto ou a exclusão desse tipo de resposta do cache pode ser a decisão operacional adequada.

## 17. RAG muda a seleção de evidências

RAG combina recuperação de informação com geração. Uma implementação pode usar busca vetorial, lexical, híbrida, filtros e reranking. O artigo que consolidou o termo apresenta a combinação de memória paramétrica e recuperação em uma fonte externa. [11]

Em vez de fixar “dois ou três parágrafos”, estabeleça um orçamento de contexto e meça a capacidade de recuperar as evidências necessárias. Uma pergunta pode depender de uma definição, uma exceção e uma tabela em lugares diferentes.

RAG reduz o conteúdo enviado quando a recuperação seleciona um subconjunto adequado. Em contrapartida, introduz custo de indexação, consulta e ranking, além de risco de evidência ausente. A geração precisa lidar com esse risco.

O resultado da recuperação geralmente varia entre perguntas. Isso pode encurtar o prefixo comum. Preserve as instruções estáveis e adicione evidências selecionadas na posição adequada. Blocos documentais estáveis podem ser reaproveitados quando a sequência efetiva permitir, mas não se deve assumir reutilização arbitrária de trechos desconectados.

Cache de resultados de recuperação também exige chaves de versão do índice, filtros e permissões. Atualizações documentais e mudanças de acesso precisam invalidar os resultados afetados.

## 18. Batching e processamento assíncrono

Batching reúne trabalho para aproveitar o hardware. Continuous batching permite reorganizar o conjunto de sequências ativas à medida que outras terminam ou chegam. Requisições podem compartilhar execução de kernels sem ter prompts semelhantes.

Serviços comerciais de processamento em lote adicionam um contrato assíncrono. O cliente aceita uma janela de conclusão e recebe condições comerciais próprias. A documentação da Batch API da OpenAI anuncia desconto de 50% em comparação com suas APIs síncronas, nas condições ali descritas. Isso é uma condição de produto, não um resultado matemático obrigatório de agrupar tarefas. [12]

Compor batching e caching pode ser vantajoso. Contudo, uma rajada de chamadas simultâneas com prefixo ainda frio pode disparar construções redundantes se o sistema não coordenar o preenchimento. Em infraestrutura própria, single-flight ou deduplicação de builds pode reduzir esse efeito, considerando isolamento e filas.

Batch grande também aumenta o conjunto ativo de estados e pode elevar a latência por requisição. Escolha limites conforme o objetivo, como throughput de classificação assíncrona ou p95 de um assistente interativo.

## 19. Fine-tuning e distillation

Fine-tuning ajusta parâmetros a partir de exemplos. Distillation transfere comportamento de um modelo professor para um aluno por um processo de treinamento. Podem reduzir a necessidade de exemplos repetidos no prompt, desde que o modelo aprenda a tarefa com qualidade suficiente.

O resultado depende de dados representativos, cobertura de exceções e avaliação fora do treinamento. Vinte exemplos podem demonstrar um formato, mas não sustentam uma garantia geral de comportamento em produção.

Para JSON, constrained decoding ou saídas estruturadas podem oferecer controle de formato durante a geração. A validade sintática ainda precisa ser acompanhada de validação dos valores e das regras de negócio.

A conta econômica inclui preparação dos dados, treinamento, avaliações, hospedagem, inferência e manutenção. Se o custo fixo adicional é $F$ e cada execução economiza $\Delta c$, o ponto de equilíbrio simples exige:

$$
N > F / \Delta c
$$

A comparação só é válida se as soluções atingirem o nível de qualidade necessário. Um modelo menor que exige mais retries ou revisão pode ter custo efetivo superior.

Conhecimento atualizado e comportamento recorrente também pedem decisões diferentes. Uma política comercial que muda semanalmente precisa de um caminho de atualização verificável. RAG e contexto externo podem atender essa necessidade em conjunto com um modelo ajustado.

## 20. Desenho de uma aplicação com múltiplas otimizações

Considere um assistente técnico que consulta documentação e código, sem executar escritas. Um fluxo de referência pode incluir:

1. Autenticar o usuário e obter os recursos autorizados.
2. Verificar um cache exato ou semântico de respostas elegíveis, com chaves de versão e acesso.
3. Recuperar evidências no índice, aplicando os filtros de autorização.
4. Montar mensagens com instruções estáveis, evidências delimitadas e pergunta.
5. Solicitar inferência com a configuração de cache suportada pelo endpoint.
6. Validar formato e referências da resposta, registrando consumo e latência.
7. Armazenar a resposta apenas se ela atender aos critérios de reutilização.

O modelo do fluxo é ilustrativo. Uma aplicação simples pode precisar de menos componentes. Cada consulta adicional ao cache ou ao índice precisa pagar seu custo operacional.

Para operações com efeitos externos, como criação de pagamentos ou alteração de permissões, a aplicação precisa preservar a execução autorizada e a semântica de idempotência. Reutilizar uma resposta textual anterior não comprova que uma nova ação foi executada.

## 21. Isolamento, retenção e identidade do cache

O limite de compartilhamento precisa ser definido para cada camada. Um prefixo público de instruções pode ser compartilhável. Conteúdo privado de um tenant exige uma decisão de isolamento coerente com seu modelo de acesso.

Identificadores de roteamento não devem ser tratados automaticamente como fronteiras de autorização. A autorização pertence ao acesso e ao uso do conteúdo. O próprio mecanismo de cache precisa impedir que uma chave construída incorretamente misture contextos de usuários diferentes.

Em caches de prefixo, diferenças de latência podem revelar a presença de conteúdo previamente processado. A documentação do vLLM descreve salting para separar espaços de reutilização entre requisições compatíveis com a mesma política. Isso reduz uma classe de compartilhamento indesejado, dentro do mecanismo documentado. [6]

TTL de desempenho, retenção de dados e exclusão têm contratos distintos. Remover uma entrada do cache da aplicação não prova a exclusão em todas as camadas de um provedor. Para conteúdo sensível, confira as políticas do serviço e os controles oferecidos.

Os estados KV também merecem proteção como artefatos derivados do conteúdo. Evite exportá-los ou registrá-los em logs sem necessidade. Observabilidade pode usar versões, contadores e identificadores pseudonimizados, com a política adequada.

## 22. Como medir antes de afirmar economia

Um benchmark precisa representar a distribuição de uso. Inclua tamanhos de entrada e saída, concorrência, frequência de reutilização, intervalo entre chamadas e variações no prompt.

| Cenário | Pergunta que o teste responde |
|---|---|
| Cache frio | Quanto custa preencher ou reconstruir o estado? |
| Prefixo totalmente reutilizável | Qual a economia máxima nesse workload? |
| Mudança no final | Quanto do prefixo anterior continua elegível? |
| Mudança no início | Como a aplicação se comporta com pouco reaproveitamento? |
| Reuso após intervalo longo | Qual o efeito da retenção e da pressão de capacidade? |
| Rajada concorrente | Há fila, duplicação de construção ou perda de throughput? |
| Nova versão de documento ou modelo | A compatibilidade e a invalidação funcionam? |
| Respostas longas | Quanto do tempo continua no decode? |

Meça pelo menos tokens comuns, lidos e escritos em cache, custo total, TTFT, tempo por token, duração completa, throughput e percentis. Na infraestrutura própria, acrescente ocupação KV, blocos compartilhados, evictions, preempções e tráfego de transferência.

A taxa de hits por requisição pode esconder hits muito pequenos. Uma métrica complementar é a proporção de tokens de entrada reaproveitados:

$$
H_{tokens} = \frac{\sum tokens\ de\ leitura\ de\ cache}{\sum tokens\ de\ entrada\ correspondentes}
$$

Use a mesma semântica de contagem no numerador e no denominador. Um custo médio baixo com p99 elevado pode ser inadequado para uma aplicação interativa.

Compare configurações de qualidade equivalentes. Controle versão do modelo, prompts e limites de saída. Temperatura zero reduz uma fonte de variabilidade, mas não é uma garantia geral de resultados bit a bit idênticos entre execuções e infraestruturas.

Uma política de cache só demonstra vantagem quando reduz o recurso que importa para o serviço, mantendo o comportamento exigido. Em um classificador assíncrono, isso pode ser custo por documento. Em um assistente interativo, pode ser o TTFT sob carga. Em ambos, registre também a taxa de falha e a qualidade das respostas.

## Referências

1. Vaswani et al. *Attention Is All You Need*. [Artigo](https://arxiv.org/abs/1706.03762).
2. Hugging Face Transformers. *How caching works*. [Documentação](https://huggingface.co/docs/transformers/main/cache_explanation).
3. Shazeer. *Fast Transformer Decoding: One Write-Head is All You Need*. [Artigo sobre MQA](https://arxiv.org/abs/1911.02150).
4. Ainslie et al. *GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints*. [Artigo](https://arxiv.org/abs/2305.13245).
5. Kwon et al. *Efficient Memory Management for Large Language Model Serving with PagedAttention*. [Artigo](https://arxiv.org/abs/2309.06180).
6. vLLM. *Automatic Prefix Caching*. [Documentação de implementação](https://docs.vllm.ai/en/latest/design/prefix_caching/).
7. OpenAI. *Prompt caching*. [Documentação](https://developers.openai.com/api/docs/guides/prompt-caching).
8. Anthropic. *Prompt caching*. [Documentação](https://platform.claude.com/docs/en/build-with-claude/prompt-caching).
9. Google. *Context caching*. [Documentação](https://ai.google.dev/gemini-api/docs/caching).
10. Dao et al. *FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness*. [Artigo](https://arxiv.org/abs/2205.14135).
11. Lewis et al. *Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks*. [Artigo](https://arxiv.org/abs/2005.11401).
12. OpenAI. *Batch API*. [Documentação](https://developers.openai.com/api/docs/guides/batch).

As equações de custo, estimativas numéricas e exemplos de aplicação são derivações e cenários didáticos com hipóteses declaradas. Os preços do exemplo financeiro são fictícios. Para uma implantação, substitua-os pelos valores e categorias de uso do modelo contratado.
