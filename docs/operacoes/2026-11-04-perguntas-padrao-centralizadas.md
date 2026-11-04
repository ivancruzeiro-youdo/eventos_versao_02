# 2026-11-04 — Perguntas padrão centralizadas (biblioteca + vínculo por espaço)

Migração `packages/db/prisma/migrations/20261104170000_space_question_library/migration.sql`.

## Backup
- `pg_dump -Fc` completo antes da migração: `backup-pre-perguntas-20261104-1350.dump` (servidor: `/home/ec2-user/`; cópia local em `backups/`, fora do git).
- Tabelas de arquivo, mantidas no banco: `_bkp_20261104_VenueQuestion`, `_bkp_20261104_EventVenueAnswer`, `_bkp_20261104_EventVenueAnswerHistory`, `_bkp_20261104_ClientApproval_venue_q`.

## O que mudou
- `VenueQuestion` virou a biblioteca central (`venueId` agora só indica o espaço de origem, nullable, `ON DELETE SET NULL`); `VenueQuestionLink` liga pergunta ↔ espaço.
- Perguntas idênticas (texto sem caixa/espaços extras + tipo + obrigatória + opções) foram unificadas: 25 → 17 perguntas, 25 vínculos mantidos. Perguntas com opções diferentes **não** foram unificadas.
- Chave de aprovação do cliente: `venue_q:<perguntaId>` (antes `venue_q:<espacoId>_<perguntaId>`); as chaves antigas continuam na tabela, ignoradas.

## Resultado nos dados
- Respostas: 888 → 863. As 25 removidas eram respostas repetidas (mesmo evento, duas perguntas duplicadas respondidas): 22 com valor idêntico ao que ficou; 3 com valor diferente, registradas no histórico da resposta mantida e num comentário do evento. Nenhum histórico foi perdido (1034 originais intactos).
- Perguntas excluídas (8) estão em `_bkp_20261104_VenueQuestion`.
