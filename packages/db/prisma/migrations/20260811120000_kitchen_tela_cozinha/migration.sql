-- TELA COZINHA: horário de serviço dos itens de A&B + plano de serviço (saídas a cada 15 min).
-- Migração puramente aditiva (colunas nullable + tabelas novas), pode ser aplicada antes do
-- deploy do código, sem downtime e sem risco de rollback.

-- Horário de serviço do item. Exibido no cronograma como merge visual — de propósito NÃO gera
-- linha em "EventSchedule", que exige teamId, recusa sobreposição entre times com 409 e dispara
-- WhatsApp pro time a cada inserção.
ALTER TABLE "EventItem" ADD COLUMN IF NOT EXISTS "serviceStartAt"          TIMESTAMP(3);
ALTER TABLE "EventItem" ADD COLUMN IF NOT EXISTS "serviceEndAt"            TIMESTAMP(3);
ALTER TABLE "EventItem" ADD COLUMN IF NOT EXISTS "serviceTimesUpdatedAt"   TIMESTAMP(3);
ALTER TABLE "EventItem" ADD COLUMN IF NOT EXISTS "serviceTimesUpdatedById" TEXT;

CREATE INDEX IF NOT EXISTS "EventItem_serviceStartAt_idx" ON "EventItem"("serviceStartAt");

-- Um plano por evento (não por espaço): itens de A&B não são escopados por espaço, já que
-- "EventItem"."venueId" é nulo para category='ab'.
CREATE TABLE IF NOT EXISTS "KitchenServicePlan" (
  "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "eventId"         TEXT NOT NULL,
  "intervalMinutes" INTEGER NOT NULL DEFAULT 15,
  "anchorAt"        TIMESTAMP(3),
  "notes"           TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "KitchenServicePlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "KitchenServicePlan_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "KitchenServicePlan_eventId_key" ON "KitchenServicePlan"("eventId");

-- Uma saída de um item. Duplicar um item (quiche às 20h e de novo às 21h30) = duas linhas com
-- "round" diferente, por isso não há unique em (planId, itemName, round).
CREATE TABLE IF NOT EXISTS "KitchenServicePlanEntry" (
  "id"                TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "planId"            TEXT NOT NULL,
  "eventItemId"       TEXT,
  "sourceLabel"       TEXT,
  "itemName"          TEXT NOT NULL,
  "serveAt"           TIMESTAMP(3) NOT NULL,
  "order"             INTEGER NOT NULL DEFAULT 0,
  "round"             INTEGER NOT NULL DEFAULT 1,
  "portionsPerPerson" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "manualQuantity"    DOUBLE PRECISION,
  "status"            TEXT NOT NULL DEFAULT 'pending',
  "servedAt"          TIMESTAMP(3),
  "servedById"        TEXT,
  "notes"             TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "KitchenServicePlanEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "KitchenServicePlanEntry_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "KitchenServicePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- SET NULL e não CASCADE: itens contratados são apagados quando um contrato desaparece do
  -- Userp (fluxo confirm-removal em sync-events.ts). A sequência montada à mão pelo operador
  -- não deve evaporar junto — a linha fica órfã e a tela sinaliza pra ele resolver.
  CONSTRAINT "KitchenServicePlanEntry_eventItemId_fkey"
    FOREIGN KEY ("eventItemId") REFERENCES "EventItem"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "KitchenServicePlanEntry_planId_order_idx" ON "KitchenServicePlanEntry"("planId", "order");
CREATE INDEX IF NOT EXISTS "KitchenServicePlanEntry_eventItemId_idx"  ON "KitchenServicePlanEntry"("eventItemId");
