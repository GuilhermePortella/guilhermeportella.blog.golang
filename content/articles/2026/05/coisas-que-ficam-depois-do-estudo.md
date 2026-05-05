---
title: "Handlers HTTP previsíveis e fáceis de testar"
summary: "Padrões simples para tratar requests, respostas, logs e erros sem espalhar complexidade."
author: "Guilherme Portella"
publishedAt: "2026-05-01"
tags:
  - HTTP
  - testes
---

## O que um handler precisa fazer

Um handler HTTP fica mais fácil de manter quando ele tem uma responsabilidade curta: receber a requisição, chamar uma dependência clara e devolver uma resposta previsível.

Ele não precisa carregar a aplicação inteira nas costas.

## Testando comportamento

Com `httptest`, dá para validar status code, headers e trechos importantes do HTML sem abrir navegador.

- o status precisa ser explícito;
- o content type deve ser estável;
- erros inesperados precisam aparecer no log;
- o corpo deve conter sinais suficientes da tela.

## Pequenas garantias

Esses testes não substituem uma revisão visual, mas seguram o básico. Quando uma página muda, eles avisam se a rota sumiu, se o template quebrou ou se o contrato público mudou sem querer.
