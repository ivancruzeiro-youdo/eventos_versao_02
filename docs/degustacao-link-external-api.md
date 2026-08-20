# API: degustação para sistema externo de chat

Endpoints públicos para o sistema de chat (1) listar as degustações disponíveis e (2)
solicitar (ou obter, se já existir) o link de degustação de uma entidade Userp — sem precisar
de login de staff no YouDO Eventos.

Fluxo típico: chame primeiro `GET /degustacoes/available/external` para saber **para qual**
degustação gerar o link, depois `POST /degustacoes/:id/links/external` com o `id` escolhido.

## Autenticação

Não usa cookie/JWT do YouDO. Em vez disso, valida um **token emitido pela Userp** — o mesmo
token que o chat já deve receber ao autenticar junto à Userp. Nossa API confirma esse token
chamando `verify-token/index.php` na própria Userp (o mesmo mecanismo que a API de Acessos usa
hoje para validar o token que enviamos a ela).

```
Authorization: Bearer <token emitido pela Userp>
```

Sem esse header, ou com token inválido/expirado, a chamada retorna `401` antes de tocar em
qualquer dado de degustação.

> **Atenção**: existem dois "pools" de token diferentes na Userp (o de `/auth/token.php` e o
> de `/login/index.php`) e **só o segundo** é aceito por `verify-token/index.php`. Confirme com
> o time da Userp que o token entregue ao chat é desse tipo — um token do outro pool "parece"
> válido mas sempre vai dar 401 aqui.

## Endpoint 1 — listar degustações disponíveis

```
GET /api/v2/degustacoes/available/external
```

- **Host**: `https://eventos.youdobrasil.com.br`
- **Headers**: `Authorization: Bearer <token Userp>` (mesma autenticação de todos os
  endpoints externos — ver seção acima).
- **Sem body/query obrigatórios.**
- **Limite de taxa**: 30 requisições por minuto.

Devolve só as degustações que **já estão prontas para gerar link agora**: públicas
(`visibility: 'publico'`), com menu definido, com pelo menos um item já escolhido na aba A&B
do evento, e com data ainda no futuro. São exatamente as mesmas condições que o Endpoint 2
exige — se uma degustação aparece aqui, gerar o link para ela vai funcionar.

### Resposta — 200

```json
{
  "success": true,
  "degustacoes": [
    {
      "id": "d4a2XXXX-uuid-do-evento",
      "name": "Degustação — Menu Executivo",
      "startAt": "2026-09-10T19:00:00.000Z",
      "venues": ["Lounge 1"],
      "menu": "Menu Executivo",
      "maxGuests": 4
    }
  ]
}
```

| Campo       | Descrição                                                                 |
|-------------|----------------------------------------------------------------------------|
| `id`        | Use este valor como `:id` no Endpoint 2, para gerar o link desta degustação. |
| `name`      | Nome do evento de degustação.                                              |
| `startAt`   | Data/hora da ocorrência (ISO 8601, UTC).                                   |
| `venues`    | Nomes dos espaços vinculados.                                              |
| `menu`      | Nome do produto/menu configurado.                                         |
| `maxGuests` | Máximo de convidados permitido por link.                                  |

Lista vazia (`"degustacoes": []`) é uma resposta válida — significa que nenhuma degustação
está pronta no momento (nenhuma pública, com menu escolhido, ainda no futuro).

### Erros

Os mesmos `401`/`429`/`502` de autenticação e limite de taxa do Endpoint 2 (ver tabela abaixo)
— este endpoint não tem erros de negócio próprios, só os de auth.

## Endpoint 2 — gerar (ou obter) o link

```
POST /api/v2/degustacoes/:id/links/external
```

- **Host**: `https://eventos.youdobrasil.com.br`
- **`:id`** — o ID (UUID) do evento de degustação no YouDO Eventos. É o `Event.id` da
  ocorrência específica da degustação (a "âncora"), não um ID da Userp. Precisa ser combinado
  previamente — normalmente é o evento que o time do YouDO criou para aquela degustação.

### Body

```json
{
  "userpEntidadeId": 12345
}
```

| Campo             | Tipo   | Obrigatório | Descrição                                                                 |
|-------------------|--------|-------------|-----------------------------------------------------------------------------|
| `userpEntidadeId` | number | sim         | Código da entidade (cliente/contato) no Userp — o "id da entidade" que o chat já tem. |

### Headers

```
Authorization: Bearer <token Userp>
Content-Type: application/json
```

### Limite de taxa

30 requisições por minuto (por IP de origem). Passar disso devolve `429`.

## Respostas

### 201 — link criado agora

```json
{
  "success": true,
  "link": {
    "id": "b3f1...uuid",
    "degustacaoId": "d4a2...uuid",
    "userpEntidadeId": 12345,
    "nome": "Maria Silva",
    "telefone": "+5541999999999",
    "email": "maria@exemplo.com",
    "token": "9f8e...uuid",
    "enrolledEventId": null,
    "enrolledAt": null,
    "enrolledGuestNames": [],
    "createdById": null,
    "createdAt": "2026-08-20T14:00:00.000Z"
  },
  "url": "https://eventos.youdobrasil.com.br/degustacao/9f8e...uuid"
}
```

`nome`/`telefone`/`email` são um snapshot puxado da Userp no momento da criação — é isso que
o link mostra pro convidado, não é atualizado depois automaticamente.

### 200 — link já existia (idempotente)

Pedir de novo para a **mesma combinação** `:id` + `userpEntidadeId` **não cria um segundo
link** — devolve o mesmo link já gerado, com `200` em vez de `201`. O corpo é idêntico ao de
`201` (mesmo `link`, mesmo `url`). O chat pode chamar este endpoint sempre que precisar do
link, sem se preocupar em checar antes se ele já existe.

### Erros

| Status | Quando acontece | Corpo |
|--------|------------------|-------|
| 400 | `userpEntidadeId` ausente no body | `{ "error": "userpEntidadeId é obrigatório." }` |
| 400 | A degustação não é pública (`visibility` = `contrato`) | `{ "error": "Geração de link só se aplica a degustações públicas." }` |
| 400 | Ainda não foi definido o menu (produto) da degustação | `{ "error": "Defina o menu (produto) da degustação antes de gerar links." }` |
| 400 | O menu foi definido, mas ninguém escolheu os itens na aba A&B do evento ainda | `{ "error": "Escolha os itens do menu na aba A&B do evento antes de gerar links." }` |
| 401 | Header `Authorization` ausente ou sem prefixo `Bearer ` | `{ "error": "Header Authorization: Bearer <token Userp> é obrigatório." }` |
| 401 | Token Userp inválido, expirado, ou do pool errado | `{ "error": "Token Userp inválido ou expirado." }` |
| 404 | `:id` não corresponde a uma degustação existente | `{ "error": "Degustação não encontrada." }` |
| 404 | `userpEntidadeId` não existe no Userp | `{ "error": "Entidade não encontrada no Userp." }` |
| 429 | Mais de 30 requisições no último minuto | (corpo padrão do rate limiter) |
| 502 | Não foi possível conectar à Userp para validar o token | `{ "error": "Não foi possível validar o token junto à Userp." }` |

Nos casos de `400` por menu/escolha pendente, é um problema de configuração do lado do YouDO
(staff precisa terminar de configurar a degustação) — não é algo que o chat deveria tentar
contornar; vale exibir a mensagem de erro tal como vier.

## Exemplo (curl)

```bash
# 1. Listar degustações disponíveis
curl 'https://eventos.youdobrasil.com.br/api/v2/degustacoes/available/external' \
  -H 'Authorization: Bearer TOKEN_EMITIDO_PELA_USERP'

# 2. Gerar o link para a degustação escolhida (id vindo da resposta acima)
curl -X POST \
  'https://eventos.youdobrasil.com.br/api/v2/degustacoes/d4a2XXXX-uuid-do-evento/links/external' \
  -H 'Authorization: Bearer TOKEN_EMITIDO_PELA_USERP' \
  -H 'Content-Type: application/json' \
  -d '{"userpEntidadeId": 12345}'
```

## Depois de obter o link

O `url` retornado (`https://eventos.youdobrasil.com.br/degustacao/<token>`) é a página pública
que o convidado abre para confirmar presença — sem login. O chat só precisa repassar esse link
para a entidade; a página em si já cuida de mostrar o menu, horário do evento e coletar os
nomes dos convidados.
