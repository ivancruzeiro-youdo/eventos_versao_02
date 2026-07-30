import type { FastifyInstance } from 'fastify';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';
import { createDownloadPresignedUrl } from '../lib/s3.js';

const PAIRING_CODE_TTL_MS = 15 * 60 * 1000; // 15 min
const DEVICE_TOKEN_TTL = '365d'; // hardware installs are long-lived

function generatePairingCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

async function getDeviceSession(app: FastifyInstance, request: any, reply: any) {
  const auth = request.headers['x-device-auth'] as string | undefined;
  if (!auth) {
    reply.status(401).send({ error: 'Autenticação de dispositivo necessária' });
    return null;
  }

  let payload: { venueId: string; deviceId: string };
  try {
    payload = app.jwt.verify(auth) as { venueId: string; deviceId: string };
  } catch {
    reply.status(401).send({ error: 'Sessão de dispositivo inválida ou expirada' });
    return null;
  }

  const device = await (prisma as any).venueDevice.findUnique({ where: { id: payload.deviceId } });
  if (!device || device.venueId !== payload.venueId || device.status !== 'active') {
    reply.status(403).send({ error: 'Dispositivo revogado ou não encontrado' });
    return null;
  }

  await (prisma as any).venueDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });

  return { venueId: payload.venueId, deviceId: payload.deviceId };
}

export async function deviceRoutes(app: FastifyInstance) {
  // ── Admin: manage devices for a venue ───────────────────────────────────

  app.get('/venues/:id/devices', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const { id: venueId } = request.params as { id: string };

    const venue = await (prisma as any).venue.findUnique({ where: { id: venueId } });
    if (!venue) return reply.status(404).send({ error: 'Espaço não encontrado' });
    if (user.role !== 'admin' && venue.employerId !== user.employerId) {
      return reply.status(403).send({ error: 'Acesso negado' });
    }

    const devices = await (prisma as any).venueDevice.findMany({
      where: { venueId },
      orderBy: { createdAt: 'asc' },
    });

    return { success: true, devices };
  });

  app.post('/venues/:id/devices', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const { id: venueId } = request.params as { id: string };
    const { name } = request.body as { name?: string };

    if (!name?.trim()) return reply.status(400).send({ error: 'Nome do dispositivo é obrigatório' });

    const venue = await (prisma as any).venue.findUnique({ where: { id: venueId } });
    if (!venue) return reply.status(404).send({ error: 'Espaço não encontrado' });
    if (user.role !== 'admin' && venue.employerId !== user.employerId) {
      return reply.status(403).send({ error: 'Acesso negado' });
    }

    let pairingCode = generatePairingCode();
    // Extremely unlikely collision, but keep it simple and safe
    for (let i = 0; i < 5; i++) {
      const clash = await (prisma as any).venueDevice.findUnique({ where: { pairingCode } });
      if (!clash) break;
      pairingCode = generatePairingCode();
    }

    const device = await (prisma as any).venueDevice.create({
      data: {
        venueId,
        name: name.trim(),
        pairingCode,
        pairingCodeExpiresAt: new Date(Date.now() + PAIRING_CODE_TTL_MS),
        status: 'pending',
      },
    });

    return reply.status(201).send({ success: true, device });
  });

  app.delete('/venues/:id/devices/:deviceId', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const { id: venueId, deviceId } = request.params as { id: string; deviceId: string };

    const venue = await (prisma as any).venue.findUnique({ where: { id: venueId } });
    if (!venue) return reply.status(404).send({ error: 'Espaço não encontrado' });
    if (user.role !== 'admin' && venue.employerId !== user.employerId) {
      return reply.status(403).send({ error: 'Acesso negado' });
    }

    const device = await (prisma as any).venueDevice.findFirst({ where: { id: deviceId, venueId } });
    if (!device) return reply.status(404).send({ error: 'Dispositivo não encontrado' });

    await (prisma as any).venueDevice.update({ where: { id: deviceId }, data: { status: 'revoked' } });

    return { success: true };
  });

  // ── Device: pairing + sync (no human user session) ─────────────────────

  // First run of the Windows app: exchange the pairing code shown in the admin
  // screen for a long-lived deviceAuth JWT, stored locally forever.
  app.post('/devices/pair', async (request, reply) => {
    const { pairingCode } = request.body as { pairingCode?: string };
    if (!pairingCode?.trim()) return reply.status(400).send({ error: 'Código de pareamento obrigatório' });

    const device = await (prisma as any).venueDevice.findUnique({ where: { pairingCode: pairingCode.trim() } });
    if (!device) return reply.status(404).send({ error: 'Código inválido' });
    if (!device.pairingCodeExpiresAt || device.pairingCodeExpiresAt < new Date()) {
      return reply.status(410).send({ error: 'Código expirado — gere um novo na tela do espaço' });
    }

    const deviceToken = crypto.randomUUID();
    const updated = await (prisma as any).venueDevice.update({
      where: { id: device.id },
      data: { deviceToken, status: 'active', pairingCode: null, pairingCodeExpiresAt: null, lastSeenAt: new Date() },
    });

    const deviceAuth = app.jwt.sign({ venueId: updated.venueId, deviceId: updated.id }, { expiresIn: DEVICE_TOKEN_TTL });

    return reply.status(201).send({ success: true, deviceAuth, venueId: updated.venueId, deviceName: updated.name });
  });

  app.post('/devices/heartbeat', async (request, reply) => {
    const session = await getDeviceSession(app, request, reply);
    if (!session) return;
    return { success: true };
  });

  // Offline-first sync: everything this device needs to run its current/upcoming
  // shows without any further network access (media). Spotify playlists are listed
  // too, but actual playback always needs internet (Spotify streams, we never cache it).
  app.get('/devices/sync', async (request, reply) => {
    const session = await getDeviceSession(app, request, reply);
    if (!session) return;

    const now = new Date();

    // No upper-bound cutoff: media should be downloadable well ahead of the show (that's
    // the whole point of offline-first), not just in a narrow last-minute window.
    const eventVenues = await (prisma as any).eventVenue.findMany({
      where: {
        venueId: session.venueId,
        event: {
          status: { in: ['confirmed', 'in_progress'] },
          OR: [
            { startAt: { gte: now } },
            { status: 'in_progress' },
          ],
        },
      },
      include: {
        event: {
          select: {
            id: true, name: true, clientName: true, startAt: true, teardownAt: true, status: true,
            mediaAssets: {
              orderBy: { order: 'asc' },
              select: { id: true, name: true, mediaType: true, mimeType: true, sizeBytes: true, durationSec: true, checksum: true, order: true },
            },
          },
        },
      },
    });

    const events = eventVenues.map((ev: any) => ev.event);

    return { success: true, venueId: session.venueId, events };
  });

  // Presigned download for one media asset — only for events actually linked to this
  // device's venue, so a paired device can't fetch arbitrary media from other venues.
  app.get('/devices/media/:assetId/download', async (request, reply) => {
    const session = await getDeviceSession(app, request, reply);
    if (!session) return;
    const { assetId } = request.params as { assetId: string };

    const asset = await (prisma as any).eventMediaAsset.findUnique({
      where: { id: assetId },
      include: { event: { include: { venues: { select: { venueId: true } } } } },
    });
    if (!asset) return reply.status(404).send({ error: 'Mídia não encontrada' });

    const belongsToThisVenue = asset.event.venues.some((v: any) => v.venueId === session.venueId);
    if (!belongsToThisVenue) return reply.status(403).send({ error: 'Mídia não pertence a este espaço' });

    let downloadUrl: string;
    try {
      downloadUrl = await createDownloadPresignedUrl(asset.s3Key, asset.name);
    } catch (s3Error) {
      console.error('S3 download presign error:', s3Error);
      return reply.status(502).send({ error: 'Falha ao gerar link de download.' });
    }

    return { success: true, downloadUrl, checksum: asset.checksum };
  });
}
