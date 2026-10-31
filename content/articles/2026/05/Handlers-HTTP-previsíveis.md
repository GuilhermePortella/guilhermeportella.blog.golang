---
title: "Handlers HTTP previsíveis e fáceis de testar"
summary: "Padrões simples para tratar requisições, respostas, logs e erros, com testes que verificam o contrato HTTP sem depender dos detalhes da implementação."
author: "Guilherme Portella"
publishedAt: "2026-05-01"
tags:
  - HTTP
  - testes
---

## O que um handler precisa fazer

Um handler HTTP fica mais fácil de manter quando seu trabalho tem limites claros: interpretar a requisição, chamar uma operação da aplicação e traduzir o resultado para uma resposta HTTP.

Isso inclui ler parâmetros, verificar o formato dos dados e decidir como representar sucesso ou falha. Não deveria exigir que o handler conhecesse detalhes de consultas SQL, leitura de Markdown ou comunicação com um CMS.

Em uma página de publicação, por exemplo, o handler identifica o slug, solicita o conteúdo a uma dependência e monta a resposta. As regras que determinam se o texto pode ser publicado precisam continuar válidas fora daquela rota. Por isso, pertencem ao comportamento da aplicação, mesmo que o handler participe da validação de entrada.

Um handler curto costuma ser consequência dessa separação. Contar suas linhas, sozinho, não demonstra que a responsabilidade está bem definida.

## Uma resposta previsível começa antes do corpo

O contrato HTTP inclui status, headers e corpo. Uma página visualmente correta ainda pode estar sendo entregue com um status inadequado ou um tipo de conteúdo incorreto.

No `net/http`, escrever o corpo sem uma chamada anterior a `WriteHeader` confirma implicitamente um status 200. Isso é válido; o problema é deixar uma resposta de sucesso ser confirmada antes de descobrir uma falha.

Para respostas HTML comuns, defina `Content-Type: text/html; charset=utf-8` antes de confirmar a resposta. Se o tipo não for informado, a biblioteca pode inferi-lo a partir do conteúdo, mas uma definição deliberada deixa o comportamento mais claro.

Depois de confirmado o status final, não é possível substituí-lo por 500 com outra chamada a `WriteHeader`. Alterações tardias nos headers comuns também não corrigem o que já foi enviado. O caminho de erro precisa considerar esse momento.

## Renderizar antes de confirmar

Executar um template diretamente no `ResponseWriter` é simples, mas uma falha de execução pode ocorrer depois de parte do HTML ter sido escrita. Nesse ponto, a resposta já pode estar confirmada como sucesso.

Para páginas de tamanho controlado, uma alternativa é renderizar primeiro em um buffer. Se a execução falhar, ainda é possível devolver um erro coerente. Se funcionar, o handler define os headers e envia o conteúdo.

O trecho abaixo ilustra a sequência. Ele pressupõe imports de `bytes`, `html/template`, `log/slog` e `net/http`, além de um template previamente carregado:

```go
func PageHandler(tmpl *template.Template, logger *slog.Logger) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        var body bytes.Buffer

        data := struct {
            Title string
        }{
            Title: "Publicações",
        }

        if err := tmpl.ExecuteTemplate(&body, "page", data); err != nil {
            logger.ErrorContext(r.Context(), "falha ao renderizar página",
                "template", "page",
                "error", err,
            )
            http.Error(w, "Erro interno", http.StatusInternalServerError)
            return
        }

        w.Header().Set("Content-Type", "text/html; charset=utf-8")
        w.WriteHeader(http.StatusOK)

        if _, err := w.Write(body.Bytes()); err != nil {
            logger.ErrorContext(r.Context(), "falha ao escrever resposta",
                "error", err,
            )
        }
    }
}
```

O buffer usa memória proporcional ao conteúdo renderizado. Essa escolha funciona bem para páginas pequenas, mas pode ser inadequada para downloads grandes ou streaming. Nesses casos, a aplicação precisa aceitar e tratar o risco de interrupção depois do início da resposta.

O buffer também não garante que o cliente receberá tudo. Uma falha de escrita depois do envio dos headers deve ser registrada conforme a política da aplicação; tentar acrescentar uma segunda resposta de erro pode apenas corromper o corpo.

Nesse exemplo, o sucesso usa HTML e a falha usa texto simples produzido por `http.Error`. Isso é uma decisão explícita. Se o produto exigir uma página HTML de erro, ela também precisa de um caminho de renderização seguro e de um fallback caso esse caminho falhe.

## Erros diferentes pedem respostas diferentes

Uma dependência deve comunicar resultados que a aplicação consiga distinguir. O handler traduz esses resultados para HTTP, sem analisar mensagens de erro de banco ou devolver detalhes internos ao usuário.

| Situação | Resposta possível |
|---|---|
| Parâmetro com formato inválido | 400 Bad Request |
| Publicação pública inexistente | 404 Not Found |
| Método não permitido para a rota | 405 Method Not Allowed, com header `Allow` |
| Falha interna inesperada | 500 Internal Server Error, com mensagem pública genérica |

Esses exemplos precisam respeitar o contrato da aplicação. Conteúdo protegido, por exemplo, exige decisões sobre autenticação, autorização e divulgação da existência do recurso. Não basta mapear qualquer erro para um status fixo.

Ao comparar erros conhecidos em Go, `errors.Is` permite reconhecer erros sentinela preservados por wrapping. Erros tipados podem ser examinados com `errors.As`. O contrato da dependência precisa definir quais situações são reconhecíveis e quais permanecem falhas inesperadas.

Depois de enviar uma resposta de erro, encerre o fluxo com `return`. Continuar a execução pode chamar dependências sem necessidade ou misturar a mensagem de erro com o HTML de sucesso.

## Logs que ajudam sem expor dados

Falhas inesperadas precisam de informação suficiente para investigação: operação, erro e um identificador de requisição ou trace, quando disponível.

Isso não significa registrar indiscriminadamente headers, cookies, tokens ou o corpo inteiro da requisição. Dados enviados pelo usuário também podem aparecer em paths e parâmetros; escolha e trate os campos registrados.

Evite registrar a mesma falha em todas as camadas. Uma abordagem possível é preservar contexto ao propagar o erro e registrar a falha na fronteira responsável por tratá-la. Isso reduz duplicidade sem perder a causa.

Falhas esperadas, como uma publicação inexistente, podem aparecer no access log sem gerar um alerta de erro. Cancelamentos do cliente também merecem classificação própria para não serem confundidos automaticamente com defeitos do serviço.

## Testando comportamento com httptest

Com `httptest.NewRequest` e `httptest.NewRecorder`, é possível executar um handler em memória e examinar a resposta sem iniciar um navegador ou um servidor de rede.

O teste deve verificar o que importa para o consumidor: status, headers relevantes e conteúdo significativo. Para um teste de sucesso usando o handler anterior, o exemplo completo de arquivo de teste seria:

```go
package web

import (
    "html/template"
    "io"
    "log/slog"
    "net/http"
    "net/http/httptest"
    "strings"
    "testing"
)

func TestPageHandler(t *testing.T) {
    tmpl := template.Must(template.New("page").Parse(
        `<html><h1>{{.Title}}</h1></html>`,
    ))
    logger := slog.New(slog.NewTextHandler(io.Discard, nil))
    handler := PageHandler(tmpl, logger)

    req := httptest.NewRequest(http.MethodGet, "/posts", nil)
    recorder := httptest.NewRecorder()

    handler.ServeHTTP(recorder, req)

    response := recorder.Result()
    defer response.Body.Close()

    if response.StatusCode != http.StatusOK {
        t.Fatalf("status: recebido %d; esperado %d",
            response.StatusCode, http.StatusOK)
    }

    if got := response.Header.Get("Content-Type"); got != "text/html; charset=utf-8" {
        t.Fatalf("Content-Type inesperado: %q", got)
    }

    body, err := io.ReadAll(response.Body)
    if err != nil {
        t.Fatal(err)
    }

    if !strings.Contains(string(body), "<h1>Publicações</h1>") {
        t.Fatalf("título esperado não encontrado no corpo")
    }
}
```

Esse teste usa um template mínimo para verificar o handler. Não verifica os arquivos reais de apresentação. Um teste que carregue os templates usados pela aplicação é necessário se o objetivo for detectar problemas nesses arquivos ou nos nomes esperados durante a renderização.

Comparar trechos do HTML funciona para verificações pequenas. Quando a estrutura importa, analisar o documento e procurar elementos, atributos ou links costuma ser mais preciso do que comparar o HTML inteiro. Snapshots extensos tendem a quebrar por mudanças irrelevantes de formatação.

## Handler isolado não verifica a rota

Chamar `handler.ServeHTTP` diretamente demonstra como aquele componente responde. Não demonstra que `/posts` está registrado no roteador da aplicação.

Para detectar uma rota ausente, execute a requisição contra o roteador montado pela aplicação, usando as mesmas funções de registro e os middlewares relevantes. Esse teste deve verificar tanto o caminho quanto o método.

O `PageHandler` do exemplo não restringe métodos por conta própria. No `ServeMux` com suporte a padrões por método, disponível desde Go 1.22, o registro pode usar `GET /posts`. Esse padrão também atende HEAD; a supressão do corpo de HEAD na conexão é feita pelo servidor HTTP. Não se deve inferir esse comportamento apenas do corpo capturado ao chamar um handler diretamente com um recorder.

Se a verificação depende do cliente HTTP, de redirects, cookies ou do comportamento do servidor na conexão, `httptest.NewServer` permite testar pela rede local. Ainda assim, ele não reproduz automaticamente o proxy, o TLS e a configuração do ambiente de produção.

## Pequenas garantias que valem o teste

Além do caminho de sucesso, escolha situações que exercitem decisões reais:

- recurso inexistente devolve o status esperado, sem expor detalhes internos;
- entrada inválida é rejeitada antes de chamar a dependência;
- falha da dependência produz uma resposta pública coerente;
- falha de renderização não entrega um sucesso parcial quando a estratégia usa buffer;
- método não permitido é tratado pelo roteador ou pelo componente responsável;
- contexto da requisição é encaminhado às operações que precisam respeitar cancelamento e prazos.

Para falhas de escrita, um `ResponseWriter` de teste que retorna erro pode verificar o tratamento escolhido. O recorder comum não simula todas as falhas de conexão.

Dependências falsas devem representar os resultados necessários ao cenário. Verificar cada chamada interna torna o teste sensível a refatorações que não mudam o comportamento público. A ausência de uma chamada, porém, pode importar quando ela representa acesso indevido ou um efeito que deveria ter sido evitado.

## O que esses testes não garantem

Testes de handler não verificam layout, responsividade, navegação por teclado ou execução de JavaScript. A presença de um título no corpo também não demonstra que a página está visualmente correta ou acessível.

Eles protegem uma parte específica do sistema: a tradução entre uma requisição e seu resultado HTTP. Testes de aplicação, persistência, integração e verificações em navegador cobrem outras fronteiras, conforme a necessidade.

Quando esses limites estão claros, os testes ficam mais úteis. Uma mudança de template pode alterar a apresentação sem quebrar o contrato; uma mudança de status pode quebrar o consumidor mesmo mantendo a mesma aparência. O teste precisa distinguir essas situações.

## Referências

- [net/http — ResponseWriter, Error e ServeMux](https://pkg.go.dev/net/http).
- [net/http/httptest — requisições, recorder e servidor de teste](https://pkg.go.dev/net/http/httptest).
- [html/template — templates HTML e escape contextual](https://pkg.go.dev/html/template).
- [errors — Is e As](https://pkg.go.dev/errors).
