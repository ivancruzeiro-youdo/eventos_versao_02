import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadBufferToS3, s3Client, getS3Bucket } from '../lib/s3.js';

const ALLOWED_IMAGE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

async function getPhotoUrl(s3Key: string): Promise<string> {
  return getSignedUrl(s3Client, new GetObjectCommand({ Bucket: getS3Bucket(), Key: s3Key }), { expiresIn: 3600 });
}

export async function parkingRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

  // GET /checkin/guests/search?q= — busca convidados (nome ou CPF) entre eventos de hoje,
  // para vincular ao registro de veículo. Mesma janela de dia usada em /checkin/today-events.
  app.get('/checkin/guests/search', { preHandler: requireAuth }, async (request, reply) => {
    const { q } = request.query as { q?: string };
    if (!q || q.trim().length < 2) return { success: true, guests: [] };

    const brtDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const dayStart = new Date(`${brtDateStr}T00:00:00-03:00`);
    const dayEnd = new Date(`${brtDateStr}T23:59:59.999-03:00`);
    const term = q.trim();
    const digits = term.replace(/\D/g, '');

    const guests = await prisma.guest.findMany({
      where: {
        event: { startAt: { gte: dayStart, lte: dayEnd } },
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          ...(digits.length >= 3 ? [{ cpf: { contains: digits } }] : []),
        ],
      },
      include: { event: { select: { id: true, name: true } } },
      take: 10,
    });

    return { success: true, guests };
  });

  // POST /parking-entries — multipart: guestId (field) + photo (file)
  app.post('/parking-entries', { preHandler: requireAuth }, async (request, reply) => {
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
    if (!photoBuffer) return reply.status(400).send({ error: 'Foto do carro é obrigatória' });

    const guest = await prisma.guest.findUnique({ where: { id: guestId } });
    if (!guest) return reply.status(404).send({ error: 'Convidado não encontrado' });

    const ext = photoMime.split('/')[1] || 'jpg';
    const s3Key = `parking/${guest.eventId}/${randomUUID()}.${ext}`;
    await uploadBufferToS3(s3Key, photoBuffer, photoMime);

    const entry = await (prisma as any).parkingEntry.create({
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

  // GET /events/:id/parking-entries — lista de veículos registrados para o evento
  app.get('/events/:id/parking-entries', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const entries = await (prisma as any).parkingEntry.findMany({
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
