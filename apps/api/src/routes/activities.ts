import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadBufferToS3, s3Client, getS3Bucket } from '../lib/s3.js';

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

const INCLUDE = {
  assignedTo: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true } },
  completedBy: { select: { id: true, name: true } },
  files: { orderBy: { createdAt: 'asc' as const } },
};

export async function activitiesRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 10 } });

  // GET /activity-files/:fileId — presigned redirect (no auth needed)
  app.get('/activity-files/:fileId', async (request, reply) => {
    const { fileId } = request.params as { fileId: string };
    const file = await (prisma as any).eventActivityFile.findUnique({ where: { id: fileId } });
    if (!file) return reply.status(404).send({ error: 'Arquivo não encontrado' });
    const url = await getSignedUrl(s3Client, new GetObjectCommand({
      Bucket: getS3Bucket(),
      Key: file.s3Key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(file.name)}"`,
    }), { expiresIn: 3600 });
    return reply.redirect(url);
  });

  // GET /events/:id/assignable-users
  app.get('/events/:id/assignable-users', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const event = await (prisma as any).event.findUnique({ where: { id: eventId }, select: { employerId: true } });
    if (!event) return reply.status(404).send({ error: 'Evento não encontrado' });
    const users = await (prisma as any).user.findMany({
      where: { employerId: event.employerId },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    });
    return { success: true, users };
  });

  // GET /events/:id/activities
  app.get('/events/:id/activities', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const activities = await (prisma as any).eventActivity.findMany({
      where: { eventId },
      include: INCLUDE,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    return { success: true, activities };
  });

  // POST /events/:id/activities
  app.post('/events/:id/activities', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const { id: eventId } = request.params as { id: string };
    const { title, description, assignedToId, dueAt } = request.body as any;
    if (!title?.trim()) return reply.status(400).send({ error: 'Título obrigatório' });
    const activity = await (prisma as any).eventActivity.create({
      data: {
        eventId,
        title: title.trim(),
        description: description?.trim() || null,
        assignedToId: assignedToId || null,
        createdById: user.id,
        dueAt: dueAt ? new Date(dueAt) : null,
      },
      include: INCLUDE,
    });
    return reply.status(201).send({ success: true, activity });
  });

  // PATCH /events/:id/activities/:actId
  app.patch('/events/:id/activities/:actId', { preHandler: requireAuth }, async (request, reply) => {
    const { actId } = request.params as { id: string; actId: string };
    const body = request.body as any;
    const data: any = {};
    if (body.title !== undefined) data.title = body.title.trim();
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.assignedToId !== undefined) data.assignedToId = body.assignedToId || null;
    if (body.dueAt !== undefined) data.dueAt = body.dueAt ? new Date(body.dueAt) : null;
    const activity = await (prisma as any).eventActivity.update({
      where: { id: actId }, data, include: INCLUDE,
    });
    return { success: true, activity };
  });

  // DELETE /events/:id/activities/:actId
  app.delete('/events/:id/activities/:actId', { preHandler: requireAuth }, async (request, reply) => {
    const { actId } = request.params as { id: string; actId: string };
    await (prisma as any).eventActivity.delete({ where: { id: actId } });
    return { success: true };
  });

  // POST /events/:id/activities/:actId/complete — multipart: response (required) + optional files
  app.post('/events/:id/activities/:actId/complete', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const { actId } = request.params as { id: string; actId: string };

    const existing = await (prisma as any).eventActivity.findUnique({ where: { id: actId } });
    if (!existing) return reply.status(404).send({ error: 'Atividade não encontrada' });
    if (existing.status === 'done') return reply.status(400).send({ error: 'Atividade já concluída' });

    let responseText = '';
    const pendingFiles: { name: string; mimeType: string; sizeBytes: number; s3Key: string }[] = [];

    for await (const part of request.parts()) {
      if (part.type === 'field' && part.fieldname === 'response') {
        responseText = String((part as any).value ?? '');
      } else if (part.type === 'file') {
        if (!ALLOWED_MIME.has(part.mimetype)) { await part.toBuffer(); continue; }
        const buffer = await part.toBuffer();
        if (buffer.length > 20 * 1024 * 1024) continue;
        const s3Key = `activities/${actId}/files/${randomUUID()}/${part.filename}`;
        await uploadBufferToS3(s3Key, buffer, part.mimetype);
        pendingFiles.push({ name: part.filename || 'arquivo', mimeType: part.mimetype, sizeBytes: buffer.length, s3Key });
      }
    }

    if (!responseText.trim()) {
      return reply.status(400).send({ error: 'Resposta é obrigatória para concluir a atividade' });
    }

    for (const f of pendingFiles) {
      await (prisma as any).eventActivityFile.create({ data: { activityId: actId, ...f } });
    }

    const activity = await (prisma as any).eventActivity.update({
      where: { id: actId },
      data: { status: 'done', completedAt: new Date(), completedById: user.id, response: responseText.trim() },
      include: INCLUDE,
    });

    return { success: true, activity };
  });

  // POST /events/:id/activities/:actId/reopen
  app.post('/events/:id/activities/:actId/reopen', { preHandler: requireAuth }, async (request, reply) => {
    const { actId } = request.params as { id: string; actId: string };
    const activity = await (prisma as any).eventActivity.update({
      where: { id: actId },
      data: { status: 'open', completedAt: null, completedById: null, response: null },
      include: INCLUDE,
    });
    return { success: true, activity };
  });
}
