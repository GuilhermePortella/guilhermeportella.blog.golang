---
title: "Checklist de release para APIs"
summary: "Rascunho sobre validacao, logs e monitoramento para releases mais seguros."
author: "Guilherme Portella"
publishedAt: "2025-12-24"
tags: ["Back-end", "Release"]
---

## Objetivo
Um checklist simples para reduzir risco antes, durante e depois do deploy.

## Antes do deploy
- Revisar variaveis de ambiente e segredos
- Garantir rollback e feature flags
- Conferir migracoes de banco
- Validar contratos e codigos de erro

## Durante o deploy
1. Monitorar logs e latencia
2. Verificar metricas de erro
3. Validar health checks

## Depois do deploy
- Confirmar alertas e dashboards
- Conferir filas, jobs e webhooks
- Registrar notas do release

```bash
curl -sS https://api.exemplo.com/health
```
