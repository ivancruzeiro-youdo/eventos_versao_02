import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';

const applySchema = z.object({
  role: z.string().min(1),
});

const penaltySchema = z.object({
  reason: z.string().min(1),
  severity: z.enum(['light', 'medium', 'grave']),
  eventId: z.string().optional(),
});

const updateApplicationSchema = z.object({
  status: z.enum(['approved', 'rejected']),
});

const loginSchema = z.object({
  email: z.string().email(),
  cpf: z.string().min(11),
  password: z.string().min(6),
});

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  cpf: z.string().min(11),
  phone: z.string().optional(),
  password: z.string().min(6),
});

export async function freelancerRoutes(app: FastifyInstance) {
  // Freelancer login
  app.post('/freelancers/auth/login', async (request, reply) => {
    const { email, cpf, password } = loginSchema.parse(request.body);

    const freelancer = await prisma.freelancer.findFirst({
      where: {
        email,
        cpf: cpf.replace(/\D/g, ''),
      },
    });

    if (!freelancer) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    if (!freelancer.passwordHash) {
      return reply.status(401).send({ error: 'Password not set' });
    }

    const valid = await bcrypt.compare(password, freelancer.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    if (freelancer.status === 'suspended') {
      return reply.status(403).send({ error: 'Account suspended' });
    }

    // Create token
    const token = await reply.jwtSign({
      sub: freelancer.id,
      email: freelancer.email,
      name: freelancer.name,
      role: 'freelancer',
    });

    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return {
      success: true,
      freelancer: {
        id: freelancer.id,
        name: freelancer.name,
        email: freelancer.email,
      },
    };
  });

  // Freelancer registration
  app.post('/freelancers/auth/register', async (request, reply) => {
    const data = registerSchema.parse(request.body);

    // Check if email or CPF already exists
    const existing = await prisma.freelancer.findFirst({
      where: {
        OR: [
          { email: data.email },
          { cpf: data.cpf.replace(/\D/g, '') },
        ],
      },
    });

    if (existing) {
      return reply.status(400).send({ error: 'Email or CPF already registered' });
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const freelancer = await prisma.freelancer.create({
      data: {
        name: data.name,
        email: data.email,
        cpf: data.cpf.replace(/\D/g, ''),
        phone: data.phone,
        passwordHash,
        status: 'active',
      },
    });

    // Auto login after registration
    const token = await reply.jwtSign({
      sub: freelancer.id,
      email: freelancer.email,
      name: freelancer.name,
      role: 'freelancer',
    });

    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return reply.status(201).send({
      success: true,
      freelancer: {
        id: freelancer.id,
        name: freelancer.name,
        email: freelancer.email,
      },
    });
  });

  // Freelancer logout
  app.post('/freelancers/auth/logout', async (request, reply) => {
    reply.clearCookie('token', { path: '/' });
    return { success: true };
  });

  // Get current freelancer
  app.get('/freelancers/me', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    
    if (user.role !== 'freelancer') {
      return reply.status(403).send({ error: 'Freelancer access only' });
    }

    const freelancer = await prisma.freelancer.findUnique({
      where: { id: user.id },
      include: {
        services: {
          include: {
            service: true,
          },
        },
        penalties: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        _count: {
          select: {
            applications: { where: { status: 'approved' } },
          },
        },
      },
    });

    if (!freelancer) {
      return reply.status(404).send({ error: 'Freelancer not found' });
    }

    return { success: true, freelancer };
  });

  // List jobs for freelancer portal
  app.get('/freelancer/jobs', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    
    if (user.role !== 'freelancer') {
      return reply.status(403).send({ error: 'Freelancer access only' });
    }

    const query = request.query as { 
      status?: string; 
      from?: string; 
      to?: string;
      city?: string;
    };

    // Get freelancer's services
    const freelancer = await prisma.freelancer.findUnique({
      where: { id: user.id },
      include: {
        services: {
          include: {
            service: true,
          },
        },
      },
    });

    if (!freelancer) {
      return reply.status(404).send({ error: 'Freelancer not found' });
    }

    // Get service IDs that the freelancer is authorized to perform
    const serviceIds = freelancer.services.map((s: any) => s.serviceId);

    // Find product IDs linked to the freelancer's services via ProductServiceLink
    const productLinks = await (prisma as any).productServiceLink.findMany({
      where: { serviceId: { in: serviceIds } },
      select: { productId: true, serviceId: true },
    });
    const linkedProductIds = productLinks.map((pl: any) => pl.productId);

    // Find EventItems matching the freelancer's services (by productId or by name match)
    const matchingItems = await (prisma as any).eventItem.findMany({
      where: {
        category: 'staff',
        OR: [
          { productId: { in: linkedProductIds } },
          // fallback: name match for items not linked via Product
          { name: { in: freelancer.services.map((s: any) => s.service?.name).filter(Boolean) } },
        ],
        event: { status: { in: ['confirmed', 'in_progress'] } },
      },
      select: { eventId: true, name: true, quantity: true, productId: true },
    });

    const eventIds = new Set(matchingItems.map((i: any) => i.eventId));

    const where: any = {
      id: { in: Array.from(eventIds) },
      status: { in: ['confirmed', 'in_progress'] },
    };

    if (query.from && query.to) {
      where.startAt = {
        gte: new Date(query.from),
        lte: new Date(query.to),
      };
    }

    const events = await prisma.event.findMany({
      where,
      include: {
        venues: { include: { venue: true } },
        employer: { select: { name: true } },
        items: {
          where: {
            category: 'staff',
            OR: [
              { productId: { in: linkedProductIds } },
              { name: { in: freelancer.services.map((s: any) => s.service?.name).filter(Boolean) } },
            ],
          },
        },
        _count: { select: {
          applications: { where: { status: 'approved' } },
          guests: { where: { status: 'confirmed' } },
        }},
      },
      orderBy: { startAt: 'asc' },
    });

    // Filter by city if requested
    let filteredEvents = events;
    if (query.city) {
      filteredEvents = events.filter((e: any) =>
        e.venues.some((v: any) => v.venue.city?.toLowerCase().includes(query.city!.toLowerCase()))
      );
    }

    // Build service name→id map for slot details
    const serviceNameMap = new Map(
      freelancer.services.map((s: any) => [s.service?.name?.toLowerCase(), s.serviceId])
    );

    // Count approved applications per (eventId, role) for real filledCount
    const allEventIds = filteredEvents.map((e: any) => e.id);
    const approvedApps = await prisma.freelancerApplication.findMany({
      where: { eventId: { in: allEventIds }, status: 'approved' },
      select: { eventId: true, role: true },
    });
    const approvedCountMap = new Map<string, number>();
    for (const app of approvedApps) {
      const key = `${app.eventId}::${app.role}`;
      approvedCountMap.set(key, (approvedCountMap.get(key) ?? 0) + 1);
    }

    // Transform events to job format — skip slots that are already full
    const jobs = filteredEvents
      .map((event: any) => {
        const slots = event.items
          .map((item: any) => {
            const qty = Math.round(item.quantity);
            const filled = approvedCountMap.get(`${event.id}::${item.name}`) ?? 0;
            return {
              id: item.id,
              serviceId: serviceNameMap.get(item.name?.toLowerCase()) || item.productId,
              quantity: qty,
              filledCount: filled,
              eventName: item.name,
            };
          })
          .filter((slot: any) => slot.filledCount < slot.quantity); // hide full slots

        return slots.length > 0
          ? {
              id: event.id,
              event: {
                id: event.id,
                name: event.name,
                startAt: event.startAt,
                venues: event.venues,
                employer: event.employer,
              },
              slots,
            }
          : null;
      })
      .filter(Boolean); // hide events where all slots are filled

    return { success: true, jobs };
  });

  // Apply for a job
  app.post('/freelancer/jobs/:jobId/apply', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    
    if (user.role !== 'freelancer') {
      return reply.status(403).send({ error: 'Freelancer access only' });
    }

    const { jobId: eventId } = request.params as { jobId: string };
    const { role } = applySchema.parse(request.body);

    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return reply.status(404).send({ error: 'Event not found' });
    }

    if (event.status === 'cancelled' || event.status === 'completed') {
      return reply.status(400).send({ error: 'Event not accepting applications' });
    }

    // Check if already applied for this role
    const existing = await prisma.freelancerApplication.findFirst({
      where: { freelancerId: user.id, eventId, role },
    });

    if (existing) {
      return reply.status(400).send({ error: 'Você já se candidatou para esta vaga' });
    }

    // Check slot capacity: count approved applications for this role
    const [approvedCount, slotItem] = await Promise.all([
      prisma.freelancerApplication.count({
        where: { eventId, role, status: 'approved' },
      }),
      (prisma as any).eventItem.findFirst({
        where: { eventId, name: role, category: 'staff' },
        select: { quantity: true },
      }),
    ]);

    const capacity = slotItem ? Math.round(slotItem.quantity) : 0;

    if (capacity > 0 && approvedCount >= capacity) {
      return reply.status(400).send({ error: 'Vagas esgotadas para esta função' });
    }

    // Auto-approve: create application directly as approved
    const application = await prisma.freelancerApplication.create({
      data: {
        freelancerId: user.id,
        eventId,
        role,
        status: 'approved',
      },
    });

    return reply.status(201).send({ success: true, application });
  });

  // Get my applications
  app.get('/freelancer/applications', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    
    if (user.role !== 'freelancer') {
      return reply.status(403).send({ error: 'Freelancer access only' });
    }

    const applications = await prisma.freelancerApplication.findMany({
      where: { freelancerId: user.id },
      include: {
        event: {
          include: {
            venues: { include: { venue: true } },
            employer: { select: { name: true } },
          },
        },
      },
      orderBy: { appliedAt: 'desc' },
    });

    return { success: true, applications };
  });

  // Get freelancer profile
  app.get('/freelancer/profile', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    
    if (user.role !== 'freelancer') {
      return reply.status(403).send({ error: 'Freelancer access only' });
    }

    const freelancer = await prisma.freelancer.findUnique({
      where: { id: user.id },
      include: {
        services: { include: { service: true } },
        penalties: {
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            applications: { where: { status: 'approved' } },
          },
        },
      },
    });

    return { success: true, profile: freelancer };
  });

  // List applications for an event (employer view)
  app.get('/events/:id/applications', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const user = (request as any).user;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { employerId: true },
    });

    if (!event) {
      return reply.status(404).send({ error: 'Event not found' });
    }

    if (user.role !== 'admin' && event.employerId !== user.employerId) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const applications = await prisma.freelancerApplication.findMany({
      where: { eventId },
      include: {
        freelancer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            strikeCount: true,
          },
        },
      },
      orderBy: { appliedAt: 'desc' },
    });

    return { success: true, applications };
  });

  // Update application status (approve/reject)
  app.patch('/applications/:id/status', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = updateApplicationSchema.parse(request.body);
    const user = (request as any).user;

    const application = await prisma.freelancerApplication.findUnique({
      where: { id },
      include: { event: true },
    });

    if (!application) {
      return reply.status(404).send({ error: 'Application not found' });
    }

    if (user.role !== 'admin' && application.event.employerId !== user.employerId) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const updated = await prisma.freelancerApplication.update({
      where: { id },
      data: { status },
    });

    // TODO: Queue notification to freelancer

    return { success: true, application: updated };
  });

  // --- Admin CRUD ---

  // List all freelancers (employer view)
  app.get('/freelancers', { preHandler: requireAuth }, async (request) => {
    const query = request.query as { search?: string; status?: string; page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page || '1'));
    const limit = Math.min(200, parseInt(query.limit || '20'));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status && query.status !== 'all') where.status = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { cpf: { contains: query.search.replace(/\D/g, '') } },
        { phone: { contains: query.search } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.freelancer.count({ where }),
      (prisma as any).freelancer.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
        include: {
          services: { include: { service: true } },
          _count: { select: { penalties: true, applications: { where: { status: 'approved' } } } },
        },
      }),
    ]);

    const totalActive = await prisma.freelancer.count({ where: { status: 'active' } });
    const totalSuspended = await prisma.freelancer.count({ where: { status: 'suspended' } });

    return { success: true, freelancers: items, total, page, limit, totalActive, totalSuspended };
  });

  // Get single freelancer
  app.get('/freelancers/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const freelancer = await (prisma as any).freelancer.findUnique({
      where: { id },
      include: {
        services: { include: { service: true } },
        penalties: { orderBy: { createdAt: 'desc' }, take: 10 },
        _count: { select: { applications: { where: { status: 'approved' } } } },
      },
    });
    if (!freelancer) return reply.status(404).send({ error: 'Freelancer não encontrado' });
    return { success: true, freelancer };
  });

  // Create freelancer (admin/employer)
  app.post('/freelancers', { preHandler: requireAuth }, async (request, reply) => {
    const { name, email, cpf, phone, birthDate, status } = request.body as {
      name: string; email: string; cpf: string; phone?: string;
      birthDate?: string; status?: string;
    };
    const cleanCpf = cpf.replace(/\D/g, '');
    const existing = await prisma.freelancer.findFirst({ where: { OR: [{ email }, { cpf: cleanCpf }] } });
    if (existing) return reply.status(400).send({ error: 'E-mail ou CPF já cadastrado' });

    const freelancer = await (prisma.freelancer.create as any)({
      data: {
        name, email, cpf: cleanCpf, phone: phone || null,
        birthDate: birthDate ? new Date(birthDate) : null,
        status: status || 'active',
      },
    });
    return reply.status(201).send({ success: true, freelancer });
  });

  // Update freelancer
  app.patch('/freelancers/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name, email, cpf, phone, birthDate, status } = request.body as any;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email;
    if (cpf !== undefined) data.cpf = cpf.replace(/\D/g, '');
    if (phone !== undefined) data.phone = phone;
    if (birthDate !== undefined) data.birthDate = birthDate ? new Date(birthDate) : null;
    if (status !== undefined) data.status = status;
    const freelancer = await prisma.freelancer.update({ where: { id }, data });
    return { success: true, freelancer };
  });

  // Delete freelancer
  app.delete('/freelancers/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const f = await prisma.freelancer.findUnique({ where: { id } });
    if (!f) return reply.status(404).send({ error: 'Freelancer não encontrado' });
    await prisma.freelancer.delete({ where: { id } });
    return { success: true };
  });

  // Apply penalty to freelancer
  app.post('/freelancers/:id/penalties', { 
    preHandler: [requireAuth, requireRole(['admin', 'event_owner'])] 
  }, async (request, reply) => {
    const { id: freelancerId } = request.params as { id: string };
    const data = penaltySchema.parse(request.body);
    const user = (request as any).user;

    const freelancer = await prisma.freelancer.findUnique({
      where: { id: freelancerId },
    });

    if (!freelancer) {
      return reply.status(404).send({ error: 'Freelancer not found' });
    }

    const penalty = await prisma.freelancerPenalty.create({
      data: {
        freelancerId,
        eventId: data.eventId,
        reason: data.reason,
        severity: data.severity,
        appliedByUserId: user.id,
      },
    });

    // Update strike count
    let strikeIncrement = 0;
    if (data.severity === 'grave') strikeIncrement = 1;
    if (data.severity === 'medium') strikeIncrement = 0.5;

    const newStrikeCount = freelancer.strikeCount + strikeIncrement;
    const newStatus = newStrikeCount >= 3 ? 'suspended' : freelancer.status;

    await prisma.freelancer.update({
      where: { id: freelancerId },
      data: {
        strikeCount: newStrikeCount,
        status: newStatus,
      },
    });

    return reply.status(201).send({ success: true, penalty });
  });
}
