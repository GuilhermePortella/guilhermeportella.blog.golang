# Segurança

Esta base nasce com algumas escolhas conservadoras:

- configuracao validada na inicializacao;
- timeouts HTTP definidos;
- encerramento gracioso do servidor;
- logs estruturados com `log/slog`;
- headers HTTP seguros por padrao no servidor Go;
- CSP e politica de referrer embutidas no HTML exportado;
- revisao de vulnerabilidades de dependencias com `govulncheck`;
- verificacao local agregada com `make security`, incluindo integridade de modulos,
  `go vet`, CVEs conhecidas com `govulncheck`, regras comuns do `gosec` e
  varredura de segredos com `gitleaks`;
- atualizacao recorrente de dependencias Go e GitHub Actions com Dependabot;
- ausencia de dependencias externas no bootstrap inicial.

Comandos recomendados antes de publicar ou abrir PRs:

```sh
make ci
make security
```

No deploy estatico em GitHub Pages, headers como `X-Frame-Options` e diretivas CSP
que precisam ser enviadas pelo servidor nao acompanham o artefato HTML. Se essas
garantias forem necessarias em producao, publique o site por uma camada que
permita configurar headers HTTP.

Antes de publicar o site, defina uma politica para:

- gestao de segredos;
- revisao de dependencias;
- backup e restauracao;
- autenticacao administrativa;
- protecao contra spam em comentarios ou formularios;
- monitoramento e alertas.
