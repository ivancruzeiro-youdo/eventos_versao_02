import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';
import { randomUUID } from 'crypto';

const closureSchema = z.object({
  itensQuebrados: z.string().optional(),
  situacoesReportadas: z.string().optional(),
  abExcessQty: z.number().min(0).optional(),
  // attachments sent as array of base64 objects
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        mimeType: z.string(),
        sizeBytes: z.number().int().positive(),
        dataBase64: z.string(),
      }),
    )
    .optional(),
});

const npsSubmitSchema = z.object({
  score: z.number().int().min(0).max(10),
  comentario: z.string().optional(),
  respondenteName: z.string().optional(),
  imagemBase64: z.string().optional(),
});

export async function closureRoutes(app: FastifyInstance) {
  // POST /events/:id/encerrar — create closure record, set status encerrado, generate NPS token
  app.post('/events/:id/encerrar', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const user = (request as any).user;

    if (!['admin', 'event_owner', 'operator'].includes(user.role)) {
      return reply.status(403).send({ error: 'Sem permissão' });
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { closure: true },
    });

    if (!event) return reply.status(404).send({ error: 'Evento não encontrado' });
    if (event.closure) return reply.status(400).send({ error: 'Evento já encerrado' });

    const body = closureSchema.parse(request.body);
    const npsToken = randomUUID();

    // Snapshot A&B contracted quantity vs. actual check-ins, for excedente billing
    const [abItems, guests] = await Promise.all([
      (prisma as any).eventItem.findMany({ where: { eventId, category: 'ab' }, select: { quantity: true } }),
      prisma.guest.findMany({ where: { eventId }, select: { status: true } }),
    ]);
    const abContractedQty = abItems.length > 0 ? Math.max(...abItems.map((i: any) => i.quantity)) : null;
    const abCheckedInCount = guests.filter((g) => g.status === 'checked_in').length;

    const closure = await (prisma as any).eventClosure.create({
      data: {
        eventId,
        itensQuebrados: body.itensQuebrados ?? null,
        situacoesReportadas: body.situacoesReportadas ?? null,
        abContractedQty,
        abCheckedInCount,
        abExcessQty: body.abExcessQty ?? null,
        attachments: body.attachments?.length
          ? {
              create: body.attachments.map((a) => ({
                filename: a.filename,
                mimeType: a.mimeType,
                sizeBytes: a.sizeBytes,
                dataBase64: a.dataBase64,
              })),
            }
          : undefined,
        npsOrganizador: {
          create: {
            eventId,
            token: npsToken,
          },
        },
      },
      include: {
        attachments: true,
        npsOrganizador: true,
      },
    });

    await prisma.event.update({
      where: { id: eventId },
      data: { status: 'encerrado' as any },
    });

    const npsUrl = `${process.env.WEB_URL || 'https://eventos.youdobrasil.com.br'}/nps/org/${npsToken}`;

    return reply.status(201).send({ success: true, closure, npsUrl });
  });

  // GET /events/:id/closure — get closure details
  app.get('/events/:id/closure', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };

    const closure = await (prisma as any).eventClosure.findUnique({
      where: { eventId },
      include: {
        attachments: {
          select: {
            id: true,
            filename: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
            // omit dataBase64 from list for performance
          },
        },
        npsOrganizador: {
          select: {
            id: true,
            token: true,
            score: true,
            comentario: true,
            respondenteName: true,
            submittedAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!closure) return reply.status(404).send({ error: 'Encerramento não encontrado' });

    const npsUrl = closure.npsOrganizador
      ? `${process.env.WEB_URL || 'https://eventos.youdobrasil.com.br'}/nps/org/${closure.npsOrganizador.token}`
      : null;

    return { success: true, closure, npsUrl };
  });

  // GET /closure/attachments/:id — download a single attachment (base64)
  app.get('/closure/attachments/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const attachment = await (prisma as any).closureAttachment.findUnique({ where: { id } });
    if (!attachment) return reply.status(404).send({ error: 'Anexo não encontrado' });
    return { success: true, attachment };
  });

  // GET /nps-org/:token — PUBLIC — survey info
  app.get('/nps-org/:token', async (request, reply) => {
    const { token } = request.params as { token: string };

    const nps = await (prisma as any).eventNPSOrganizador.findUnique({
      where: { token },
      include: {
        event: { select: { name: true, startAt: true, clientName: true } },
      },
    });

    if (!nps) return reply.status(404).send({ error: 'Pesquisa não encontrada' });

    return {
      success: true,
      event: nps.event,
      alreadySubmitted: !!nps.submittedAt,
      score: nps.score,
    };
  });

  // POST /nps-org/:token — PUBLIC — submit NPS
  app.post('/nps-org/:token', async (request, reply) => {
    const { token } = request.params as { token: string };

    const nps = await (prisma as any).eventNPSOrganizador.findUnique({ where: { token } });

    if (!nps) return reply.status(404).send({ error: 'Pesquisa não encontrada' });
    if (nps.submittedAt) return reply.status(400).send({ error: 'Pesquisa já respondida' });

    const body = npsSubmitSchema.parse(request.body);

    const updated = await (prisma as any).eventNPSOrganizador.update({
      where: { token },
      data: {
        score: body.score,
        comentario: body.comentario ?? null,
        respondenteName: body.respondenteName ?? null,
        imagemBase64: body.imagemBase64 ?? null,
        submittedAt: new Date(),
      },
    });

    return { success: true, nps: updated };
  });

  // GET /events/:id/nps-org — admin view NPS result
  app.get('/events/:id/nps-org', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };

    const nps = await (prisma as any).eventNPSOrganizador.findUnique({
      where: { eventId },
      include: {
        event: { select: { name: true, startAt: true } },
      },
    });

    if (!nps) return reply.status(404).send({ error: 'NPS não encontrado para este evento' });

    const npsUrl = `${process.env.WEB_URL || 'https://eventos.youdobrasil.com.br'}/nps/org/${nps.token}`;

    return { success: true, nps, npsUrl };
  });
}
