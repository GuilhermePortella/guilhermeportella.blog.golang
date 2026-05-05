---
title: "Separando domínio, transporte e infraestrutura"
summary: "Como manter regras de negócio protegidas enquanto a aplicação ganha rotas, templates e integrações."
author: "Guilherme Portella"
publishedDate: "2026-04-29"
tags:
  - design
  - backend
slug: "separando-camadas"
---

## Camadas como linguagem

Separar domínio, transporte e infraestrutura não é cerimônia. É uma forma de dizer para o futuro onde uma mudança deve acontecer.

Quando o transporte HTTP conhece pouco do domínio, fica mais simples trocar template, resposta JSON ou middleware sem mexer na regra principal.

## O domínio fica menor

O domínio precisa de nomes bons e contratos pequenos. O resto pode se aproximar por adaptadores.

Essa fronteira não precisa ser perfeita no primeiro dia. Ela só precisa existir o bastante para impedir que tudo vire uma única pasta de conveniência.

## Um ganho prático

Quando o conteúdo sair de mocks e passar para Markdown real, a página de listagem não deve mudar de intenção. Ela só troca a origem dos dados.
