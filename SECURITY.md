# Segurança

Esta base nasce com algumas escolhas conservadoras:

- configuracao validada na inicializacao;
- timeouts HTTP definidos;
- encerramento gracioso do servidor;
- logs estruturados com `log/slog`;
- headers HTTP seguros por padrao;
- ausencia de dependencias externas no bootstrap inicial.

Antes de publicar o site, defina uma politica para:

- gestao de segredos;
- revisao de dependencias;
- backup e restauracao;
- autenticacao administrativa;
- protecao contra spam em comentarios ou formularios;
- monitoramento e alertas.
