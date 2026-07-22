import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadBufferToS3, s3Client, getS3Bucket } from '../lib/s3.js';

function cpfValid(digits: string): boolean {
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += parseInt(digits[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === parseInt(digits[9]) && calc(10) === parseInt(digits[10]);
}

const personBody = z.object({
  name: z.string().min(1),
  cpf: z.string().min(11).max(14),
  whatsapp: z.string().optional().nullable(),
  photoUrl: z.string().optional().nullable(),
});

const memberBody = z.object({
  personId: z.string().uuid(),
  role: z.string().min(1),
});

export async function peopleRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } });

  // GET /people/:id/photo — serve photo redirect (no auth: presigned URL is time-limited)
  app.get('/people/:id/photo', async (request, reply) => {
    const { id } = request.params as { id: string };
    const person = await (prisma as any).person.findUnique({ where: { id }, select: { photoUrl: true } });
    if (!person?.photoUrl) return reply.status(404).send({ error: 'Sem foto' });
    const url = await getSignedUrl(s3Client, new GetObjectCommand({
      Bucket: getS3Bucket(),
      Key: person.photoUrl,
    }), { expiresIn: 3600 });
    return reply.redirect(url);
  });

  // POST /people/:id/photo — upload photo to S3
  app.post('/people/:id/photo', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'Nenhum arquivo enviado' });
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(data.mimetype))
      return reply.status(400).send({ error: 'Formato inválido. Use JPG, PNG ou WEBP.' });
    const buffer = await data.toBuffer();
    if (buffer.length > 5 * 1024 * 1024)
      return reply.status(400).send({ error: 'Foto muito grande (máx. 5MB)' });
    const s3Key = `people/${id}/photo`;
    try {
      await uploadBufferToS3(s3Key, buffer, data.mimetype);
    } catch {
      return reply.status(502).send({ error: 'Erro ao salvar foto no armazenamento' });
    }
    const person = await (prisma as any).person.update({ where: { id }, data: { photoUrl: s3Key } });
    return { success: true, person };
  });

  // Search/list people by CPF or name (within the employer)
  app.get('/people', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const { q } = request.query as { q?: string };

    if (!user.employerId) return reply.status(403).send({ error: 'Sem empresa vinculada' });

    const people = await (prisma as any).person.findMany({
      where: {
        employerId: user.employerId,
        ...(q ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { cpf: { contains: q.replace(/\D/g, '') } },
          ],
        } : {}),
      },
      orderBy: { name: 'asc' },
      take: q ? 20 : 500,
    });

    return { success: true, people };
  });

  // Create person (or return existing by CPF)
  app.post('/people', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    if (!user.employerId) return reply.status(403).send({ error: 'Sem empresa vinculada' });

    const data = personBody.parse(request.body);
    const cpfClean = data.cpf.replace(/\D/g, '');

    if (!cpfValid(cpfClean)) {
      return reply.status(400).send({ error: 'CPF inválido. Verifique os dígitos.' });
    }

    const existing = await (prisma as any).person.findUnique({
      where: { employerId_cpf: { employerId: user.employerId, cpf: cpfClean } },
    });

    if (existing) return { success: true, person: existing, existed: true };

    const person = await (prisma as any).person.create({
      data: { ...data, cpf: cpfClean, employerId: user.employerId },
    });

    return reply.status(201).send({ success: true, person, existed: false });
  });

  // Update person
  app.patch('/people/:id', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const { id } = request.params as { id: string };
    const data = personBody.partial().parse(request.body);

    if (data.cpf) data.cpf = (data.cpf as string).replace(/\D/g, '');

    if (data.cpf) {
      const cpfClean = (data.cpf as string).replace(/\D/g, '');
      if (!cpfValid(cpfClean)) {
        return reply.status(400).send({ error: 'CPF inválido. Verifique os dígitos.' });
      }
      // Check for duplicate CPF (excluding self)
      const dup = await (prisma as any).person.findUnique({
        where: { employerId_cpf: { employerId: user.employerId!, cpf: cpfClean } },
      });
      if (dup && dup.id !== id) {
        return reply.status(409).send({ error: `CPF já cadastrado para ${dup.name}.` });
      }
      data.cpf = cpfClean;
    }

    const existing = await (prisma as any).person.findUnique({ where: { id } });
    if (!existing || existing.employerId !== user.employerId)
      return reply.status(404).send({ error: 'Pessoa não encontrada' });

    const person = await (prisma as any).person.update({ where: { id }, data });
    return { success: true, person };
  });

  // ── Event members ─────────────────────────────────────────────────────────

  // List members of an event
  app.get('/events/:eventId/members', { preHandler: requireAuth }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };

    const members = await (prisma as any).eventMember.findMany({
      where: { eventId },
      include: { person: true },
      orderBy: { createdAt: 'asc' },
    });

    return { success: true, members };
  });

  // Add member to event
  app.post('/events/:eventId/members', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const { eventId } = request.params as { eventId: string };
    const { personId, role } = memberBody.parse(request.body);

    // Verify person belongs to same employer
    const person = await (prisma as any).person.findUnique({ where: { id: personId } });
    if (!person || (user.employerId && person.employerId !== user.employerId))
      return reply.status(404).send({ error: 'Pessoa não encontrada' });

    const member = await (prisma as any).eventMember.upsert({
      where: { eventId_personId: { eventId, personId } },
      create: { eventId, personId, role },
      update: { role },
      include: { person: true },
    });

    return reply.status(201).send({ success: true, member });
  });

  // Remove member from event
  app.delete('/events/:eventId/members/:personId', { preHandler: requireAuth }, async (request, reply) => {
    const { eventId, personId } = request.params as { eventId: string; personId: string };

    await (prisma as any).eventMember.deleteMany({
      where: { eventId, personId },
    });

    return { success: true };
  });
}
