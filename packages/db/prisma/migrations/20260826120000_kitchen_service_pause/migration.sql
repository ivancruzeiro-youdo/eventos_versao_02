-- PAUSA DE SERVIÇO da cozinha: pausa manual com motivo obrigatório + duração pré-determinada
-- (5/10/15/20/30 min). Ao pausar, toda saída ainda pendente é deslocada pra frente pelo tempo
-- da pausa; ao retomar (automático no fim do timer, ou manual via "retomar agora") o tempo não
-- usado é devolvido. Migração aditiva, sem downtime.
ALTER TABLE "KitchenServicePlan"
  ADD COLUMN IF NOT EXISTS "pausedAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pauseUntil"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pauseReason" TEXT;
