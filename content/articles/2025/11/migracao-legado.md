---
title: "Como migrar um legado para Arquitetura Hexagonal sem parar o mundo"
summary: "Um guia técnico e estratégico sobre como modernizar sistemas legados de forma incremental e segura, desacoplando o domínio das tecnologias externas e evoluindo sem interrupções operacionais."
author: "Guilherme Portella"
publishedDate: "2025-11-01"
keywords:
  - Arquitetura Hexagonal
  - Sistemas Legados
  - Modernização Incremental
  - Clean Architecture
  - Strangler Pattern
  - Refatoração
  - Engenharia de Software
seo:
  title: "Migrando sistemas legados para Arquitetura Hexagonal sem parar o mundo"
  description: "Como aplicar o padrão Ports and Adapters em sistemas legados, migrando gradualmente sem reescrita total e preservando a operação."
---

## Introdução

Migrar um sistema legado é, antes de tudo, um exercício de **cirurgia arquitetural** , o desafio é intervir sem interromper o paciente.  
A arquitetura hexagonal (Ports and Adapters) surge como uma ferramenta para tornar essa transição **segura, incremental e reversível**.  
Ao invés de um “big bang”, a estratégia é **desacoplar, isolar e reconstruir em torno de um núcleo estável**, permitindo que novas funcionalidades coexistam com o código antigo até que a migração esteja completa.

Este artigo aprofunda o **“como”** dessa transição: quais princípios guiam o processo, quais práticas tornam-no viável e quais armadilhas precisam ser evitadas.

---

## 1. O dilema da modernização contínua

Reescrever tudo do zero costuma ser tentador , o desenvolvedor imagina uma base limpa, moderna e sem dívidas. Mas, na prática, isso **raramente é sustentável**.  
Enquanto a reescrita ocorre, o negócio continua evoluindo. Novas regras são criadas, clientes seguem operando, e o backlog não para.  
O resultado? Dois sistemas competindo: o legado que ainda funciona e o novo que ainda não entrega valor.

A arquitetura hexagonal oferece uma **saída realista**: preservar o funcionamento atual enquanto se refatora o interior da aplicação de forma controlada.  
Não é sobre apagar o passado , é sobre **refatorar o presente com visão de futuro**.

---

## 2. O ponto de partida: compreender o que é essencial

Antes de aplicar o padrão, é preciso **entender o que realmente constitui o “domínio”** do sistema.  
Um erro comum é começar movendo repositórios, controladores e DTOs, quando o que deve ser isolado primeiro são **as regras de negócio puras**, aquelas que respondem à pergunta:  
> “Se eu tirasse o banco de dados e o framework web, ainda teria lógica de negócio útil aqui?”

Essas regras são o **coração** do sistema. Tudo ao redor , persistência, transporte, APIs, mensageria , são **periféricos substituíveis**.  
A meta inicial é protegê-las em um núcleo isolado, livre de dependências.

---

## 3. O princípio do desacoplamento incremental

A migração para arquitetura hexagonal não é um evento, mas um **processo iterativo**.  
O princípio é simples:

> “Desacople casos de uso do transporte e da persistência.  
> Crie portas e adaptadores finos.  
> Migre periféricos em torno de um core estável.”

### 3.1. Separar casos de uso do transporte

Cada endpoint, fila ou comando CLI deve invocar uma **porta de entrada** (input port) , uma interface que representa um caso de uso.  
A implementação concreta desse caso de uso é um **interactor** (ou application service).  
Assim, controladores, filas e jobs não conhecem detalhes internos: eles apenas chamam a porta e recebem o resultado.

```java
// Porta (Input Port)
public interface ProcessarPagamentoUseCase {
    void executar(PagamentoRequest request);
}

// Implementação (Interactor)
public class ProcessarPagamentoService implements ProcessarPagamentoUseCase {
    private final PagamentoRepository repository;
    private final GatewayDePagamento gateway;

    @Override
    public void executar(PagamentoRequest request) {
        var pagamento = Pagamento.criar(request);
        repository.salvar(pagamento);
        gateway.notificar(pagamento);
    }
}
```

Esse design permite que o mesmo caso de uso seja reutilizado via REST, mensageria ou CLI, sem duplicação de lógica.


## 3.2. Separar persistência por meio de portas de saída

Da mesma forma, as operações de leitura e escrita são expostas por **portas de saída (output ports)**.  
No início, essas interfaces podem simplesmente delegar ao DAO legado, servindo como um *adaptador temporário*.  
Isso cria uma fronteira de isolamento , o domínio não sabe mais quem persiste os dados, apenas que alguém o faz.

---

## 4. Estratégia de transição: do monólito ao núcleo independente

A aplicação prática dessa abordagem pode ser organizada em três fases:

### 4.1. Fase 1 , Identificação e encapsulamento

- Mapeie os módulos com maior valor de negócio.  
- Extraia casos de uso em classes independentes.  
- Crie interfaces (**ports**) para dependências externas (repositórios, APIs, mensageria).  
- Implemente adaptadores mínimos que conectem o novo núcleo ao legado.

**Objetivo:** manter o comportamento atual intacto, mas iniciar o isolamento do domínio.

---

### 4.2. Fase 2 , Substituição progressiva dos adaptadores

Com o domínio estabilizado, comece a substituir adaptadores legados por implementações modernas:

- Repositórios com **JPA → adaptadores usando Spring Data** ou outro ORM moderno.  
- **Chamadas SOAP → adaptadores REST ou gRPC.**  
- **Jobs schedulados → eventos via mensageria.**

O domínio não é afetado, pois só conhece as portas , o contrato permanece o mesmo.

---

### 4.3. Fase 3 , Embrulhar o legado e expandir

Use o **Strangler Pattern** para permitir que novas funcionalidades coexistam com o legado.  
Isso pode significar:

- Encapsular partes antigas em *facades* acessadas via *adapters*.  
- Criar APIs modernas que apenas delegam ao código antigo por trás das portas.  
- Migrar módulos um a um, até que o legado possa ser desativado sem interrupção.

**Ganho:** paralelização da modernização , a operação continua e o código evolui em ciclos curtos.

---

## 5. Testabilidade e governança da transição

Cada nova porta deve vir acompanhada de **testes unitários e de integração por contrato**.  
A ideia é que o domínio seja totalmente testável sem infraestrutura real , bancos de dados e APIs externas são simuladas via *mocks* ou *stubs*.

Além disso:

- Automatize a execução dos testes em pipelines **CI/CD**.  
- Monitore **cobertura, latência e erros** nos novos módulos.  
- Use **feature flags** para alternar entre implementações antigas e novas durante a migração.

Isso transforma a migração em um processo **previsível e observável**, evitando “saltos no escuro”.

---

## 6. Trade-offs e desafios reais

Aplicar arquitetura hexagonal em legados exige disciplina.  
Alguns desafios inevitáveis:

- **Sobrecarga inicial:** o código parece “crescer” antes de melhorar , portas, interfaces e testes demandam esforço.  
- **Curva de aprendizado:** times acostumados a frameworks opinativos (ex.: Spring Data, JPA direto no service) precisam mudar o modelo mental.  
- **Complexidade de integração:** partes do legado continuarão coexistindo por um bom tempo, o que exige padronização de contratos e monitoramento.

> **Mas os ganhos superam o custo:** evolutividade, testabilidade e liberdade tecnológica.

---

## 7. Dicas práticas para não “parar o mundo”

- **Comece pequeno:** escolha um módulo de impacto controlado (ex.: cadastro de clientes, cálculo de taxas).  
- **Use adapters temporários:** não tente refatorar tudo; conecte o novo *core* ao legado existente.  
- **Garanta métricas e logs desde o início:** sem observabilidade, a migração vira um ato de fé.  
- **Evite dependências cruzadas:** o domínio não deve importar nada de infra, nem mesmo anotações do framework.  
- **Evolua por coesão, não por camadas:** priorize casos de uso completos ao invés de refatorar camadas isoladas.  
- **Eduque o time:** promova *pair programming* e *code reviews* focados em princípios arquiteturais.  
- **Celebre marcos incrementais:** cada caso de uso migrado é uma vitória de engenharia.

---

## Conclusão

Migrar um legado para arquitetura hexagonal **sem parar o mundo** é um desafio de engenharia e cultura.  
Não se trata de trocar frameworks ou pastas de lugar, mas de reconstruir fronteiras lógicas entre o que é essencial (**regras de negócio**) e o que é acidental (**tecnologia, persistência, transporte**).

Com **disciplina incremental, automação e uma visão clara de domínio**, é possível modernizar sistemas complexos sem reescrita total.  
A recompensa é um sistema preparado para o futuro , **testável, extensível e tecnologicamente livre.**

> Na prática, a modernização inteligente é aquela que respeita o passado, mas o transcende com método.  
> A **Arquitetura Hexagonal** é o caminho para isso: **evoluir sem interromper.**
