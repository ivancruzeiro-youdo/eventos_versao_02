ALTER TABLE "EventVenue" ADD COLUMN IF NOT EXISTS "spotifyPlaylistId" TEXT;
ALTER TABLE "EventVenue" ADD COLUMN IF NOT EXISTS "spotifyPlaylistName" TEXT;

CREATE TABLE IF NOT EXISTS "VenueSpotifyConnection" (
  "id"                    TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "venueId"               TEXT NOT NULL,
  "spotifyUserId"         TEXT NOT NULL,
  "displayName"           TEXT NOT NULL,
  "encryptedAccessToken"  TEXT NOT NULL,
  "encryptedRefreshToken" TEXT NOT NULL,
  "accessTokenExpiresAt"  TIMESTAMP(3) NOT NULL,
  "scope"                 TEXT NOT NULL,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,

  CONSTRAINT "VenueSpotifyConnection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VenueSpotifyConnection_venueId_key" UNIQUE ("venueId"),
  CONSTRAINT "VenueSpotifyConnection_venueId_fkey"
    FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
