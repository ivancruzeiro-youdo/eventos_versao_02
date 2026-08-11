-- TELA COZINHA, 2ª rodada: tipo de saída (estação vs item), check de produção na visão da
-- semana e auditoria de quem alterou a sequência. Migração aditiva, sem downtime.

-- Pacotes de estação (carrinho, buffet, coffee break, estação de massas) não geram uma linha
-- por item a cada 15 min — geram montagem / reposicao / desmontagem.
ALTER TABLE "KitchenServicePlanEntry"
  ADD COLUMN IF NOT EXISTS "entryKind" TEXT NOT NULL DEFAULT 'item';

-- Auditoria: quem mexeu na sequência e quando. Tabela própria em vez de EventComment porque
-- é log operacional de granularidade fina e não deve poluir a timeline do evento.
CREATE TABLE IF NOT EXISTS "KitchenServicePlanLog" (
  "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "planId"    TEXT NOT NULL,
  "action"    TEXT NOT NULL,
  "detail"    TEXT NOT NULL,
  "userId"    TEXT,
  "userName"  TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "KitchenServicePlanLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "KitchenServicePlanLog_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "KitchenServicePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "KitchenServicePlanLog_planId_createdAt_idx"
  ON "KitchenServicePlanLog"("planId", "createdAt");

-- Check de "já produzido" na visão da semana. Separado do status='served' da sequência:
-- produzir antes e servir na hora são momentos diferentes, e a visão da semana precisa
-- funcionar mesmo sem a sequência do dia estar montada.
CREATE TABLE IF NOT EXISTS "KitchenPrepCheck" (
  "id"            TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "eventId"       TEXT NOT NULL,
  "eventItemId"   TEXT,
  "itemName"      TEXT NOT NULL,
  "checkedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "checkedById"   TEXT,
  "checkedByName" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "KitchenPrepCheck_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "KitchenPrepCheck_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- SET NULL pelo mesmo motivo da sequência: o item contratado pode ser apagado quando um
  -- contrato desaparece do Userp, e o registro de que aquilo foi produzido não deve sumir.
  CONSTRAINT "KitchenPrepCheck_eventItemId_fkey"
    FOREIGN KEY ("eventItemId") REFERENCES "EventItem"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Um check por item por evento: marcar de novo é toggle, nunca duplica linha.
CREATE UNIQUE INDEX IF NOT EXISTS "KitchenPrepCheck_eventId_itemName_key"
  ON "KitchenPrepCheck"("eventId", "itemName");
CREATE INDEX IF NOT EXISTS "KitchenPrepCheck_eventId_idx"     ON "KitchenPrepCheck"("eventId");
CREATE INDEX IF NOT EXISTS "KitchenPrepCheck_eventItemId_idx" ON "KitchenPrepCheck"("eventItemId");
