import type { FastifyInstance } from 'fastify';
import { prisma } from '../server.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createDownloadPresignedUrl, deleteS3Object } from '../lib/s3.js';

export async function desktopReleaseRoutes(app: FastifyInstance) {
  // Public — a desktop app calls this on every startup to check for updates, before it
  // necessarily has a paired session (same rationale as /devices/pair being public).
  // ?system= defaults to "led-controller" so the existing Windows app (which doesn't
  // send this param) keeps working unchanged as new systems are added alongside it.
  app.get('/devices/latest-version', async (request, reply) => {
    const { system } = request.query as { system?: string };
    const systemKey = system || 'led-controller';

    const latest = await (prisma as any).desktopRelease.findFirst({
      where: { systemKey },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) return { success: true, version: null };

    let downloadUrl: string;
    try {
      downloadUrl = await createDownloadPresignedUrl(latest.s3Key, `${systemKey}-${latest.version}.exe`);
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

  // List all releases across every system — any logged-in user (this is the
  // "Sistemas → Downloads" page; any operator may need to install/reinstall an app).
  // The web page groups these by systemKey itself; N systems can share this one list.
  app.get('/desktop-releases', { preHandler: requireAuth }, async (request, reply) => {
    const releases = await (prisma as any).desktopRelease.findMany({ orderBy: { createdAt: 'desc' } });
    return { success: true, releases };
  });

  // Manual upload from the web UI was disabled by design (2026-07-31): letting anyone
  // with admin access push an arbitrary .exe that every paired venue device downloads
  // and self-installs unattended is too much blast radius for a self-serve web form.
  // Publish new releases via the deploy pipeline/CLI instead (upload to S3 + insert a
  // DesktopRelease row directly) — see desktop/led-controller/README.md. These two
  // routes are kept (rather than deleted) so re-enabling is a one-line revert if the
  // process changes; GET /desktop-releases, DELETE /desktop-releases/:id, and the
  // device-facing GET /devices/latest-version above are unaffected.
  app.post('/desktop-releases/presign', { preHandler: [requireAuth, requireRole(['admin'])] }, async (request, reply) => {
    return reply.status(403).send({ error: 'Upload manual desativado — publique novas versões pelo pipeline de deploy.' });
  });

  app.post('/desktop-releases/confirm', { preHandler: [requireAuth, requireRole(['admin'])] }, async (request, reply) => {
    return reply.status(403).send({ error: 'Upload manual desativado — publique novas versões pelo pipeline de deploy.' });
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
