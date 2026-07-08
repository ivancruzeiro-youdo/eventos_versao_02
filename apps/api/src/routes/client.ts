import type { FastifyInstance } from 'fastify';
import { prisma } from '../server.js';
import { createDownloadPresignedUrl } from '../lib/s3.js';

async function getClientSession(app: FastifyInstance, request: any, reply: any) {
  const auth = request.headers['x-client-auth'] as string | undefined;
  const { token } = request.params as { token: string };

  if (!auth) {
    reply.status(401).send({ error: 'Autenticação necessária' });
    return null;
  }

  try {
    const payload = app.jwt.verify(auth) as { eventId: string; clientToken: string };
    if (payload.clientToken !== token) {
      reply.status(403).send({ error: 'Acesso negado' });
      return null;
    }
    return payload;
  } catch {
    reply.status(401).send({ error: 'Sessão inválida ou expirada' });
    return null;
  }
}

export async function clientRoutes(app: FastifyInstance) {
  // Auth: verify reservation number and return session JWT
  app.post('/client/:token/auth', async (request, reply) => {
    const { token } = request.params as { token: string };
    const { reservationNumber } = request.body as { reservationNumber?: string };

    if (!reservationNumber?.trim()) {
      return reply.status(400).send({ error: 'Número de reserva obrigatório' });
    }

    const event = await prisma.event.findUnique({
      where: { clientToken: token },
      select: {
        id: true,
        name: true,
        clientName: true,
        startAt: true,
        setupAt: true,
        teardownAt: true,
        status: true,
        reservationNumber: true,
        venues: { include: { venue: { select: { id: true, name: true } } } },
      },
    });

    if (!event) {
      return reply.status(404).send({ error: 'Link inválido ou expirado' });
    }

    if (!event.reservationNumber) {
      return reply.status(400).send({ error: 'Este evento ainda não está configurado para acesso de cliente' });
    }

    if (event.reservationNumber.trim().toLowerCase() !== reservationNumber.trim().toLowerCase()) {
      return reply.status(401).send({ error: 'Número de reserva incorreto' });
    }

    const sessionToken = app.jwt.sign(
      { eventId: event.id, clientToken: token },
      { expiresIn: '30d' }
    );

    return {
      success: true,
      sessionToken,
      event: {
        id: event.id,
        name: event.name,
        clientName: event.clientName,
        startAt: event.startAt,
        setupAt: event.setupAt,
        teardownAt: event.teardownAt,
        status: event.status,
        venues: event.venues.map(v => ({ id: v.id, name: v.venue.name })),
      },
    };
  });

  // Get event summary (authenticated)
  app.get('/client/:token/event', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;

    const event = await prisma.event.findUnique({
      where: { id: session.eventId },
      select: {
        id: true,
        name: true,
        clientName: true,
        startAt: true,
        setupAt: true,
        teardownAt: true,
        status: true,
        venues: { include: { venue: { select: { id: true, name: true, address: true } } } },
      },
    });

    if (!event) return reply.status(404).send({ error: 'Evento não encontrado' });
    return { success: true, event };
  });

  // List client-visible files
  app.get('/client/:token/files', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;

    const files = await prisma.file.findMany({
      where: { eventId: session.eventId, visibleToClient: true },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, files };
  });

  // Download a client-visible file (presigned URL)
  app.get('/client/:token/files/:fileId/download', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;
    const { fileId } = request.params as { token: string; fileId: string };

    const file = await prisma.file.findFirst({
      where: { id: fileId, eventId: session.eventId, visibleToClient: true },
    });

    if (!file) return reply.status(404).send({ error: 'Arquivo não encontrado' });

    const downloadUrl = await createDownloadPresignedUrl(file.s3Key, file.name);
    return { success: true, downloadUrl };
  });

  // List guests
  app.get('/client/:token/guests', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;
    const q = request.query as { page?: string; limit?: string; search?: string };

    const page = parseInt(q.page || '1', 10);
    const limit = parseInt(q.limit || '50', 10);
    const skip = (page - 1) * limit;

    const where: any = { eventId: session.eventId };
    if (q.search?.trim()) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { email: { contains: q.search, mode: 'insensitive' } },
      ];
    }

    const [guests, total] = await Promise.all([
      prisma.guest.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
      prisma.guest.count({ where }),
    ]);

    return { success: true, guests, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  });

  // Add guest
  app.post('/client/:token/guests', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;
    const { name, email, phone, cpf } = request.body as any;

    if (!name?.trim()) return reply.status(400).send({ error: 'Nome obrigatório' });

    const guest = await prisma.guest.create({
      data: {
        eventId: session.eventId,
        name: name.trim(),
        email: email?.trim() || undefined,
        phone: phone?.trim() || undefined,
        cpf: cpf?.replace(/\D/g, '') || undefined,
        status: 'confirmed',
        rsvpToken: crypto.randomUUID(),
      },
    });

    return reply.status(201).send({ success: true, guest });
  });

  // Update guest
  app.patch('/client/:token/guests/:guestId', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;
    const { guestId } = request.params as { token: string; guestId: string };
    const { name, email, phone, cpf, status } = request.body as any;

    const existing = await prisma.guest.findFirst({ where: { id: guestId, eventId: session.eventId } });
    if (!existing) return reply.status(404).send({ error: 'Convidado não encontrado' });

    const guest = await prisma.guest.update({
      where: { id: guestId },
      data: {
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(email !== undefined ? { email: email?.trim() || null } : {}),
        ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
        ...(cpf !== undefined ? { cpf: cpf?.replace(/\D/g, '') || null } : {}),
        ...(status ? { status } : {}),
      },
    });

    return { success: true, guest };
  });

  // Delete guest
  app.delete('/client/:token/guests/:guestId', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;
    const { guestId } = request.params as { token: string; guestId: string };

    const existing = await prisma.guest.findFirst({ where: { id: guestId, eventId: session.eventId } });
    if (!existing) return reply.status(404).send({ error: 'Convidado não encontrado' });

    await prisma.guest.delete({ where: { id: guestId } });
    return { success: true };
  });

  // Import guests from CSV
  app.post('/client/:token/guests/import', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;
    const { guests: guestList, forceStatus } = request.body as {
      guests: { name: string; email?: string; phone?: string; cpf?: string }[];
      forceStatus?: string;
    };

    if (!Array.isArray(guestList) || guestList.length === 0) {
      return reply.status(400).send({ error: 'Nenhum convidado fornecido' });
    }

    const results = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };

    for (const g of guestList) {
      if (!g.name?.trim()) { results.errors.push('Nome ausente'); continue; }

      const desiredStatus = (forceStatus || 'confirmed') as any;
      const conditions: any[] = [];
      if (g.email) conditions.push({ eventId: session.eventId, email: g.email });
      if (g.cpf) conditions.push({ eventId: session.eventId, cpf: g.cpf.replace(/\D/g, '') });

      if (conditions.length > 0) {
        const existing = await prisma.guest.findFirst({ where: { OR: conditions } });
        if (existing) {
          if (forceStatus && existing.status !== forceStatus) {
            await prisma.guest.update({ where: { id: existing.id }, data: { status: desiredStatus } });
            results.updated++;
          } else {
            results.skipped++;
          }
          continue;
        }
      }

      await prisma.guest.create({
        data: {
          eventId: session.eventId,
          name: g.name.trim(),
          email: g.email,
          phone: g.phone,
          cpf: g.cpf?.replace(/\D/g, ''),
          status: desiredStatus,
          rsvpToken: crypto.randomUUID(),
        },
      });
      results.created++;
    }

    return reply.status(201).send({ success: true, results });
  });

  // Get plan (read-only summary)
  app.get('/client/:token/plan', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;

    const event = await prisma.event.findUnique({
      where: { id: session.eventId },
      include: {
        items: {
          include: {
            product: { include: { questions: { orderBy: { order: 'asc' } } } },
            answers: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        venues: {
          include: {
            venue: { include: { questions: { orderBy: { order: 'asc' } } } },
          },
        },
        venueAnswers: true,
      },
    });

    if (!event) return reply.status(404).send({ error: 'Evento não encontrado' });
    return { success: true, event };
  });

  // Get schedules (read-only)
  app.get('/client/:token/schedules', async (request, reply) => {
    const session = await getClientSession(app, request, reply);
    if (!session) return;

    const schedules = await prisma.eventSchedule.findMany({
      where: { eventId: session.eventId },
      include: {
        team: { select: { id: true, name: true } },
        file: { select: { id: true, name: true, mimeType: true } },
      },
      orderBy: { startAt: 'asc' },
    });

    return { success: true, schedules };
  });
}
