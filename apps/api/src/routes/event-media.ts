import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';
import { createUploadPresignedUrl, deleteS3Object, sanitizeFilenameForKey } from '../lib/s3.js';

const presignSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});

const confirmSchema = z.object({
  name: z.string().min(1),
  mediaType: z.enum(['video', 'image', 'audio']),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  s3Key: z.string().min(1),
  durationSec: z.number().positive().optional(),
});

function mediaTypeFromMime(mimeType: string): 'video' | 'image' | 'audio' | null {
  // SVG excluded even though it's `image/*` — it can embed <script>, and this asset is
  // meant to be a photo/video for the LED panel, not an interactive document.
  if (mimeType === 'image/svg+xml') return null;
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  return null;
}

const MAX_SIZE_BYTES: Record<'video' | 'image' | 'audio', number> = {
  video: 500 * 1024 * 1024, // 500MB
  image: 50 * 1024 * 1024,  // 50MB
  audio: 500 * 1024 * 1024, // same ceiling as video — full-event background tracks can run long
};

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

// Tenant isolation: non-admin Users may only touch media belonging to their own
// employer's events (same pattern as guests.ts / events.ts / devices.ts).
async function checkEventAccess(user: any, eventId: string): Promise<boolean> {
  if (user.role === 'admin' || user.employerId === undefined) return true;
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { employerId: true } });
  return !!event && event.employerId === user.employerId;
}

export async function eventMediaRoutes(app: FastifyInstance) {
  // List media assets for an event (used by the "Mídia" tab)
  app.get('/events/:id/media', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const user = (request as any).user;
    if (!(await checkEventAccess(user, eventId))) return reply.status(403).send({ error: 'Access denied' });

    const assets = await (prisma as any).eventMediaAsset.findMany({
      where: { eventId },
      orderBy: { order: 'asc' },
    });

    return { success: true, assets };
  });

  // Presign — upload goes straight to S3, avoids routing large video files through our server
  app.post('/events/:id/media/presign', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const user = (request as any).user;
    if (!(await checkEventAccess(user, eventId))) return reply.status(403).send({ error: 'Access denied' });
    const { filename, mimeType, sizeBytes } = presignSchema.parse(request.body);

    const detected = mediaTypeFromMime(mimeType);
    if (!detected) return reply.status(400).send({ error: 'Formato não suportado — envie vídeo, imagem ou áudio.' });

    const maxSize = MAX_SIZE_BYTES[detected];
    if (sizeBytes > maxSize) {
      const label = detected === 'image' ? 'Imagens' : detected === 'video' ? 'Vídeos' : 'Áudios';
      return reply.status(400).send({ error: `${label} podem ter no máximo ${formatMb(maxSize)}.` });
    }

    const s3Key = `events/${eventId}/media/${Date.now()}-${sanitizeFilenameForKey(filename)}`;

    let uploadUrl: string;
    try {
      uploadUrl = await createUploadPresignedUrl(s3Key, mimeType);
    } catch (s3Error) {
      console.error('S3 presign error:', s3Error);
      return reply.status(502).send({ error: 'Falha ao gerar URL de upload. Verifique a configuração do S3.' });
    }

    return { success: true, uploadUrl, s3Key, mediaType: detected };
  });

  // Confirm — creates the EventMediaAsset row after the direct S3 upload completes.
  // checksum is a fresh random marker (not a content hash) — its only job is to let the
  // Windows device tell "this asset changed since last sync", which a new value on every
  // confirm already guarantees without the cost of hashing the file server-side.
  app.post('/events/:id/media/confirm', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const user = (request as any).user;
    if (!(await checkEventAccess(user, eventId))) return reply.status(403).send({ error: 'Access denied' });
    const data = confirmSchema.parse(request.body);

    const maxSize = MAX_SIZE_BYTES[data.mediaType];
    if (data.sizeBytes > maxSize) {
      const label = data.mediaType === 'image' ? 'Imagens' : data.mediaType === 'video' ? 'Vídeos' : 'Áudios';
      return reply.status(400).send({ error: `${label} podem ter no máximo ${formatMb(maxSize)}.` });
    }

    const maxOrder = await (prisma as any).eventMediaAsset.aggregate({
      where: { eventId },
      _max: { order: true },
    });

    const asset = await (prisma as any).eventMediaAsset.create({
      data: {
        eventId,
        name: data.name,
        mediaType: data.mediaType,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        s3Key: data.s3Key,
        durationSec: data.durationSec ?? null,
        checksum: crypto.randomUUID(),
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });

    return reply.status(201).send({ success: true, asset });
  });

  // Rename / reorder
  app.patch('/events/:id/media/:assetId', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId, assetId } = request.params as { id: string; assetId: string };
    const user = (request as any).user;
    if (!(await checkEventAccess(user, eventId))) return reply.status(403).send({ error: 'Access denied' });
    const { name, order } = request.body as { name?: string; order?: number };

    const existing = await (prisma as any).eventMediaAsset.findFirst({ where: { id: assetId, eventId } });
    if (!existing) return reply.status(404).send({ error: 'Mídia não encontrada' });
    if (existing.deletedAt) return reply.status(400).send({ error: 'Esta mídia já foi excluída (retenção de 4 dias) e não pode mais ser editada.' });

    const asset = await (prisma as any).eventMediaAsset.update({
      where: { id: assetId },
      data: {
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(order !== undefined ? { order } : {}),
      },
    });

    return { success: true, asset };
  });

  // Delete — removes the S3 object too (immediate, operator-initiated; unlike the 20-day
  // retention worker, this doesn't keep a placeholder row — the operator wants it gone now)
  app.delete('/events/:id/media/:assetId', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId, assetId } = request.params as { id: string; assetId: string };
    const user = (request as any).user;
    if (!(await checkEventAccess(user, eventId))) return reply.status(403).send({ error: 'Access denied' });

    const existing = await (prisma as any).eventMediaAsset.findFirst({ where: { id: assetId, eventId } });
    if (!existing) return reply.status(404).send({ error: 'Mídia não encontrada' });

    await (prisma as any).eventMediaAsset.delete({ where: { id: assetId } });
    if (existing.s3Key) {
      try {
        await deleteS3Object(existing.s3Key);
      } catch (s3Error) {
        console.error('S3 delete error (asset row already removed):', s3Error);
      }
    }

    return { success: true };
  });
}
