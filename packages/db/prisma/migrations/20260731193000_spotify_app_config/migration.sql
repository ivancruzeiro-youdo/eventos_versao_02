CREATE TABLE IF NOT EXISTS "SpotifyAppConfig" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "clientId"     TEXT NOT NULL,
  "clientSecret" TEXT NOT NULL,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SpotifyAppConfig_pkey" PRIMARY KEY ("id")
);
