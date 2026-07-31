import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';
import multipart from '@fastify/multipart';
import { uploadBufferToS3, createUploadPresignedUrl, createDownloadPresignedUrl, deleteS3Object } from '../lib/s3.js';

const presignSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});

const confirmUploadSchema = z.object({
  name: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  s3Key: z.string().min(1),
  comment: z.string().optional(),
});

// This tab accepts arbitrary business documents (contracts, invoices, floor plans,
// photos, videos...), so a strict allowlist would be too narrow — instead block the
// specific types that can execute script if ever opened/rendered directly rather than
// downloaded (downloads already force Content-Disposition: attachment, see s3.ts, but
// this is defense-in-depth in case some future code path renders one inline).
const BLOCKED_MIME_TYPES = ['text/html', 'image/svg+xml', 'application/xhtml+xml'];

function rejectDangerousMimeType(mimeType: string): string | null {
  if (BLOCKED_MIME_TYPES.includes(mimeType.toLowerCase())) {
    return `Tipo de arquivo não permitido: ${mimeType}.`;
  }
  return null;
}

export async function fileRoutes(app: FastifyInstance) {
  // Register multipart plugin for file uploads
  await app.register(multipart, {
    limits: {
      fileSize: 128 * 1024 * 1024, // 128MB
      files: 1,
    },
  });

  // List files for event
  app.get('/events/:id/files', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };

    const files = await prisma.file.findMany({
      where: { eventId },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, files };
  });

  // Upload file directly (multipart/form-data)
  app.post('/events/:id/files/upload', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const user = (request as any).user;

    try {
      const data = await request.file();
      
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      const mimeError = rejectDangerousMimeType(data.mimetype);
      if (mimeError) return reply.status(400).send({ error: mimeError });

      const maxSize = 128 * 1024 * 1024;

      // Get comment from fields
      let comment: string | null = null;
      if (data.fields.comment) {
        const commentField = data.fields.comment;
        const field = Array.isArray(commentField) ? commentField[0] : commentField;
        // @ts-ignore - field can be MultipartFile with value property
        comment = field?.value || null;
      }

      const buffer = await data.toBuffer();

      if (buffer.length > maxSize) {
        return reply.status(400).send({ error: 'File too large. Maximum size is 128MB' });
      }

      // Generate S3 key
      const s3Key = `events/${eventId}/${Date.now()}-${data.filename}`;

      try {
        await uploadBufferToS3(s3Key, buffer, data.mimetype);
      } catch (s3Error) {
        console.error('S3 upload error:', s3Error);
        return reply.status(502).send({ error: 'Falha ao enviar o arquivo para o armazenamento. Verifique a configuração do S3.' });
      }

      const file = await prisma.file.create({
        data: {
          eventId,
          uploadedByUserId: user.id,
          name: data.filename,
          mimeType: data.mimetype,
          sizeBytes: buffer.length,
          s3Key,
          comment,
        },
        include: {
          uploadedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      return reply.status(201).send({ success: true, file });
    } catch (error) {
      console.error('Upload error:', error);
      return reply.status(500).send({ error: 'Upload failed' });
    }
  });

  // Generate presigned URL for S3 upload
  app.post('/events/:id/files/presign', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const user = (request as any).user;
    const { filename, mimeType, sizeBytes } = presignSchema.parse(request.body);

    const mimeError = rejectDangerousMimeType(mimeType);
    if (mimeError) return reply.status(400).send({ error: mimeError });

    const s3Key = `events/${eventId}/${Date.now()}-${filename}`;

    let presignedUrl: string;
    try {
      presignedUrl = await createUploadPresignedUrl(s3Key, mimeType);
    } catch (s3Error) {
      console.error('S3 presign error:', s3Error);
      return reply.status(502).send({ error: 'Falha ao gerar URL de upload. Verifique a configuração do S3.' });
    }

    return {
      success: true,
      uploadUrl: presignedUrl,
      s3Key,
      fields: {
        key: s3Key,
        'Content-Type': mimeType,
      },
    };
  });

  // Confirm upload (called by frontend after S3 upload)
  app.post('/events/:id/files/confirm', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const user = (request as any).user;
    const data = confirmUploadSchema.parse(request.body);

    const mimeError = rejectDangerousMimeType(data.mimeType);
    if (mimeError) return reply.status(400).send({ error: mimeError });

    const file = await prisma.file.create({
      data: {
        eventId,
        uploadedByUserId: user.id,
        name: data.name,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        s3Key: data.s3Key,
        comment: data.comment,
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return reply.status(201).send({ success: true, file });
  });

  // Download file
  app.get('/files/:id/download', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const file = await prisma.file.findUnique({
      where: { id },
    });

    if (!file) {
      return reply.status(404).send({ error: 'File not found' });
    }

    let downloadUrl: string;
    try {
      downloadUrl = await createDownloadPresignedUrl(file.s3Key, file.name);
    } catch (s3Error) {
      console.error('S3 download presign error:', s3Error);
      return reply.status(502).send({ error: 'Falha ao gerar link de download. Verifique a configuração do S3.' });
    }

    return {
      success: true,
      downloadUrl,
      filename: file.name,
      mimeType: file.mimeType,
    };
  });

  // Toggle client visibility for a file
  app.patch('/files/:id/client-visibility', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { visibleToClient } = request.body as { visibleToClient: boolean };

    const file = await prisma.file.findUnique({ where: { id } });
    if (!file) return reply.status(404).send({ error: 'File not found' });

    const updated = await prisma.file.update({
      where: { id },
      data: { visibleToClient: Boolean(visibleToClient) },
    });

    return { success: true, file: updated };
  });

  // Delete file
  app.delete('/files/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).user;

    const file = await prisma.file.findUnique({
      where: { id },
    });

    if (!file) {
      return reply.status(404).send({ error: 'File not found' });
    }

    // Only allow deletion by uploader or admin
    if (file.uploadedByUserId !== user.id && user.role !== 'admin') {
      return reply.status(403).send({ error: 'Not authorized to delete this file' });
    }

    try {
      await deleteS3Object(file.s3Key);
    } catch (s3Error) {
      console.error('S3 delete error:', s3Error);
    }

    await prisma.file.delete({
      where: { id },
    });

    return { success: true };
  });

  // ── Service-level file upload ────────────────────────────────────────────

  // Upload file attached to an EventService slot
  app.post('/services/:id/files/upload', { preHandler: requireAuth }, async (request, reply) => {
    const { id: serviceId } = request.params as { id: string };
    const user = (request as any).user;

    const svc = await (prisma as any).eventService.findUnique({
      where: { id: serviceId },
      select: { eventId: true },
    });
    if (!svc) return reply.status(404).send({ error: 'Service slot not found' });

    try {
      const data = await request.file();
      if (!data) return reply.status(400).send({ error: 'No file uploaded' });

      const mimeError = rejectDangerousMimeType(data.mimetype);
      if (mimeError) return reply.status(400).send({ error: mimeError });

      const buffer = await data.toBuffer();
      if (buffer.length > 128 * 1024 * 1024) {
        return reply.status(400).send({ error: 'File too large. Maximum size is 128MB' });
      }

      const s3Key = `services/${serviceId}/${Date.now()}-${data.filename}`;
      try {
        await uploadBufferToS3(s3Key, buffer, data.mimetype);
      } catch {
        return reply.status(502).send({ error: 'Falha ao enviar arquivo para o armazenamento.' });
      }

      const file = await prisma.file.create({
        data: {
          eventId: svc.eventId,
          serviceId,
          uploadedByUserId: user.id,
          name: data.filename,
          mimeType: data.mimetype,
          sizeBytes: buffer.length,
          s3Key,
        },
      });

      return reply.status(201).send({ success: true, file });
    } catch (error) {
      console.error('Service file upload error:', error);
      return reply.status(500).send({ error: 'Upload failed' });
    }
  });

  // ── Service checklist link/unlink ────────────────────────────────────────

  // Link a checklist to a service slot
  app.post('/services/:id/checklists/:checklistId', { preHandler: requireAuth }, async (request, reply) => {
    const { id: serviceId, checklistId } = request.params as { id: string; checklistId: string };

    const svc = await (prisma as any).eventService.findUnique({ where: { id: serviceId }, select: { eventId: true } });
    if (!svc) return reply.status(404).send({ error: 'Service slot not found' });

    const checklist = await (prisma as any).eventChecklist.findUnique({ where: { id: checklistId }, select: { eventId: true } });
    if (!checklist) return reply.status(404).send({ error: 'Checklist not found' });
    if (checklist.eventId !== svc.eventId) return reply.status(400).send({ error: 'Checklist does not belong to this event' });

    await (prisma as any).eventServiceChecklist.upsert({
      where: { serviceId_checklistId: { serviceId, checklistId } },
      create: { serviceId, checklistId },
      update: {},
    });

    return { success: true };
  });

  // Unlink a checklist from a service slot
  app.delete('/services/:id/checklists/:checklistId', { preHandler: requireAuth }, async (request, reply) => {
    const { id: serviceId, checklistId } = request.params as { id: string; checklistId: string };

    await (prisma as any).eventServiceChecklist.deleteMany({
      where: { serviceId, checklistId },
    });

    return { success: true };
  });
}
