-- Rastreabilidade Guest -> DegustacaoLink: qual link criou qual convidado real, necessário
-- pra editar (adicionar/remover) convidados de um link já inscrito sem afetar outros links
-- inscritos na mesma ocorrência.
ALTER TABLE "Guest" ADD COLUMN IF NOT EXISTS "degustacaoLinkId" TEXT;

ALTER TABLE "Guest" ADD CONSTRAINT "Guest_degustacaoLinkId_fkey"
  FOREIGN KEY ("degustacaoLinkId") REFERENCES "DegustacaoLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Guest_degustacaoLinkId_idx" ON "Guest"("degustacaoLinkId");
