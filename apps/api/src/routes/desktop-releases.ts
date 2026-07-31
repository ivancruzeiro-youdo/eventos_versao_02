import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createUploadPresignedUrl, createDownloadPresignedUrl, deleteS3Object, sanitizeFilenameForKey } from '../lib/s3.js';

const presignSchema = z.object({
  filename: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});

const confirmSchema = z.object({
  version: z.string().min(1),
  s3Key: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  releaseNotes: z.string().optional(),
});

export async function desktopReleaseRoutes(app: FastifyInstance) {
  // Public — the Windows app calls this on every startup to check for updates, before
  // it necessarily has a paired session (same rationale as /devices/pair being public).
  app.get('/devices/latest-version', async (request, reply) => {
    const latest = await (prisma as any).desktopRelease.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!latest) return { success: true, version: null };

    let downloadUrl: string;
    try {
      downloadUrl = await createDownloadPresignedUrl(latest.s3Key, `YouDoLedController-${latest.version}.exe`);
    } catch (s3Error) {
      console.error('S3 download presign error (latest-version):', s3Error);
      return reply.status(502).send({ error: 'Falha ao gerar link de download.' });
    }

    return {
      success: true,
      version: latest.version,
      downloadUrl,
      releaseNotes: latest.releaseNotes,
      publishedAt: latest.createdAt,
    };
  });

  // List all releases — any logged-in user (this is the "Sistemas → Downloads" page;
  // any operator may need to install/reinstall the app on a venue PC).
  app.get('/desktop-releases', { preHandler: requireAuth }, async (request, reply) => {
    const releases = await (prisma as any).desktopRelease.findMany({ orderBy: { createdAt: 'desc' } });
    return { success: true, releases };
  });

  // Publishing a new release is admin-only — this ships to every paired device.
  app.post('/desktop-releases/presign', { preHandler: [requireAuth, requireRole(['admin'])] }, async (request, reply) => {
    const { filename, sizeBytes } = presignSchema.parse(request.body);

    const maxSize = 300 * 1024 * 1024; // 300MB — generous ceiling for a self-contained single-file .exe
    if (sizeBytes > maxSize) {
      return reply.status(400).send({ error: `O instalável pode ter no máximo ${Math.round(maxSize / (1024 * 1024))}MB.` });
    }

    const s3Key = `desktop-releases/${Date.now()}-${sanitizeFilenameForKey(filename)}`;
    let uploadUrl: string;
    try {
      uploadUrl = await createUploadPresignedUrl(s3Key, 'application/octet-stream');
    } catch (s3Error) {
      console.error('S3 presign error (desktop-release):', s3Error);
      return reply.status(502).send({ error: 'Falha ao gerar URL de upload. Verifique a configuração do S3.' });
    }

    return { success: true, uploadUrl, s3Key };
  });

  app.post('/desktop-releases/confirm', { preHandler: [requireAuth, requireRole(['admin'])] }, async (request, reply) => {
    const data = confirmSchema.parse(request.body);

    const existing = await (prisma as any).desktopRelease.findUnique({ where: { version: data.version } });
    if (existing) return reply.status(400).send({ error: `Já existe uma versão "${data.version}" publicada.` });

    const release = await (prisma as any).desktopRelease.create({
      data: {
        version: data.version,
        s3Key: data.s3Key,
        sizeBytes: data.sizeBytes,
        releaseNotes: data.releaseNotes || null,
      },
    });

    return reply.status(201).send({ success: true, release });
  });

  app.delete('/desktop-releases/:id', { preHandler: [requireAuth, requireRole(['admin'])] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await (prisma as any).desktopRelease.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Versão não encontrada' });

    await (prisma as any).desktopRelease.delete({ where: { id } });
    try {
      await deleteS3Object(existing.s3Key);
    } catch (s3Error) {
      console.error('S3 delete error (desktop-release, row already removed):', s3Error);
    }

    return { success: true };
  });
}
