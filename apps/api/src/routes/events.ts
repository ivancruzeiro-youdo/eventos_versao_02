import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { EventStatus } from '@youdo/db';

const createEventSchema = z.object({
  name: z.string().min(1),
  clientName: z.string().min(1),
  venueIds: z.array(z.string()).optional(),
  setupAt: z.string().datetime().optional(),
  startAt: z.string().datetime().optional(),
  teardownAt: z.string().datetime().optional(),
  notes: z.string().optional(),
});

const updateEventSchema = createEventSchema.partial();

const statusTransitionSchema = z.object({
  status: z.enum(['confirmed', 'in_progress', 'completed', 'cancelled']),
  reason: z.string().optional(),
});

export async function eventRoutes(app: FastifyInstance) {
  // List events
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    
    let whereClause: any = {};
    
    if (user.role === 'event_owner') {
      whereClause = { employerId: user.employerId };
    } else if (user.role === 'operator') {
      whereClause = { employerId: user.employerId };
    }
    // admin sees all events

    const events = await prisma.event.findMany({
      where: whereClause,
      include: {
        venues: { include: { venue: true } },
        _count: { select: { guests: true } },
        npsOrganizador: { select: { submittedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, events };
  });

  // Create event
  app.post('/', { preHandler: [requireAuth, requireRole(['admin', 'event_owner'])] }, async (request, reply) => {
    const user = (request as any).user;
    const data = createEventSchema.parse(request.body);

    const employerId = user.role === 'admin' 
      ? (request.body as any).employerId || user.employerId 
      : user.employerId;

    const event = await prisma.event.create({
      data: {
        name: data.name,
        clientName: data.clientName,
        employerId,
        setupAt: data.setupAt ? new Date(data.setupAt) : null,
        startAt: data.startAt ? new Date(data.startAt) : null,
        teardownAt: data.teardownAt ? new Date(data.teardownAt) : null,
        notes: data.notes,
        venues: data.venueIds ? {
          create: data.venueIds.map(venueId => ({ venueId })),
        } : undefined,
      },
      include: {
        venues: { include: { venue: true } },
      },
    });

    // TODO: Log to AuditLog

    return reply.status(201).send({ success: true, event });
  });

  // Get event details
  app.get('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).user;

    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        venues: { include: { venue: true } },
        guests: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
        employer: true,
        _count: {
          select: { guests: true },
        },
      },
    });

    if (!event) {
      return reply.status(404).send({ error: 'Event not found' });
    }

    // Check permissions
    if (user.role !== 'admin' && event.employerId !== user.employerId) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    return { success: true, event };
  });

  // Update event
  app.patch('/:id', { preHandler: [requireAuth, requireRole(['admin', 'event_owner', 'operator'])] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = updateEventSchema.parse(request.body);
    const user = (request as any).user;

    const eventBefore = await prisma.event.findUnique({
      where: { id },
      select: { employerId: true, name: true, clientName: true, setupAt: true, startAt: true, teardownAt: true, notes: true },
    });

    if (!eventBefore) {
      return reply.status(404).send({ error: 'Event not found' });
    }

    if (user.role !== 'admin' && eventBefore.employerId !== user.employerId) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const updated = await prisma.event.update({
      where: { id },
      data: {
        name: data.name,
        clientName: data.clientName,
        setupAt: data.setupAt ? new Date(data.setupAt) : undefined,
        startAt: data.startAt ? new Date(data.startAt) : undefined,
        teardownAt: data.teardownAt ? new Date(data.teardownAt) : undefined,
        notes: data.notes,
      },
      include: {
        venues: { include: { venue: true } },
      },
    });

    // Log to AuditLog
    await (prisma as any).auditLog.create({
      data: {
        userId: user.id,
        action: 'update',
        entityType: 'Event',
        entityId: id,
        before: { name: eventBefore.name, clientName: eventBefore.clientName, startAt: eventBefore.startAt, teardownAt: eventBefore.teardownAt, setupAt: eventBefore.setupAt, notes: eventBefore.notes },
        after: { name: data.name, clientName: data.clientName, startAt: data.startAt, teardownAt: data.teardownAt, setupAt: data.setupAt, notes: data.notes },
        ip: request.ip,
      },
    });

    // When teardownAt changes, recalculate endAt for all EventService entries
    if (data.teardownAt) {
      const newEndBase = new Date(data.teardownAt);
      const eventServices = await (prisma as any).eventService.findMany({
        where: { eventId: id },
        include: { service: true },
      });
      for (const es of eventServices) {
        const endOffset: number = es.service?.endOffsetMinutes ?? 60;
        await (prisma as any).eventService.update({
          where: { id: es.id },
          data: { endAt: new Date(newEndBase.getTime() + endOffset * 60_000) },
        });
      }
    }

    return { success: true, event: updated };
  });

  // Delete event
  app.delete('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).user;
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) return reply.status(404).send({ error: 'Not found' });
    if (user.role !== 'admin' && event.employerId !== user.employerId) {
      return reply.status(403).send({ error: 'Access denied' });
    }
    await prisma.event.delete({ where: { id } });
    return { success: true };
  });

  // Update event status (state machine)
  app.patch('/:id/status', { preHandler: [requireAuth, requireRole(['admin', 'event_owner', 'operator'])] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, reason } = statusTransitionSchema.parse(request.body);
    const user = (request as any).user;

    const event = await prisma.event.findUnique({
      where: { id },
    });

    if (!event) {
      return reply.status(404).send({ error: 'Event not found' });
    }

    if (user.role !== 'admin' && event.employerId !== user.employerId) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    // State machine validation
    const validTransitions: Record<string, string[]> = {
      draft: ['confirmed', 'in_progress', 'cancelled'],
      confirmed: ['in_progress', 'cancelled'],
      in_progress: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
      encerrado: [],
    };

    if (!validTransitions[event.status].includes(status)) {
      return reply.status(400).send({
        error: 'Invalid status transition',
        from: event.status,
        to: status,
        allowed: validTransitions[event.status],
      });
    }

    const updated = await prisma.event.update({
      where: { id },
      data: { status: status as EventStatus },
    });

    // TODO: Log to AuditLog with reason

    return { success: true, event: updated };
  });

  // List event services (Taxas)
  app.get('/:id/services', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const services = await (prisma as any).eventService.findMany({
      where: { eventId: id },
      include: { service: true },
      orderBy: { createdAt: 'asc' },
    });
    return { success: true, services };
  });

  // Create event service (Taxa)
  app.post('/:id/services', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const { serviceId, maxSlots, valuePerHour, startAt, endAt, notes, status } = request.body as any;
    if (!serviceId) return reply.status(400).send({ error: 'serviceId obrigatório.' });
    const svc = await (prisma as any).eventService.create({
      data: {
        eventId,
        serviceId,
        maxSlots: maxSlots ?? 1,
        valuePerHour: valuePerHour ?? 0,
        startAt: startAt ? new Date(startAt) : null,
        endAt: endAt ? new Date(endAt) : null,
        notes: notes ?? null,
        status: status ?? 'active',
      },
      include: { service: true },
    });
    return reply.status(201).send({ success: true, service: svc });
  });

  // Update event service
  app.patch('/:id/services/:svcId', { preHandler: requireAuth }, async (request, reply) => {
    const { svcId } = request.params as { id: string; svcId: string };
    const data = request.body as any;
    const updated = await (prisma as any).eventService.update({
      where: { id: svcId },
      data: {
        maxSlots: data.maxSlots,
        valuePerHour: data.valuePerHour,
        startAt: data.startAt ? new Date(data.startAt) : undefined,
        endAt: data.endAt ? new Date(data.endAt) : undefined,
        notes: data.notes,
        status: data.status,
      },
      include: { service: true },
    });
    return { success: true, service: updated };
  });

  // Delete event service
  app.delete('/:id/services/:svcId', { preHandler: requireAuth }, async (request, reply) => {
    const { svcId } = request.params as { id: string; svcId: string };
    await (prisma as any).eventService.delete({ where: { id: svcId } });
    return { success: true };
  });

  // ─── Plano do Evento ──────────────────────────────────────────────────────

  // GET /events/:id/plan-overview — all product questions + venue questions with current answers
  app.get('/:id/plan-overview', { preHandler: requireAuth }, async (request) => {
    const { id: eventId } = request.params as { id: string };

    // Load items with product questions + existing item answers
    const items = await (prisma as any).eventItem.findMany({
      where: { eventId },
      include: {
        product: { include: { questions: { orderBy: { order: 'asc' } } } },
        answers: {
          include: {
            updatedBy: { select: { id: true, name: true } },
            history: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } },
          },
        },
      },
      orderBy: { category: 'asc' },
    });

    // Load venue questions + existing venue answers
    const eventVenues = await (prisma as any).eventVenue.findMany({
      where: { eventId },
      include: {
        venue: {
          include: { questions: { orderBy: { order: 'asc' } } },
        },
      },
    });
    const venueAnswers = await (prisma as any).eventVenueAnswer.findMany({
      where: { eventId },
      include: {
        updatedBy: { select: { id: true, name: true } },
        history: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } },
      },
    });

    return { success: true, items, eventVenues, venueAnswers };
  });

  // PUT /events/:id/venue-answers/:questionId — upsert venue question answer
  app.put('/:id/venue-answers/:questionId', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId, questionId } = request.params as { id: string; questionId: string };
    const user = (request as any).user;
    const { answer } = request.body as { answer: any };

    const existing = await (prisma as any).eventVenueAnswer.findUnique({
      where: { eventId_questionId: { eventId, questionId } },
    });
    if (existing) {
      await (prisma as any).eventVenueAnswer.update({ where: { id: existing.id }, data: { answer, updatedById: user?.id ?? null } });
      await (prisma as any).eventVenueAnswerHistory.create({ data: { answerId: existing.id, before: existing.answer, after: answer, userId: user?.id ?? null } });
    } else {
      const created = await (prisma as any).eventVenueAnswer.create({ data: { eventId, questionId, answer, updatedById: user?.id ?? null } });
      await (prisma as any).eventVenueAnswerHistory.create({ data: { answerId: created.id, before: null, after: answer, userId: user?.id ?? null } });
    }
    return { success: true };
  });

  // GET /venues/:venueId/questions
  app.get('/venues/:venueId/questions', { preHandler: requireAuth }, async (request) => {
    const { venueId } = request.params as { venueId: string };
    const questions = await (prisma as any).venueQuestion.findMany({
      where: { venueId },
      orderBy: { order: 'asc' },
    });
    return { success: true, questions };
  });

  // POST /venues/:venueId/questions
  app.post('/venues/:venueId/questions', { preHandler: requireAuth }, async (request) => {
    const { venueId } = request.params as { venueId: string };
    const body = request.body as { text: string; type: string; required?: boolean; options?: any; order?: number };
    const count = await (prisma as any).venueQuestion.count({ where: { venueId } });
    const q = await (prisma as any).venueQuestion.create({
      data: { venueId, text: body.text, type: body.type, required: body.required ?? false, options: body.options ?? null, order: body.order ?? count },
    });
    return { success: true, question: q };
  });

  // PATCH /venues/:venueId/questions/:qId
  app.patch('/venues/:venueId/questions/:qId', { preHandler: requireAuth }, async (request) => {
    const { qId } = request.params as { venueId: string; qId: string };
    const body = request.body as { text?: string; type?: string; required?: boolean; options?: any; order?: number };
    const q = await (prisma as any).venueQuestion.update({ where: { id: qId }, data: body });
    return { success: true, question: q };
  });

  // DELETE /venues/:venueId/questions/:qId
  app.delete('/venues/:venueId/questions/:qId', { preHandler: requireAuth }, async (request) => {
    const { qId } = request.params as { venueId: string; qId: string };
    await (prisma as any).venueQuestion.delete({ where: { id: qId } });
    return { success: true };
  });

  // Generate (or regenerate) unique client portal link for an event
  app.post('/:id/generate-client-token', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const clientToken = crypto.randomUUID();
    const event = await prisma.event.update({
      where: { id },
      data: { clientToken },
      select: { id: true, clientToken: true, reservationNumber: true },
    });
    return { success: true, event };
  });

  // Set or update the reservation number for an event
  app.patch('/:id/reservation-number', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reservationNumber } = request.body as { reservationNumber: string };
    if (!reservationNumber?.trim()) {
      return reply.status(400).send({ error: 'Número de reserva obrigatório' });
    }
    const event = await prisma.event.update({
      where: { id },
      data: { reservationNumber: reservationNumber.trim() },
      select: { id: true, clientToken: true, reservationNumber: true },
    });
    return { success: true, event };
  });
}
