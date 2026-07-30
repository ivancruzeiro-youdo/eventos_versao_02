import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';
import { createUploadPresignedUrl, deleteS3Object } from '../lib/s3.js';

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
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  return null;
}

export async function eventMediaRoutes(app: FastifyInstance) {
  // List media assets for an event (used by the "Mídia" tab)
  app.get('/events/:id/media', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };

    const assets = await (prisma as any).eventMediaAsset.findMany({
      where: { eventId },
      orderBy: { order: 'asc' },
    });

    return { success: true, assets };
  });

  // Presign — upload goes straight to S3, avoids routing large video files through our server
  app.post('/events/:id/media/presign', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const { filename, mimeType, sizeBytes } = presignSchema.parse(request.body);

    const detected = mediaTypeFromMime(mimeType);
    if (!detected) return reply.status(400).send({ error: 'Formato não suportado — envie vídeo, imagem ou áudio.' });

    const s3Key = `events/${eventId}/media/${Date.now()}-${filename}`;

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
    const data = confirmSchema.parse(request.body);

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
    const { name, order } = request.body as { name?: string; order?: number };

    const existing = await (prisma as any).eventMediaAsset.findFirst({ where: { id: assetId, eventId } });
    if (!existing) return reply.status(404).send({ error: 'Mídia não encontrada' });

    const asset = await (prisma as any).eventMediaAsset.update({
      where: { id: assetId },
      data: {
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(order !== undefined ? { order } : {}),
      },
    });

    return { success: true, asset };
  });

  // Delete — removes the S3 object too
  app.delete('/events/:id/media/:assetId', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId, assetId } = request.params as { id: string; assetId: string };

    const existing = await (prisma as any).eventMediaAsset.findFirst({ where: { id: assetId, eventId } });
    if (!existing) return reply.status(404).send({ error: 'Mídia não encontrada' });

    await (prisma as any).eventMediaAsset.delete({ where: { id: assetId } });
    try {
      await deleteS3Object(existing.s3Key);
    } catch (s3Error) {
      console.error('S3 delete error (asset row already removed):', s3Error);
    }

    return { success: true };
  });
}
