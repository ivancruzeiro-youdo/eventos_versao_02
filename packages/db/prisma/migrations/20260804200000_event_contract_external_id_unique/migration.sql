-- EventContract.externalId passa a ser único: é uma linha por contrato do Userp.
-- Sem essa trava, o sync podia vincular o mesmo contrato a dois eventos e nada barrava a
-- criação de duplicatas (um contrato remarcado no Userp gerou 14 eventos do mesmo evento).
-- Verificado antes de aplicar: nenhum externalId duplicado em produção.
CREATE UNIQUE INDEX IF NOT EXISTS "EventContract_externalId_key" ON "EventContract"("externalId");
