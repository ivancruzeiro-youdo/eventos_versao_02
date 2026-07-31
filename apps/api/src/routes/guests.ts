import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';
import { GuestStatus } from '@youdo/db';

const createGuestSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  cpf: z.string().optional(),
  email: z.preprocess((val) => val === "" ? undefined : val, z.string().email().optional()),
  isMinor: z.boolean().default(false),
  responsibleName: z.string().optional(),
});

const updateGuestSchema = createGuestSchema.partial().extend({
  status: z.enum(['pending', 'confirmed', 'declined', 'checked_in']).optional(),
});

const rsvpResponseSchema = z.object({
  response: z.enum(['confirmed', 'declined']),
  additionalGuests: z.number().int().min(0).max(3).optional(),
});

// Tenant isolation: non-admin Users may only touch guests belonging to their own
// employer's events. Mirrors the pattern already used in events.ts/devices.ts.
// Freelancer-derived sessions (role 'freelancer'/'receptionist'/'checkin_staff') have no
// employerId concept at all (Freelancer isn't scoped to an employer) — they're meant to
// check in guests across the org by design, so they're exempt from this check rather
// than always failing it.
async function checkEventAccess(user: any, eventId: string): Promise<boolean> {
  if (user.role === 'admin' || user.employerId === undefined) return true;
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { employerId: true } });
  return !!event && event.employerId === user.employerId;
}

export async function guestRoutes(app: FastifyInstance) {
  // List guests for an event
  app.get('/events/:id/guests', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const user = (request as any).user;
    if (!(await checkEventAccess(user, eventId))) return reply.status(403).send({ error: 'Access denied' });
    const query = request.query as { status?: string; page?: string; limit?: string; q?: string };

    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '20', 10);
    const skip = (page - 1) * limit;

    const where: any = { eventId };
    if (query.status) {
      where.status = query.status;
    }
    if (query.q?.trim()) {
      const term = query.q.trim();
      const digits = term.replace(/\D/g, '');
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        ...(digits.length >= 3 ? [{ cpf: { contains: digits } }] : []),
      ];
    }

    const [guests, total] = await Promise.all([
      prisma.guest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.guest.count({ where }),
    ]);

    return {
      success: true,
      guests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // Create guest
  app.post('/events/:id/guests', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const user = (request as any).user;
    if (!(await checkEventAccess(user, eventId))) return reply.status(403).send({ error: 'Access denied' });
    const data = createGuestSchema.parse(request.body);

    // Generate RSVP token
    const rsvpToken = crypto.randomUUID();

    const guest = await prisma.guest.create({
      data: {
        eventId,
        name: data.name,
        phone: data.phone,
        cpf: data.cpf,
        email: data.email,
        isMinor: data.isMinor,
        responsibleName: data.responsibleName,
        rsvpToken,
        status: 'pending',
      },
    });

    // TODO: Queue WhatsApp invitation via BullMQ

    return reply.status(201).send({ success: true, guest });
  });

  // Send invitations to all pending guests
  app.post('/events/:id/guests/invite-all', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const user = (request as any).user;
    if (!(await checkEventAccess(user, eventId))) return reply.status(403).send({ error: 'Access denied' });

    const pendingGuests = await prisma.guest.findMany({
      where: { eventId, status: 'pending' },
    });

    // TODO: Queue invitations for all pending guests

    return {
      success: true,
      queued: pendingGuests.length,
    };
  });

  // Get guest details
  app.get('/guests/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).user;

    const guest = await prisma.guest.findUnique({
      where: { id },
      include: { event: true },
    });

    if (!guest) {
      return reply.status(404).send({ error: 'Guest not found' });
    }
    if (!(await checkEventAccess(user, guest.eventId))) return reply.status(403).send({ error: 'Access denied' });

    return { success: true, guest };
  });

  // Update guest
  app.patch('/guests/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).user;
    const data = updateGuestSchema.parse(request.body);

    const existingGuest = await prisma.guest.findUnique({ where: { id }, select: { eventId: true } });
    if (!existingGuest) return reply.status(404).send({ error: 'Guest not found' });
    if (!(await checkEventAccess(user, existingGuest.eventId))) return reply.status(403).send({ error: 'Access denied' });

    const guest = await prisma.guest.update({
      where: { id },
      data: {
        ...data,
        ...(data.status ? { status: data.status as GuestStatus } : {}),
        ...(data.status && data.status !== 'checked_in'
          ? { rsvpRespondedAt: new Date() }
          : {}),
      },
    });

    return { success: true, guest };
  });

  // Delete guest
  app.delete('/events/:id/guests/:guestId', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId, guestId } = request.params as { id: string; guestId: string };
    const user = (request as any).user;
    if (!(await checkEventAccess(user, eventId))) return reply.status(403).send({ error: 'Access denied' });

    // Verify guest belongs to event
    const guest = await prisma.guest.findFirst({
      where: { id: guestId, eventId },
    });

    if (!guest) {
      return reply.status(404).send({ error: 'Guest not found' });
    }

    await prisma.guest.delete({
      where: { id: guestId },
    });

    return { success: true };
  });

  // Check-in guest
  app.post('/guests/:id/checkin', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).user;

    const guest = await prisma.guest.findUnique({
      where: { id },
    });

    if (!guest) {
      return reply.status(404).send({ error: 'Guest not found' });
    }
    if (!(await checkEventAccess(user, guest.eventId))) return reply.status(403).send({ error: 'Access denied' });

    if (guest.status !== 'confirmed' && guest.status !== 'pending') {
      return reply.status(400).send({
        error: 'Guest cannot be checked in',
        status: guest.status,
      });
    }

    const updated = await prisma.guest.update({
      where: { id },
      data: {
        status: 'checked_in',
        checkedInAt: new Date(),
        checkedInByUserId: user.id,
      },
    });

    return { success: true, guest: updated };
  });

  // Check-in guest (event-scoped path for frontend)
  app.post('/events/:id/guests/:guestId/checkin', { preHandler: requireAuth }, async (request, reply) => {
    const { guestId } = request.params as { id: string; guestId: string };
    const user = (request as any).user;

    const guest = await prisma.guest.findUnique({
      where: { id: guestId },
    });

    if (!guest) {
      return reply.status(404).send({ error: 'Guest not found' });
    }
    if (!(await checkEventAccess(user, guest.eventId))) return reply.status(403).send({ error: 'Access denied' });

    if (guest.status !== 'confirmed' && guest.status !== 'pending') {
      return reply.status(400).send({
        error: 'Guest cannot be checked in',
        status: guest.status,
      });
    }

    const updated = await prisma.guest.update({
      where: { id: guestId },
      data: {
        status: 'checked_in',
        checkedInAt: new Date(),
        checkedInByUserId: user.id,
      },
    });

    return { success: true, guest: updated };
  });

  // PUBLIC: RSVP page - validate token
  app.get('/rsvp/:token', async (request, reply) => {
    const { token } = request.params as { token: string };

    const guest = await prisma.guest.findUnique({
      where: { rsvpToken: token },
      include: { event: { include: { venues: { include: { venue: true } } } } },
    });

    if (!guest) {
      return reply.status(404).send({ error: 'Invalid or expired token' });
    }

    if (guest.event.status === 'cancelled') {
      return reply.status(400).send({ error: 'Event cancelled' });
    }

    return {
      success: true,
      guest: {
        id: guest.id,
        name: guest.name,
        status: guest.status,
      },
      event: {
        id: guest.event.id,
        name: guest.event.name,
        clientName: guest.event.clientName,
        startAt: guest.event.startAt,
        venues: guest.event.venues.map(v => v.venue),
      },
    };
  });

  // PUBLIC: RSVP response
  app.post('/rsvp/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const { response } = rsvpResponseSchema.parse(request.body);

    const guest = await prisma.guest.findUnique({
      where: { rsvpToken: token },
      include: { event: true },
    });

    if (!guest) {
      return reply.status(404).send({ error: 'Invalid or expired token' });
    }

    if (guest.event.status === 'cancelled') {
      return reply.status(400).send({ error: 'Event cancelled' });
    }

    const newStatus: GuestStatus = response === 'confirmed' ? 'confirmed' : 'declined';

    const updated = await prisma.guest.update({
      where: { id: guest.id },
      data: {
        status: newStatus,
        rsvpRespondedAt: new Date(),
      },
    });

    // TODO: Handle waitlist if someone declined

    return {
      success: true,
      guest: {
        id: updated.id,
        name: updated.name,
        status: updated.status,
      },
    };
  });

  // Check-in by CPF (for QR/code entry)
  // Search guest by CPF within the active event window (4h before → 8h after startAt).
  // UTC arithmetic is correct here: DB timestamps and Date() are both UTC.
  app.get('/checkin/cpf/:cpf', { preHandler: requireAuth }, async (request, reply) => {
    const { cpf } = request.params as { cpf: string };

    const now = new Date();
    const windowStart = new Date(now.getTime() - 8 * 60 * 60 * 1000); // 8h ago
    const windowEnd   = new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4h from now

    const guests = await prisma.guest.findMany({
      where: {
        cpf,
        event: { startAt: { gte: windowStart, lte: windowEnd } },
      },
      include: { event: true },
    });

    if (guests.length === 0) {
      return reply.status(404).send({ error: 'Convidado não encontrado em nenhum evento ativo no momento' });
    }

    // Among matched events pick the one whose startAt is closest to now
    const guest = guests.sort((a, b) => {
      const da = Math.abs(new Date(a.event.startAt).getTime() - now.getTime());
      const db = Math.abs(new Date(b.event.startAt).getTime() - now.getTime());
      return da - db;
    })[0];

    return { success: true, guest };
  });

  // GET /checkin/today-events — events happening today (America/Sao_Paulo), for the receptionist
  // to pick which check-in they're running, with guest count summary.
  app.get('/checkin/today-events', { preHandler: requireAuth }, async (request, reply) => {
    const brtDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const dayStart = new Date(`${brtDateStr}T00:00:00-03:00`);
    const dayEnd = new Date(`${brtDateStr}T23:59:59.999-03:00`);

    const events = await prisma.event.findMany({
      where: { startAt: { gte: dayStart, lte: dayEnd } },
      include: {
        venues: { include: { venue: { select: { name: true } } } },
        _count: { select: { guests: true } },
      },
      orderBy: { startAt: 'asc' },
    });

    const withCounts = await Promise.all(events.map(async (ev) => {
      const checkedInCount = await prisma.guest.count({ where: { eventId: ev.id, status: 'checked_in' } });
      return {
        id: ev.id,
        name: ev.name,
        clientName: ev.clientName,
        startAt: ev.startAt,
        venues: ev.venues.filter((v: any) => v.venue).map((v: any) => v.venue.name),
        totalGuests: ev._count.guests,
        checkedInCount,
      };
    }));

    return { success: true, events: withCounts };
  });

  // Generate RSVP token for guest
  app.post('/events/:id/guests/:guestId/rsvp-invite', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId, guestId } = request.params as { id: string; guestId: string };
    const user = (request as any).user;
    if (!(await checkEventAccess(user, eventId))) return reply.status(403).send({ error: 'Access denied' });

    const guest = await prisma.guest.findFirst({
      where: { id: guestId, eventId },
    });

    if (!guest) {
      return reply.status(404).send({ error: 'Guest not found' });
    }

    // Generate RSVP token
    const rsvpToken = crypto.randomUUID();

    const updated = await prisma.guest.update({
      where: { id: guestId },
      data: { rsvpToken },
    });

    return {
      success: true,
      guest: {
        id: updated.id,
        name: updated.name,
        rsvpToken: updated.rsvpToken,
        rsvpLink: `/rsvp/${rsvpToken}`,
      },
    };
  });

  // Get QR code data for guest
  app.get('/events/:id/guests/:guestId/qr', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId, guestId } = request.params as { id: string; guestId: string };
    const user = (request as any).user;
    if (!(await checkEventAccess(user, eventId))) return reply.status(403).send({ error: 'Access denied' });

    const guest = await prisma.guest.findFirst({
      where: { id: guestId, eventId },
      include: { event: true },
    });

    if (!guest) {
      return reply.status(404).send({ error: 'Guest not found' });
    }

    // Generate QR code data (CPF-based for check-in)
    const qrData = JSON.stringify({
      type: 'guest-checkin',
      eventId: guest.eventId,
      guestId: guest.id,
      cpf: guest.cpf,
      name: guest.name,
    });

    return {
      success: true,
      qrData,
      guest: {
        id: guest.id,
        name: guest.name,
        cpf: guest.cpf,
      },
    };
  });

  // Import guests from CSV
  app.post('/events/:id/guests/import', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const user = (request as any).user;
    if (!(await checkEventAccess(user, eventId))) return reply.status(403).send({ error: 'Access denied' });
    const { guests, forceStatus } = request.body as {
      guests: { name: string; email?: string; phone?: string; cpf?: string; status?: string }[];
      forceStatus?: string;
    };

    if (!Array.isArray(guests) || guests.length === 0) {
      return reply.status(400).send({ error: 'No guests provided' });
    }

    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const guestData of guests) {
      try {
        if (!guestData.name) {
          results.errors.push('Missing name for guest');
          continue;
        }

        const desiredStatus = (forceStatus || guestData.status || 'pending') as any;

        // Deduplicate only by unique identifiers (email or CPF), never by name alone
        const existingConditions: any[] = [];
        if (guestData.email) existingConditions.push({ eventId, email: guestData.email });
        if (guestData.cpf)   existingConditions.push({ eventId, cpf: guestData.cpf });

        if (existingConditions.length > 0) {
          const existing = await prisma.guest.findFirst({ where: { OR: existingConditions } });
          if (existing) {
            if (forceStatus && existing.status !== forceStatus) {
              await prisma.guest.update({
                where: { id: existing.id },
                data: { status: desiredStatus },
              });
              results.updated++;
            } else {
              results.skipped++;
            }
            continue;
          }
        }

        await prisma.guest.create({
          data: {
            eventId,
            name: guestData.name,
            email: guestData.email,
            phone: guestData.phone,
            cpf: guestData.cpf,
            status: desiredStatus,
          },
        });

        results.created++;
      } catch (err) {
        results.errors.push(`Error importing ${guestData.name}: ${err}`);
      }
    }

    return reply.status(201).send({ success: true, results });
  });
}
