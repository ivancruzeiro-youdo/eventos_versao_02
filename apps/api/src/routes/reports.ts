import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';

const dateRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export async function reportRoutes(app: FastifyInstance) {
  // Get dashboard summary
  app.get('/summary', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const query = request.query as { from?: string; to?: string };

    // Degustação é um Event técnico (etapa de conversão de lead), não um evento comercial —
    // fora daqui pra não inflar contagem/receita/relatório.
    const whereClause: any = { degustacao: null };
    if (user.role !== 'admin') {
      whereClause.employerId = user.employerId;
    }
    if (query.from && query.to) {
      whereClause.createdAt = {
        gte: new Date(query.from),
        lte: new Date(query.to),
      };
    }

    const [
      totalEvents,
      totalGuests,
      eventsByStatus,
      eventsByMonth,
    ] = await Promise.all([
      prisma.event.count({ where: whereClause }),
      prisma.guest.count({
        where: {
          event: { degustacao: null, ...(user.role !== 'admin' ? { employerId: user.employerId } : {}) },
        },
      }),
      prisma.event.groupBy({
        by: ['status'],
        where: whereClause,
        _count: { status: true },
      }),
      prisma.$queryRaw`
        SELECT
          DATE_TRUNC('month', "createdAt") as month,
          COUNT(*) as count
        FROM "Event"
        WHERE NOT EXISTS (SELECT 1 FROM "Degustacao" d WHERE d."eventId" = "Event".id)
        ${user.role !== 'admin' ? prisma.$queryRaw`AND "employerId" = ${user.employerId}` : prisma.$queryRaw``}
        GROUP BY DATE_TRUNC('month', "createdAt")
        ORDER BY month DESC
        LIMIT 12
      `,
    ]);

    return {
      success: true,
      summary: {
        totalEvents,
        totalGuests,
        eventsByStatus: eventsByStatus.reduce((acc, curr) => {
          acc[curr.status] = curr._count.status;
          return acc;
        }, {} as Record<string, number>),
        eventsByMonth,
      },
    };
  });

  // Get events report
  app.get('/events', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const query = request.query as { from?: string; to?: string; status?: string };

    const whereClause: any = { degustacao: null };
    if (user.role !== 'admin') {
      whereClause.employerId = user.employerId;
    }
    if (query.from && query.to) {
      whereClause.createdAt = {
        gte: new Date(query.from),
        lte: new Date(query.to),
      };
    }
    if (query.status) {
      whereClause.status = query.status;
    }

    const events = await prisma.event.findMany({
      where: whereClause,
      include: {
        venues: { include: { venue: true } },
        _count: { select: { guests: true } },
        employer: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, events };
  });

  // Get guests report
  app.get('/guests', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const query = request.query as { eventId?: string; status?: string };

    const whereClause: any = {};
    if (query.eventId) {
      // Drill-down num evento específico — se o próprio admin pediu, mostra mesmo sendo
      // degustação; a exclusão é só pra listagem agregada abaixo.
      whereClause.eventId = query.eventId;
    } else if (user.role !== 'admin') {
      whereClause.event = { degustacao: null, employerId: user.employerId };
    } else {
      whereClause.event = { degustacao: null };
    }
    if (query.status) {
      whereClause.status = query.status;
    }

    const guests = await prisma.guest.findMany({
      where: whereClause,
      include: {
        event: { select: { name: true, startAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, guests };
  });

  // Get freelancers report
  app.get('/freelancers', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    
    if (user.role === 'freelancer') {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const freelancers = await prisma.freelancer.findMany({
      select: {
        id: true, name: true, email: true, cpf: true, phone: true, birthDate: true,
        status: true, strikeCount: true, fotoBase64: true, createdAt: true, updatedAt: true,
        // passwordHash intentionally excluded — this report is readable by any
        // non-freelancer role, not just admin
        _count: { select: { applications: true } },
        applications: {
          where: { status: 'approved' },
          include: {
            event: { select: { name: true, startAt: true } },
          },
          take: 5,
          orderBy: { appliedAt: 'desc' },
        },
        penalties: true,
      },
      orderBy: { name: 'asc' },
    });

    return { success: true, freelancers };
  });

  // NPS report — all submitted NPS entries with event info
  app.get('/nps', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;

    const whereClause: any = {
      score: { not: null },
      submittedAt: { not: null },
    };
    if (user.role !== 'admin') {
      whereClause.event = { employerId: user.employerId };
    }

    const entries = await (prisma as any).eventNPSOrganizador.findMany({
      where: whereClause,
      include: {
        event: {
          select: { id: true, name: true, clientName: true, startAt: true },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });

    return { success: true, entries };
  });

  // Get financial report
  app.get('/financial', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const query = request.query as { from?: string; to?: string };

    const whereClause: any = { degustacao: null };
    if (user.role !== 'admin') {
      whereClause.employerId = user.employerId;
    }
    if (query.from && query.to) {
      whereClause.createdAt = {
        gte: new Date(query.from),
        lte: new Date(query.to),
      };
    }

    // Mock financial data - would integrate with billing system
    const events = await prisma.event.findMany({
      where: whereClause,
      select: { id: true, name: true, createdAt: true },
    });

    const financialData = events.map(e => ({
      eventId: e.id,
      eventName: e.name,
      revenue: Math.floor(Math.random() * 50000) + 10000, // Mock
      costs: Math.floor(Math.random() * 30000) + 5000, // Mock
      profit: 0,
    }));

    financialData.forEach(f => f.profit = f.revenue - f.costs);

    return {
      success: true,
      data: financialData,
      total: {
        revenue: financialData.reduce((a, b) => a + b.revenue, 0),
        costs: financialData.reduce((a, b) => a + b.costs, 0),
        profit: financialData.reduce((a, b) => a + b.profit, 0),
      },
    };
  });
}
