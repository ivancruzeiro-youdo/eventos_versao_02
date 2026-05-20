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

const rsvpResponseSchema = z.object({
  response: z.enum(['confirmed', 'declined']),
  additionalGuests: z.number().int().min(0).max(3).optional(),
});

export async function guestRoutes(app: FastifyInstance) {
  // List guests for an event
  app.get('/events/:id/guests', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const query = request.query as { status?: string; page?: string; limit?: string };
    
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '20', 10);
    const skip = (page - 1) * limit;

    const where: any = { eventId };
    if (query.status) {
      where.status = query.status;
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

    const guest = await prisma.guest.findUnique({
      where: { id },
      include: { event: true },
    });

    if (!guest) {
      return reply.status(404).send({ error: 'Guest not found' });
    }

    return { success: true, guest };
  });

  // Update guest
  app.patch('/guests/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = createGuestSchema.partial().parse(request.body);

    const guest = await prisma.guest.update({
      where: { id },
      data,
    });

    return { success: true, guest };
  });

  // Delete guest
  app.delete('/events/:id/guests/:guestId', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId, guestId } = request.params as { id: string; guestId: string };

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
  app.post('/checkin/cpf/:cpf', { preHandler: requireAuth }, async (request, reply) => {
    const { cpf } = request.params as { cpf: string };
    const user = (request as any).user;

    const guest = await prisma.guest.findFirst({
      where: { cpf },
      include: { event: true },
    });

    if (!guest) {
      return reply.status(404).send({ error: 'Guest not found' });
    }

    if (guest.status !== 'confirmed' && guest.status !== 'pending') {
      return reply.status(400).send({
        error: 'Guest cannot be checked in',
        status: guest.status,
      });
    }

    const updated = await prisma.guest.update({
      where: { id: guest.id },
      data: {
        status: 'checked_in',
        checkedInAt: new Date(),
        checkedInByUserId: user.id,
      },
    });

    return { success: true, guest: updated };
  });

  // Generate RSVP token for guest
  app.post('/events/:id/guests/:guestId/rsvp-invite', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId, guestId } = request.params as { id: string; guestId: string };

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
    const { guests } = request.body as { 
      guests: { name: string; email?: string; phone?: string; cpf?: string; status?: string }[] 
    };

    if (!Array.isArray(guests) || guests.length === 0) {
      return reply.status(400).send({ error: 'No guests provided' });
    }

    const results = {
      created: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const guestData of guests) {
      try {
        if (!guestData.name) {
          results.errors.push('Missing name for guest');
          continue;
        }

        // Check if guest with same email or CPF already exists
        const existingConditions: any[] = [{ eventId, name: guestData.name }];
        if (guestData.email) existingConditions.push({ email: guestData.email });
        if (guestData.cpf) existingConditions.push({ cpf: guestData.cpf });

        const existing = await prisma.guest.findFirst({
          where: {
            OR: existingConditions,
          },
        });

        if (existing) {
          results.skipped++;
          continue;
        }

        await prisma.guest.create({
          data: {
            eventId,
            name: guestData.name,
            email: guestData.email,
            phone: guestData.phone,
            cpf: guestData.cpf,
            status: (guestData.status as any) || 'pending',
          },
        });

        results.created++;
      } catch (err) {
        results.errors.push(`Error importing ${guestData.name}: ${err}`);
      }
    }

    return reply.status(201).send({
      success: true,
      results,
    });
  });
}
