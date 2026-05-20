import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';

const npsSubmitSchema = z.object({
  score: z.number().int().min(0).max(10),
  comment: z.string().optional(),
});

export async function npsRoutes(app: FastifyInstance) {
  // Get NPS results for event
  app.get('/events/:id/nps', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };

    const responses = await prisma.eventNPS.findMany({
      where: { eventId },
      include: { guest: { select: { name: true } } },
      orderBy: { submittedAt: 'desc' },
    });

    // Calculate NPS
    const promoters = responses.filter(r => r.score && r.score >= 9).length;
    const neutrals = responses.filter(r => r.score && r.score >= 7 && r.score <= 8).length;
    const detractors = responses.filter(r => r.score && r.score <= 6).length;
    const total = responses.length;

    const npsScore = total > 0 
      ? Math.round(((promoters - detractors) / total) * 100)
      : 0;

    return {
      success: true,
      summary: {
        total,
        promoters,
        neutrals,
        detractors,
        npsScore,
      },
      responses,
    };
  });

  // PUBLIC: Get NPS survey by token
  app.get('/nps/:token', async (request, reply) => {
    const { token } = request.params as { token: string };

    // Decode token to get guestId and eventId
    // For now, simple approach: find by guestId in token
    const nps = await prisma.eventNPS.findUnique({
      where: { id: token }, // Simplified - token should encode guest+event
      include: {
        guest: { select: { name: true } },
        event: { select: { name: true, startAt: true } },
      },
    });

    if (!nps) {
      return reply.status(404).send({ error: 'Survey not found or already completed' });
    }

    if (nps.submittedAt) {
      return reply.status(400).send({ error: 'Survey already completed' });
    }

    return {
      success: true,
      guest: nps.guest,
      event: nps.event,
    };
  });

  // PUBLIC: Submit NPS response
  app.post('/nps/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const { score, comment } = npsSubmitSchema.parse(request.body);

    // Find and update
    const existing = await prisma.eventNPS.findFirst({
      where: { id: token },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Survey not found' });
    }

    if (existing.submittedAt) {
      return reply.status(400).send({ error: 'Survey already completed' });
    }

    const updated = await prisma.eventNPS.update({
      where: { id: existing.id },
      data: {
        score,
        comment,
        submittedAt: new Date(),
      },
    });

    return { success: true, response: updated };
  });

  // Create NPS invitations for all confirmed guests
  app.post('/events/:id/nps/create', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };

    // Get all confirmed/checked_in guests without NPS
    const guests = await prisma.guest.findMany({
      where: {
        eventId,
        status: { in: ['confirmed', 'checked_in'] },
        nps: null,
      },
    });

    // Create NPS records for each guest
    const created = await Promise.all(
      guests.map(async (guest) => {
        return prisma.eventNPS.create({
          data: {
            eventId,
            guestId: guest.id,
          },
        });
      })
    );

    return reply.status(201).send({
      success: true,
      created: created.length,
      message: `Created ${created.length} NPS surveys`,
    });
  });
}
