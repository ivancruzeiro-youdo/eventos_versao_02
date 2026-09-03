import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadBufferToS3, s3Client, getS3Bucket } from '../lib/s3.js';

// Espelha parking.ts — mesmo padrão (foto obrigatória, um registro por convidado).
const ALLOWED_IMAGE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

async function getPhotoUrl(s3Key: string): Promise<string> {
  return getSignedUrl(s3Client, new GetObjectCommand({ Bucket: getS3Bucket(), Key: s3Key }), { expiresIn: 3600 });
}

export async function giftRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

  // POST /gift-entries — multipart: guestId (field) + photo (file)
  app.post('/gift-entries', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    let guestId: string | null = null;
    let photoBuffer: Buffer | null = null;
    let photoMime = '';

    for await (const part of request.parts()) {
      if (part.type === 'field' && part.fieldname === 'guestId') {
        guestId = String((part as any).value ?? '');
      } else if (part.type === 'file') {
        if (!ALLOWED_IMAGE.has(part.mimetype)) { await part.toBuffer(); continue; }
        photoBuffer = await part.toBuffer();
        photoMime = part.mimetype;
      }
    }

    if (!guestId) return reply.status(400).send({ error: 'Convidado não vinculado' });
    if (!photoBuffer) return reply.status(400).send({ error: 'Foto do presente é obrigatória' });

    const guest = await prisma.guest.findUnique({ where: { id: guestId } });
    if (!guest) return reply.status(404).send({ error: 'Convidado não encontrado' });

    const existing = await (prisma as any).giftEntry.findFirst({ where: { guestId } });
    if (existing) return reply.status(409).send({ error: `${guest.name} já tem um presente registrado.` });

    const ext = photoMime.split('/')[1] || 'jpg';
    const s3Key = `gifts/${guest.eventId}/${randomUUID()}.${ext}`;
    await uploadBufferToS3(s3Key, photoBuffer, photoMime);

    const entry = await (prisma as any).giftEntry.create({
      data: {
        eventId: guest.eventId,
        guestId: guest.id,
        guestName: guest.name,
        photoS3Key: s3Key,
        registeredById: user?.id ?? null,
        registeredByName: user?.name ?? null,
      },
    });

    return reply.status(201).send({ success: true, entry });
  });

  // GET /events/:id/gift-entries — lista de presentes registrados para o evento
  app.get('/events/:id/gift-entries', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const entries = await (prisma as any).giftEntry.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
    });
    const withUrls = await Promise.all(entries.map(async (e: any) => ({
      ...e,
      photoUrl: await getPhotoUrl(e.photoS3Key),
    })));
    return { success: true, entries: withUrls };
  });
}
