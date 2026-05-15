# Segurança

Esta base nasce com algumas escolhas conservadoras:

- configuracao validada na inicializacao;
- timeouts HTTP definidos;
- encerramento gracioso do servidor;
- logs estruturados com `log/slog`;
- headers HTTP seguros por padrao no servidor Go;
- CSP e politica de referrer embutidas no HTML exportado;
- revisao de vulnerabilidades de dependencias com `govulncheck`;
- ausencia de dependencias externas no bootstrap inicial.

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
