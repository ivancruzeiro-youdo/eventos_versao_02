-- Perguntas padrão centralizadas. NADA é perdido: antes de mexer, tudo que será alterado é copiado
-- para tabelas _bkp_20261104_* (que NÃO são removidas), e respostas conflitantes viram histórico.

-- 0. Cópias de segurança
CREATE TABLE "_bkp_20261104_VenueQuestion" AS TABLE "VenueQuestion";
CREATE TABLE "_bkp_20261104_EventVenueAnswer" AS TABLE "EventVenueAnswer";
CREATE TABLE "_bkp_20261104_EventVenueAnswerHistory" AS TABLE "EventVenueAnswerHistory";
CREATE TABLE "_bkp_20261104_ClientApproval_venue_q" AS SELECT * FROM "ClientApproval" WHERE "itemType" = 'venue_q';

-- 1. Schema
CREATE TABLE "VenueQuestionLink" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VenueQuestionLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VenueQuestionLink_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VenueQuestionLink_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "VenueQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "VenueQuestionLink_venueId_questionId_key" ON "VenueQuestionLink"("venueId", "questionId");
CREATE INDEX "VenueQuestionLink_questionId_idx" ON "VenueQuestionLink"("questionId");

ALTER TABLE "VenueQuestion" ALTER COLUMN "venueId" DROP NOT NULL;
ALTER TABLE "VenueQuestion" DROP CONSTRAINT "VenueQuestion_venueId_fkey";
ALTER TABLE "VenueQuestion" ADD CONSTRAINT "VenueQuestion_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Perguntas idênticas (texto sem caixa/espaços extras + tipo + obrigatória + opções) → uma só (a mais antiga)
CREATE TEMP TABLE _qm AS
  SELECT id, first_value(id) OVER (
    PARTITION BY lower(regexp_replace(btrim(text), '\s+', ' ', 'g')), type, required, coalesce(options::text, '')
    ORDER BY "createdAt", id) AS canon
  FROM "VenueQuestion";

-- 3. Vínculos: cada espaço continua com as perguntas que tinha
INSERT INTO "VenueQuestionLink"("id", "venueId", "questionId", "order")
  SELECT gen_random_uuid()::text, q."venueId", m.canon, q."order"
  FROM "VenueQuestion" q JOIN _qm m ON m.id = q.id
  WHERE q."venueId" IS NOT NULL
  ON CONFLICT DO NOTHING;

-- 4. Respostas: por evento + pergunta, fica a resposta preenchida e mais recente; as outras viram histórico
CREATE TEMP TABLE _aa AS
  SELECT a.id, a."eventId", a."questionId" AS qid, m.canon, a.answer, a."updatedAt",
    row_number() OVER (
      PARTITION BY a."eventId", m.canon
      ORDER BY (a.answer::text IN ('""', '[]', 'null')) ASC, a."updatedAt" DESC, a.id) AS rn
  FROM "EventVenueAnswer" a JOIN _qm m ON m.id = a."questionId";

-- 4a. histórico das respostas perdedoras passa para a vencedora (nada some no CASCADE)
UPDATE "EventVenueAnswerHistory" h SET "answerId" = w.id
  FROM _aa l JOIN _aa w ON w."eventId" = l."eventId" AND w.canon = l.canon AND w.rn = 1
  WHERE h."answerId" = l.id AND l.rn > 1;

-- 4b. valor diferente da perdedora fica registrado no histórico da vencedora e num comentário do evento
INSERT INTO "EventVenueAnswerHistory"("id", "answerId", "before", "after", "userId")
  SELECT gen_random_uuid()::text, w.id, l.answer, w.answer, NULL
  FROM _aa l JOIN _aa w ON w."eventId" = l."eventId" AND w.canon = l.canon AND w.rn = 1
  WHERE l.rn > 1 AND l.answer::text <> w.answer::text;

INSERT INTO "EventComment"("id", "eventId", "userId", "isSystem", "content", "createdAt", "updatedAt")
  SELECT gen_random_uuid()::text, l."eventId", NULL, true,
    'Perguntas padrão unificadas: "' || q.text || '" estava repetida em mais de um espaço com respostas diferentes. '
    || 'Mantida a resposta mais recente: ' || w.answer::text || ' — resposta anterior (preservada no histórico): ' || l.answer::text || '.',
    now(), now()
  FROM _aa l JOIN _aa w ON w."eventId" = l."eventId" AND w.canon = l.canon AND w.rn = 1
  JOIN "VenueQuestion" q ON q.id = l.canon
  WHERE l.rn > 1 AND l.answer::text <> w.answer::text;

-- 4c. aprovações do cliente: chave nova = só a pergunta (venue_q:<perguntaId>); herdada se o cliente
--     aprovou uma resposta de valor igual à que ficou. As chaves antigas permanecem na tabela.
INSERT INTO "ClientApproval"("id", "eventId", "itemType", "itemId", "approvedAt", "ip", "userAgent")
  SELECT DISTINCT ON (ca."eventId", m.canon) gen_random_uuid()::text, ca."eventId", 'venue_q', m.canon, ca."approvedAt", ca.ip, ca."userAgent"
  FROM "ClientApproval" ca
  JOIN _qm m ON m.id = split_part(ca."itemId", '_', 2)
  JOIN _aa a ON a."eventId" = ca."eventId" AND a.qid = m.id
  JOIN _aa w ON w."eventId" = a."eventId" AND w.canon = a.canon AND w.rn = 1 AND w.answer::text = a.answer::text
  WHERE ca."itemType" = 'venue_q'
  ORDER BY ca."eventId", m.canon, ca."approvedAt"
  ON CONFLICT DO NOTHING;

-- 4d. remove só as respostas perdedoras (o conteúdo está no histórico e nas tabelas _bkp_) e reaponta o resto
DELETE FROM "EventVenueAnswer" WHERE id IN (SELECT id FROM _aa WHERE rn > 1);
UPDATE "EventVenueAnswer" a SET "questionId" = m.canon FROM _qm m WHERE m.id = a."questionId" AND m.id <> m.canon;

-- 5. Perguntas duplicadas (já sem respostas apontando) saem; cópia segue em _bkp_20261104_VenueQuestion
DELETE FROM "VenueQuestion" WHERE id IN (SELECT id FROM _qm WHERE id <> canon);

DROP TABLE _aa;
DROP TABLE _qm;
