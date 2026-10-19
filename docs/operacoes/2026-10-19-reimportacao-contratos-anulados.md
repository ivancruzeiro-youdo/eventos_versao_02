# 2026-10-19 — Sync diário reimportou contratos anulados e criou eventos duplicados

Registro de incidente e da limpeza, para análise futura. Operação executada por Ivan Cruzeiro (Claude Code como executor).
Trilha no banco: `AuditLog` com `action LIKE 'limpeza-sync-reimportacao-2026-10-19:%'` (13 linhas, com `before`/`after`) e um
`EventComment` de sistema "Limpeza (19/10/2026)…" em cada evento afetado (13).

## Resumo

- Às **08:04 UTC (05:04 BRT) de 19/10**, o sync diário (`workers/contract-sync.ts`) importou contratos **Encerrados**
  (simulação anulada/cancelada na Userp) que já estavam **arquivados** (`EventContractArchive`, não restaurados).
- Resultado: **10 eventos duplicados** confirmados, com vagas ativas visíveis aos freelancers (1 candidatura aprovada
  chegou a ser criada), **2 contratos arquivados reimportados** em eventos existentes e 2 eventos já cancelados criados
  sem contrato (Maurício Malafaia 30/10 e 31/10 — não alterados, já estavam cancelados).
- Das 34 contratos arquivados, 12 voltaram a existir como `EventContract`.

## Causa

A API em produção rodou com **código antigo** naquele horário. O código de produção é copiado para dentro do container
(`docker cp`, sem volume), então qualquer recriação do container (`docker compose up` / `--force-recreate`) volta ao
código da imagem. Os containers `api` e `web` foram recriados em 19/10 às 11:03 UTC (e, pelos dados, houve outra recriação
entre 17/10 17:05 e 19/10 08:04 — não confirmável: o histórico de eventos do Docker não é retido).

O código atual (desde `a9e75d3` e `6b5cb73`) já tem as defesas que teriam impedido isto:
1. `fetchContratoIds` lista só contratos principais **Vigentes** (`status=Vigente`);
2. `sync-preview` descarta contratos arquivados e não restaurados (`getArchivedContractIds`);
3. `fetchContratoDetails` filtra secundários pelo `contracts-secondary` (só vigentes).

Sintoma visível no mesmo dia: `GET /events/:id/slot-overflow` → 404 (rota inexistente no código antigo). Corrigido às
11:50 UTC com `deploy.sh schema` + `deploy.sh api`.

## Ações executadas (limpeza, ~12:30 BRT)

| Ação | Alvo | Detalhe |
|---|---|---|
| Cancelar evento + desativar vagas | 10 eventos duplicados | status `cancelled`; `EventService.status = 'inactive'` (2 a 9 vagas cada) |
| Descandidatar | `FreelancerApplication 1141425f-56ed-4935-94d7-9718a2043ed7` | Eduardo Filipowski, Aux Limpeza, Plastilog 02/12: `approved` → `cancelled`. Sem acesso físico vinculado (vaga fora da janela de 48h) |
| Arquivar de novo | contratos 5493 (Larissa Cantagalli 14/11) e 5074 (Edirlene Boeira 28/11) | via `archiveContract` (reason `annulled`); itens retirados: 5493 → 1 item; 5074 → nenhum |

Eventos duplicados cancelados (id → contrato de origem): `d6b521c1…` Laura Padilha 30/10 (5531) · `4f12b017…` Bruno Damaceno 06/11
(4847) · `626d61e0…` Sidney Anselmo 15/11 (5481) · `83c9f466…` Treger 26/11 (5581; o original legítimo é o `3d2912a8…`,
contrato 5583, confirmado) · `85ab432a…` Plastilog 02/12 (5521) · `a85a2d91…` Balaroti 11/12 (5448) · `ee247984…`
Joseane Robetti 11/12 (5451) · `f982f9de…` Jaciara Ferreira 12/12 (5572) · `cec7c4c8…` White Sguario 12/12 (5501) ·
`4ec623cd…` Bruna Farah 06/03/27 (5537). Nos demais, o evento original já estava cancelado.

Não foi feito: nenhuma mensagem a freelancers; o `EventContract` anulado continua ligado aos eventos duplicados cancelados
(serve de âncora para o sync não recriá-los); os 2 eventos Maurício Malafaia ficaram como estavam.

## Como reverter

- Evento: `UPDATE "Event" SET status='confirmed'` e vagas `inactive` → `active` (ids no `before` do AuditLog).
- Candidatura: `status` de volta para `approved` (valor anterior no `before`).
- Contratos 5493/5074: `POST /events/:id/contract-archives/:archiveId/restore` (há 2 registros de arquivo para cada um).

## Pendências / prevenção

1. **Empacotar a API numa imagem** (como o web) para a recriação do container não apagar o código. Não feito.
2. Antes de qualquer deploy: `git fetch` e conferir que o GitHub não tem commits que a cópia local não tem.
3. Depois de recriar containers: rodar `deploy.sh schema` e `deploy.sh api`.
4. Outros 8 contratos Encerrados ainda em eventos futuros (não vieram deste sync) pedem conferência manual.
