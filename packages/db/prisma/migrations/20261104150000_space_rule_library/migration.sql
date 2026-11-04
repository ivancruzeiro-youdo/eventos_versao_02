CREATE TABLE "SpaceRule" (
  "id" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SpaceRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VenueRuleLink" (
  "id" TEXT NOT NULL,
  "venueId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VenueRuleLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VenueRuleLink_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VenueRuleLink_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "SpaceRule"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "VenueRuleLink_venueId_ruleId_key" ON "VenueRuleLink"("venueId", "ruleId");
CREATE INDEX "VenueRuleLink_ruleId_idx" ON "VenueRuleLink"("ruleId");

-- Migra as regras atuais (texto por espaço): textos iguais (ignorando caixa e espaços) viram UMA regra
-- na biblioteca, vinculada a todos os espaços que a tinham.
CREATE TEMP TABLE _r AS
  SELECT DISTINCT ON (k) k, btrim(text) AS text, gen_random_uuid()::text AS rid, "createdAt"
  FROM (SELECT text, "createdAt", lower(regexp_replace(btrim(text), '\s+', ' ', 'g')) AS k FROM "VenueRule") x
  ORDER BY k, "createdAt";
INSERT INTO "SpaceRule"("id", "text", "createdAt", "updatedAt") SELECT rid, text, "createdAt", now() FROM _r;
INSERT INTO "VenueRuleLink"("id", "venueId", "ruleId", "order")
  SELECT gen_random_uuid()::text, v."venueId", r.rid, v."order"
  FROM "VenueRule" v JOIN _r r ON r.k = lower(regexp_replace(btrim(v.text), '\s+', ' ', 'g'))
  ON CONFLICT DO NOTHING;
DROP TABLE _r;
