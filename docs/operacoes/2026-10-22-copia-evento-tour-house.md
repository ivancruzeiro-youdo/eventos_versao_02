# 2026-10-22 — Evento substituído: conteúdo do evento anterior copiado para o novo

Contexto: o contrato 5604 (Tour House, `978ddb74…`) teve a simulação **anulada** na Userp em 22/10 e foi arquivado; o mesmo
evento (22/10, Lounge 2) passou a existir no contrato **5614** (`223e7bd5…`, cliente "Getúlio Carlos de Almeida Junior"). O
evento novo nasceu só com os itens e as vagas criados pelo sync, então o preenchimento do evento anterior foi copiado.
Executado por Ivan Cruzeiro (Claude Code como executor), com ensaio em transação desfeita antes da execução.
Trilha: `AuditLog` com `action LIKE 'copia-evento-anterior-2026-10-22:%'` (6 linhas) e comentário de sistema nos dois eventos.

## O que foi copiado (evento anterior fica intacto)

| Item | Qtde | Observação |
|---|---|---|
| Itens (A&B, infra, entretenimento, equipe) | 15 casados por nome, 0 sem par | plano vindo do **arquivo do contrato 5604** (`EventContractArchive.items`) |
| ↳ horários de serviço / respostas / comentários | 4 / 5 / 5 | Coffee Break 02, Finger Food 01, Serviço de Sala, DJ Eric Chein, Painel de LED |
| Vagas (mão de obra) | 10 | horário de início/fim copiado do evento anterior (fim em 22/10) |
| Checklists | 6 (77 itens, 7 feitos) + 3 vínculos com vagas | andamento preservado |
| Cronograma | 6 atividades | mesmos horários e times; sem alarmes |
| Layout | 1 | "Layout 1", Lounge 2 |
| Respostas do local | 9 (+ histórico) | |
| Convidados | 66 | todos `confirmed`; sem token de RSVP e sem check-in |
| Equipe do evento / preparo da cozinha | 1 / 2 | |
| Evento: nome público e fim | "AMBEV - TREINAMENTO"; desmontagem 22/10 22:00 | o contrato novo traz 23/10 (mesmo erro já corrigido no evento anterior) |

## O que foi MOVIDO (não copiado)

12 candidaturas de mão de obra (11 aprovadas, 1 rejeitada): `UPDATE FreelancerApplication SET eventId = novo`. Copiar deixaria o
freelancer com o mesmo turno duas vezes, uma delas como "Evento cancelado — você não precisa comparecer". Ids originais
preservados (o `AcessoLog` continua ligado). O acesso físico já concedido segue valendo; o robô de 04h passa a considerar o evento novo.

## O que NÃO foi copiado, de propósito

- **Aprovações do cliente** (`ClientApproval`, 53) e **aceite das regras do espaço** (`VenueRuleAcceptance`): são atos do cliente
  do contrato; o cliente do 5614 tem outro nome, e as chaves apontam para ids de itens/atividades que mudaram.
- Comentários de sistema do evento anterior (histórico de check-in e vínculo com o contrato 5604).
- Dados de contrato: nome do cliente, número de reserva e token do portal do cliente do evento novo.

## Como reverter

- Candidaturas: `UPDATE "FreelancerApplication" SET "eventId" = '978ddb74-…'` pelos ids no `before` do AuditLog
  (`copia-evento-anterior-2026-10-22:candidaturas-movidas`).
- Dados copiados: apagar as linhas criadas no evento novo (checklists, cronograma, layout, convidados, respostas do local,
  equipe, preparo da cozinha) e limpar o plano dos itens/vagas; o evento anterior não foi alterado (só ganhou um comentário).
- Nome público e fim do evento: valores anteriores no `before` de `copia-evento-anterior-2026-10-22:evento`.

## Pendências

1. Gerar o link/portal do cliente do evento novo (número de reserva e token) e o cliente refazer as confirmações.
2. Conferir o check-in na Userp para o contrato 5614 (o do 5604 estava registrado).
3. Se o sync diário voltar o fim do evento para 23/10, corrigir de novo (o ajuste do evento anterior se manteve).
