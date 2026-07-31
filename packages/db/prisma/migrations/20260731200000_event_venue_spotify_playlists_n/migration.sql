-- Event+venue now has N playlists (each with an optional operator comment) instead of a
-- single spotifyPlaylistId/spotifyPlaylistName pair on EventVenue.

CREATE TABLE IF NOT EXISTS "EventVenueSpotifyPlaylist" (
  "id"                  TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "eventVenueId"        TEXT NOT NULL,
  "spotifyPlaylistId"   TEXT NOT NULL,
  "spotifyPlaylistName" TEXT NOT NULL,
  "comment"             TEXT,
  "order"               INTEGER NOT NULL DEFAULT 0,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EventVenueSpotifyPlaylist_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventVenueSpotifyPlaylist_eventVenueId_fkey"
    FOREIGN KEY ("eventVenueId") REFERENCES "EventVenue"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "EventVenueSpotifyPlaylist_eventVenueId_idx" ON "EventVenueSpotifyPlaylist"("eventVenueId");

-- Carry over any single playlist choice already saved under the old columns (this
-- feature only shipped a few hours before this migration, so realistically empty, but
-- safe either way) before dropping them.
INSERT INTO "EventVenueSpotifyPlaylist" ("id", "eventVenueId", "spotifyPlaylistId", "spotifyPlaylistName", "order")
SELECT gen_random_uuid()::text, "id", "spotifyPlaylistId", "spotifyPlaylistName", 0
FROM "EventVenue"
WHERE "spotifyPlaylistId" IS NOT NULL AND "spotifyPlaylistName" IS NOT NULL;

ALTER TABLE "EventVenue" DROP COLUMN IF EXISTS "spotifyPlaylistId";
ALTER TABLE "EventVenue" DROP COLUMN IF EXISTS "spotifyPlaylistName";
