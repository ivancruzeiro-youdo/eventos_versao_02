-- Observação interna da equipe por link de degustação — nunca exposta na rota pública.
ALTER TABLE "DegustacaoLink" ADD COLUMN IF NOT EXISTS "notes" TEXT;
