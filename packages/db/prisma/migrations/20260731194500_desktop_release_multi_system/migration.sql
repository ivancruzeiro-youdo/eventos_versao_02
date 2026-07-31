-- DesktopRelease was originally created outside migration tracking (db push, before
-- this migration history existed) with a single unique constraint on "version" alone.
-- Generalizing it to support N downloadable systems (not just the LED-panel app) means
-- that has to become unique per (systemKey, version) instead.

ALTER TABLE "DesktopRelease" ADD COLUMN IF NOT EXISTS "systemKey" TEXT NOT NULL DEFAULT 'led-controller';
ALTER TABLE "DesktopRelease" ADD COLUMN IF NOT EXISTS "systemLabel" TEXT NOT NULL DEFAULT 'Painel de LED (Windows)';

ALTER TABLE "DesktopRelease" DROP CONSTRAINT IF EXISTS "DesktopRelease_version_key";

CREATE UNIQUE INDEX IF NOT EXISTS "DesktopRelease_systemKey_version_key" ON "DesktopRelease"("systemKey", "version");
CREATE INDEX IF NOT EXISTS "DesktopRelease_systemKey_idx" ON "DesktopRelease"("systemKey");
