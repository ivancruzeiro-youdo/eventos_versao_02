import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getUserpToken } from '../lib/userp-auth.js';

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(['admin', 'event_owner', 'operator']),
  employerId: z.string().optional(),
});

const updateRoleSchema = z.object({
  role: z.enum(['admin', 'event_owner', 'operator']),
});

export async function adminRoutes(app: FastifyInstance) {
  // All routes require an authenticated admin
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requireRole(['admin']));

  // List users
  app.get('/users', async (request, reply) => {
    const query = request.query as { page?: string; limit?: string; employerId?: string };
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '20', 10);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.employerId) {
      where.employerId = query.employerId;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        include: { employer: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      success: true,
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // Create user
  app.post('/users', async (request, reply) => {
    const data = createUserSchema.parse(request.body);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        role: data.role,
        employerId: data.employerId,
      },
    });

    return reply.status(201).send({ success: true, user });
  });

  // Update user role
  app.patch('/users/:id/role', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { role } = updateRoleSchema.parse(request.body);

    const user = await prisma.user.update({
      where: { id },
      data: { role },
    });

    return { success: true, user };
  });

  // Update user (name, role, employerId)
  app.patch('/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { name?: string; role?: string; employerId?: string | null; phone?: string | null };
    const data: any = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.role !== undefined) data.role = body.role;
    if (body.employerId !== undefined) data.employerId = body.employerId || null;
    if (body.phone !== undefined) data.phone = body.phone?.trim() || null;
    const user = await prisma.user.update({
      where: { id },
      data,
      include: { employer: { select: { name: true } } },
    });
    return { success: true, user };
  });

  // List UERP users (with already-imported flag)
  app.get('/userp-usuarios', async (request, reply) => {
    let token: string, baseUrl: string;
    try { ({ token, baseUrl } = await getUserpToken()); } catch (e: any) { return reply.status(400).send({ error: e.message }); }

    const res = await fetch(`${baseUrl}/api/userp-satelite/usuarios/`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) return reply.status(502).send({ error: 'Falha ao buscar usuários do Userp.' });
    const data: any = await res.json();
    const userpUsers: any[] = Array.isArray(data) ? data : (data.results ?? data.usuarios ?? []);

    const existingByUerpCodigo = await prisma.user.findMany({
      where: { userpCodigo: { not: null } },
      select: { userpCodigo: true, id: true, role: true, email: true },
    });
    const importedMap = new Map(existingByUerpCodigo.map(u => [u.userpCodigo, u]));

    const result = userpUsers.map((u: any) => {
      const codigo = String(u.codigo ?? u.id ?? '');
      const existing = importedMap.get(codigo);
      return {
        codigo,
        nome: u.nome ?? u.name ?? '',
        email: u.email ?? '',
        alreadyImported: !!existing,
        existingRole: existing?.role ?? null,
        existingId: existing?.id ?? null,
      };
    });

    return { success: true, usuarios: result };
  });

  // Import users from UERP
  app.post('/import-userp-users', async (request, reply) => {
    const requester = (request as any).user;
    const body = request.body as { users: { codigo: string; nome: string; email: string; role: string }[]; employerId?: string };
    if (!Array.isArray(body?.users) || body.users.length === 0) {
      return reply.status(400).send({ error: 'Nenhum usuário selecionado.' });
    }

    const employerId = body.employerId ?? requester.employerId ?? null;
    const results = [];

    for (const u of body.users) {
      const existing = await prisma.user.findFirst({
        where: { OR: [{ userpCodigo: u.codigo }, { email: u.email }] },
      });
      if (existing) {
        const updated = await prisma.user.update({
          where: { id: existing.id },
          data: { role: u.role as any, userpCodigo: u.codigo, name: u.nome || existing.name },
          include: { employer: { select: { name: true } } },
        });
        results.push({ ...updated, action: 'updated' });
      } else {
        const created = await prisma.user.create({
          data: { name: u.nome, email: u.email, role: u.role as any, userpCodigo: u.codigo, employerId },
          include: { employer: { select: { name: true } } },
        });
        results.push({ ...created, action: 'created' });
      }
    }

    return { success: true, imported: results.length, users: results };
  });

  // Get audit log
  app.get('/audit-log', async (request, reply) => {
    const query = request.query as { 
      page?: string; 
      limit?: string; 
      userId?: string;
      entityType?: string;
      from?: string;
      to?: string;
    };
    
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '20', 10);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.userId) where.userId = query.userId;
    if (query.entityType) where.entityType = query.entityType;
    if (query.from && query.to) {
      where.createdAt = {
        gte: new Date(query.from),
        lte: new Date(query.to),
      };
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      success: true,
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });

  // List employers
  app.get('/employers', async (request, reply) => {
    const employers = await prisma.employer.findMany({
      include: {
        _count: { select: { users: true, events: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, employers };
  });

  // Create employer
  app.post('/employers', async (request, reply) => {
    const { name, cnpj, contactEmail } = request.body as {
      name: string;
      cnpj?: string;
      contactEmail?: string;
    };

    const employer = await prisma.employer.create({
      data: { name, cnpj, contactEmail },
    });

    return reply.status(201).send({ success: true, employer });
  });

  // Get single user
  app.get('/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const user = await prisma.user.findUnique({
      where: { id },
      include: { employer: { select: { name: true } } },
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return { success: true, user };
  });

  // Delete user
  app.delete('/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    await prisma.user.delete({ where: { id } });

    return { success: true };
  });

  // Get single employer
  app.get('/employers/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const employer = await prisma.employer.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true, events: true } },
        users: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    if (!employer) {
      return reply.status(404).send({ error: 'Employer not found' });
    }

    return { success: true, employer };
  });

  // Update employer
  app.patch('/employers/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name, cnpj, contactEmail } = request.body as {
      name?: string;
      cnpj?: string;
      contactEmail?: string;
    };

    const employer = await prisma.employer.update({
      where: { id },
      data: { name, cnpj, contactEmail },
    });

    return { success: true, employer };
  });

  // Delete employer
  app.delete('/employers/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const employer = await prisma.employer.findUnique({
      where: { id },
      include: { _count: { select: { users: true, events: true } } },
    });

    if (!employer) {
      return reply.status(404).send({ error: 'Employer not found' });
    }

    if (employer._count.users > 0 || employer._count.events > 0) {
      return reply.status(400).send({ error: 'Cannot delete employer with users or events' });
    }

    await prisma.employer.delete({ where: { id } });

    return { success: true };
  });

  // List all penalties
  app.get('/penalties', async (request, reply) => {
    const query = request.query as { freelancerId?: string; page?: string; limit?: string };
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '20', 10);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.freelancerId) where.freelancerId = query.freelancerId;

    const [penalties, total] = await Promise.all([
      prisma.freelancerPenalty.findMany({
        where,
        skip,
        take: limit,
        include: {
          freelancer: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.freelancerPenalty.count({ where }),
    ]);

    return {
      success: true,
      penalties,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  });
}
