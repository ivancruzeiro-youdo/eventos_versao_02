import type { FastifyInstance } from 'fastify';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import { getAuthorizeUrl, exchangeCode, refreshAccessToken, getProfile, getPlaylists } from '../lib/spotify.js';

const STATE_TOKEN_TTL = '10m'; // just needs to survive the redirect round-trip to Spotify and back

// Shared by the playlists endpoint (web UI, human session) and the device-facing
// /devices/spotify-token endpoint (devices.ts) — refreshes proactively (60s of slack)
// so both callers always get a token with useful remaining lifetime, never one that
// expires mid-request.
export async function getValidAccessToken(venueId: string): Promise<string | null> {
  const connection = await (prisma as any).venueSpotifyConnection.findUnique({ where: { venueId } });
  if (!connection) return null;

  const expiresInMs = new Date(connection.accessTokenExpiresAt).getTime() - Date.now();
  if (expiresInMs > 60_000) {
    return decrypt(connection.encryptedAccessToken);
  }

  const refreshToken = decrypt(connection.encryptedRefreshToken);
  const refreshed = await refreshAccessToken(refreshToken);

  await (prisma as any).venueSpotifyConnection.update({
    where: { venueId },
    data: {
      encryptedAccessToken: encrypt(refreshed.access_token),
      // Spotify doesn't always rotate the refresh token on refresh — only overwrite it
      // when a new one is actually returned, keep the existing one otherwise.
      ...(refreshed.refresh_token ? { encryptedRefreshToken: encrypt(refreshed.refresh_token) } : {}),
      accessTokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      scope: refreshed.scope,
    },
  });

  return refreshed.access_token;
}

async function assertVenueAccess(app: FastifyInstance, request: any, reply: any, venueId: string) {
  const user = request.user;
  const venue = await (prisma as any).venue.findUnique({ where: { id: venueId } });
  if (!venue) {
    reply.status(404).send({ error: 'Espaço não encontrado' });
    return null;
  }
  if (user.role !== 'admin' && venue.employerId !== user.employerId) {
    reply.status(403).send({ error: 'Acesso negado' });
    return null;
  }
  return venue;
}

export async function spotifyRoutes(app: FastifyInstance) {
  // ── Connect/disconnect (human session, same venue-ownership check as /venues/:id/devices) ──

  app.get('/venues/:id/spotify/authorize', { preHandler: requireAuth }, async (request, reply) => {
    const { id: venueId } = request.params as { id: string };
    const venue = await assertVenueAccess(app, request, reply, venueId);
    if (!venue) return;

    const state = app.jwt.sign({ venueId }, { expiresIn: STATE_TOKEN_TTL });
    return reply.redirect(getAuthorizeUrl(state));
  });

  // Public — Spotify redirects the browser here directly, with no cookie of ours
  // attached. The signed `state` (not the request's auth) is what proves which venue
  // this callback belongs to and that it was actually us who initiated it.
  app.get(
    '/spotify/callback',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { code, state, error } = request.query as { code?: string; state?: string; error?: string };
      const webUrl = process.env.WEB_URL || '';

      if (error || !code || !state) {
        return reply.redirect(`${webUrl}/venues?spotify=error`);
      }

      let venueId: string;
      try {
        ({ venueId } = app.jwt.verify(state) as { venueId: string });
      } catch {
        return reply.redirect(`${webUrl}/venues?spotify=error`);
      }

      try {
        const tokens = await exchangeCode(code);
        const profile = await getProfile(tokens.access_token);

        await (prisma as any).venueSpotifyConnection.upsert({
          where: { venueId },
          create: {
            venueId,
            spotifyUserId: profile.id,
            displayName: profile.display_name || profile.id,
            encryptedAccessToken: encrypt(tokens.access_token),
            encryptedRefreshToken: encrypt(tokens.refresh_token || ''),
            accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
            scope: tokens.scope,
          },
          update: {
            spotifyUserId: profile.id,
            displayName: profile.display_name || profile.id,
            encryptedAccessToken: encrypt(tokens.access_token),
            ...(tokens.refresh_token ? { encryptedRefreshToken: encrypt(tokens.refresh_token) } : {}),
            accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
            scope: tokens.scope,
          },
        });

        return reply.redirect(`${webUrl}/venues/${venueId}?spotify=connected`);
      } catch (err) {
        console.error('Spotify callback error:', err);
        return reply.redirect(`${webUrl}/venues/${venueId}?spotify=error`);
      }
    }
  );

  app.delete('/venues/:id/spotify', { preHandler: requireAuth }, async (request, reply) => {
    const { id: venueId } = request.params as { id: string };
    const venue = await assertVenueAccess(app, request, reply, venueId);
    if (!venue) return;

    await (prisma as any).venueSpotifyConnection.deleteMany({ where: { venueId } });
    return { success: true };
  });

  app.get('/venues/:id/spotify', { preHandler: requireAuth }, async (request, reply) => {
    const { id: venueId } = request.params as { id: string };
    const venue = await assertVenueAccess(app, request, reply, venueId);
    if (!venue) return;

    const connection = await (prisma as any).venueSpotifyConnection.findUnique({ where: { venueId } });
    if (!connection) return { success: true, connected: false };
    return { success: true, connected: true, displayName: connection.displayName };
  });

  app.get('/venues/:id/spotify/playlists', { preHandler: requireAuth }, async (request, reply) => {
    const { id: venueId } = request.params as { id: string };
    const venue = await assertVenueAccess(app, request, reply, venueId);
    if (!venue) return;

    const accessToken = await getValidAccessToken(venueId);
    if (!accessToken) return reply.status(404).send({ error: 'Espaço não tem Spotify conectado' });

    try {
      const playlists = await getPlaylists(accessToken);
      return { success: true, playlists };
    } catch (err) {
      console.error('Spotify playlists error:', err);
      return reply.status(502).send({ error: 'Falha ao buscar playlists do Spotify' });
    }
  });

  // ── Playlist choice per event+venue (EventVenue row — see schema.prisma comment) ──

  app.patch('/events/:eventId/venues/:venueId/spotify-playlist', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const { eventId, venueId } = request.params as { eventId: string; venueId: string };
    const { spotifyPlaylistId, spotifyPlaylistName } = request.body as {
      spotifyPlaylistId: string | null;
      spotifyPlaylistName: string | null;
    };

    const eventVenue = await (prisma as any).eventVenue.findFirst({
      where: { eventId, venueId },
      include: { event: true },
    });
    if (!eventVenue) return reply.status(404).send({ error: 'Evento não vinculado a esse espaço' });
    if (user.role !== 'admin' && eventVenue.event.employerId !== user.employerId) {
      return reply.status(403).send({ error: 'Acesso negado' });
    }

    await (prisma as any).eventVenue.update({
      where: { id: eventVenue.id },
      data: { spotifyPlaylistId: spotifyPlaylistId || null, spotifyPlaylistName: spotifyPlaylistName || null },
    });

    return { success: true };
  });
}
