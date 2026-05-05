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

Logs bons contam uma história curta: o que entrou, o que a aplicação decidiu e o que saiu. Sem isso, a investigação vira adivinhação.

## Campos que ajudam

Alguns campos pagam aluguel todos os dias:

- request id;
- método e caminho;
- status code;
- duração;
- erro, quando existir.

## Durante um incidente

Comece pelo fluxo mais simples. Encontre uma requisição, siga o identificador e veja onde a história muda de direção.
