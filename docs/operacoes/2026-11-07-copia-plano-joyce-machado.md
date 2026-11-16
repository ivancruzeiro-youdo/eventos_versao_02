# 2026-11-07 — Plano, escolhas de A&B e comentários copiados do contrato anulado 5630 para o 5654 (Joyce Machado)

Contexto: o contrato **5630** (evento `329d5103…`, "Joyce Machado — 2026-11-20") teve a simulação nº 10324 **anulada** em 07/11 e foi
arquivado (cancelado). O mesmo evento (20/11, Lounge 2) foi importado de novo no contrato **5654** (`78d24ac8…`). Ensaio em
transação desfeita antes da execução. Trilha: `AuditLog` com `action LIKE 'copia-evento-anterior-2026-11-07:%'` (3 linhas) e um
comentário de sistema em cada evento.

## Copiado (evento anterior fica intacto)
- **Respostas de itens de A&B (3, com histórico):** Finger Food 01 (2 — pratos escolhidos) e Pacote de Bebidas 3 (1), casadas por
  produto no evento novo. As respostas vêm do **arquivo do contrato 5630** (`EventContractArchive.items`), já que o evento anterior ficou sem itens.
- **Horário de serviço de A&B (2):** Finger Food 01 (20:00–22:30) e Pacote de Bebidas 3 (19:00–02:00), horários de Brasília.
- **Respostas do plano do local — Lounge 2 (9, com histórico).**
- **Comentários escritos por pessoas (2):** "Brinde com champagne pelo cliente - (somente brinde)." e "irá utilizar 01 microfone.", com autor e data originais.

## Mão de obra (mesmo dia, segunda etapa)
- As **vagas** (10) já eram idênticas nos dois eventos (cargos, quantidades, horários e valores) — nada a copiar.
- As **9 candidaturas** do evento anterior foram **movidas** (`UPDATE FreelancerApplication SET eventId = novo`, ids preservados): 6 aprovadas
  (Willian França — Bartender; Luciano Farias e Victor Sabino — Garçom/Montador; Thaissa Cubas — Recepcionista; Eduardo Filipowski —
  Responsável do Bar; Vanessa Andreina — Responsável de salão) e 3 canceladas pelos próprios profissionais (mantidas só como histórico).
  Lotação conferida: todas as vagas com aprovados ficaram exatamente cheias (1/1, 2/2). Trilha: `AuditLog`
  `copia-evento-anterior-2026-11-07:candidaturas-movidas` (lista original no `before`) e comentário de sistema nos dois eventos.
- Reverter: `UPDATE "FreelancerApplication" SET "eventId" = '329d5103-3c19-4df3-bade-ca2af1b6c35d'` pelos ids do `before`.

## Cronograma (terceira etapa)
- **6 atividades** copiadas (mesmos nomes, horários, times e descrições; **sem alarmes** nem arquivo): Inicio Montagem, Decoração (Montagem),
  Inicio Evento, DJ, Brinde - Corporativo, Encerramento Evento.
- **Ajuste:** "Inicio Montagem" estava com o início no ano **2011** no evento anterior (erro de digitação; o fim era 2026) — copiado com 2026.
- Trilha: `AuditLog` `copia-evento-anterior-2026-11-07:cronograma` + comentário de sistema. Reverter: apagar as atividades pelos ids do `after`.

## Não copiado
- Resposta do **Painel de LED P2 3mx2m** (infra): o contrato 5654 não tem esse item.
- Comentários de sistema do evento anterior (criação/edição de atividades, Louça automática, anulação) e comentários de item que registravam mudança de horário.
- Aprovações do cliente e aceite de regras — atos do cliente, não foram pedidos.

## Como reverter
Apagar do evento novo as respostas criadas (ids no `after` de `copia-evento-anterior-2026-11-07:itens`), limpar `serviceStartAt/serviceEndAt` dos
dois itens de A&B e apagar os 2 comentários humanos copiados e as 9 respostas do local.
