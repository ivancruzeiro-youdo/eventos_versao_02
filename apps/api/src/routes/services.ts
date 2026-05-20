import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';

const serviceSchema = z.object({
  name: z.string().min(1),
  hourlyRate: z.number().default(0),
  description: z.string().optional().nullable(),
  startOffsetMinutes: z.number().int().default(-60),
  endOffsetMinutes: z.number().int().default(60),
});

export async function servicesRoutes(app: FastifyInstance) {
  // List all services
  app.get('/services', { preHandler: requireAuth }, async () => {
    const services = await (prisma as any).freelancerService.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { freelancers: true, products: true } } },
    });
    return { success: true, services };
  });

  // Create service
  app.post('/services', { preHandler: requireAuth }, async (request, reply) => {
    const data = serviceSchema.parse(request.body);
    const service = await (prisma as any).freelancerService.create({ data });
    return reply.status(201).send({ success: true, service });
  });

  // Update service
  app.patch('/services/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = serviceSchema.partial().parse(request.body);
    const service = await (prisma as any).freelancerService.update({ where: { id }, data });
    return { success: true, service };
  });

  // Delete service
  app.delete('/services/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await (prisma as any).freelancerService.delete({ where: { id } });
    return { success: true };
  });

  // List freelancers for a service
  app.get('/services/:id/freelancers', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const links = await (prisma as any).freelancerServiceLink.findMany({
      where: { serviceId: id },
      include: { freelancer: true },
    });
    return { success: true, freelancers: links.map((l: any) => l.freelancer) };
  });

  // --- Freelancer <-> Service links ---

  // Add service to freelancer
  app.post('/freelancers/:id/services', { preHandler: requireAuth }, async (request, reply) => {
    const { id: freelancerId } = request.params as { id: string };
    const { serviceId } = request.body as { serviceId: string };
    const link = await (prisma as any).freelancerServiceLink.upsert({
      where: { freelancerId_serviceId: { freelancerId, serviceId } },
      create: { freelancerId, serviceId },
      update: {},
    });
    return reply.status(201).send({ success: true, link });
  });

  // Remove service from freelancer
  app.delete('/freelancers/:id/services/:serviceId', { preHandler: requireAuth }, async (request) => {
    const { id: freelancerId, serviceId } = request.params as { id: string; serviceId: string };
    await (prisma as any).freelancerServiceLink.deleteMany({ where: { freelancerId, serviceId } });
    return { success: true };
  });

  // --- Product <-> Service links ---

  // Set services for a product (bulk replace)
  app.put('/products/:id/services', { preHandler: requireAuth }, async (request) => {
    const { id: productId } = request.params as { id: string };
    const { serviceIds } = request.body as { serviceIds: string[] };
    await (prisma as any).productServiceLink.deleteMany({ where: { productId } });
    if (serviceIds.length > 0) {
      await (prisma as any).productServiceLink.createMany({
        data: serviceIds.map((serviceId: string) => ({ productId, serviceId })),
        skipDuplicates: true,
      });
    }
    const links = await (prisma as any).productServiceLink.findMany({
      where: { productId },
      include: { service: true },
    });
    return { success: true, services: links.map((l: any) => l.service) };
  });

  // Get services for a product
  app.get('/products/:id/services', { preHandler: requireAuth }, async (request) => {
    const { id: productId } = request.params as { id: string };
    const links = await (prisma as any).productServiceLink.findMany({
      where: { productId },
      include: { service: true },
    });
    return { success: true, services: links.map((l: any) => l.service) };
  });
}
