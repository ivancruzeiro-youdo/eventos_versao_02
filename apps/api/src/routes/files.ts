import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';
import multipart from '@fastify/multipart';

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

      // Validate file size (128MB)
      const maxSize = 128 * 1024 * 1024;
      if (data.file.bytesRead > maxSize) {
        return reply.status(400).send({ error: 'File too large. Maximum size is 128MB' });
      }

      // Get comment from fields
      let comment: string | null = null;
      if (data.fields.comment) {
        const commentField = data.fields.comment;
        const field = Array.isArray(commentField) ? commentField[0] : commentField;
        // @ts-ignore - field can be MultipartFile with value property
        comment = field?.value || null;
      }

      // Generate S3 key
      const s3Key = `events/${eventId}/${Date.now()}-${data.filename}`;

      // TODO: Upload to S3
      // For now, we'll just store the file metadata
      // In production, use AWS SDK to upload to S3

      const file = await prisma.file.create({
        data: {
          eventId,
          uploadedByUserId: user.id,
          name: data.filename,
          mimeType: data.mimetype,
          sizeBytes: data.file.bytesRead,
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

    // TODO: Implement actual S3 presigned URL generation
    // For now, return mock URL
    const s3Key = `events/${eventId}/${Date.now()}-${filename}`;
    const presignedUrl = `https://s3.amazonaws.com/${process.env.AWS_S3_BUCKET}/${s3Key}?X-Amz-Algorithm=AWS4-HMAC-SHA256&...`;

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

    // TODO: Generate presigned URL for S3 download
    // For now, return mock URL
    const downloadUrl = `https://s3.amazonaws.com/${process.env.AWS_S3_BUCKET}/${file.s3Key}?response-content-disposition=attachment`;

    return {
      success: true,
      downloadUrl,
      filename: file.name,
      mimeType: file.mimeType,
    };
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

    // TODO: Delete from S3
    // await s3.deleteObject({ Bucket: process.env.AWS_S3_BUCKET, Key: file.s3Key });

    await prisma.file.delete({
      where: { id },
    });

    return { success: true };
  });
}
