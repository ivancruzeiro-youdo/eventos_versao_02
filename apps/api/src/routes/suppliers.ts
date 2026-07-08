import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';

const supplierSchema = z.object({
  name: z.string().min(1),
  responsavel: z.string().optional().nullable(),
  contato: z.string().optional().nullable(),
  atendimento: z.string().optional().nullable(),
  entrega: z.string().optional().nullable(),
  insumos: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function supplierRoutes(app: FastifyInstance) {
  app.get('/suppliers', { preHandler: requireAuth }, async () => {
    const suppliers = await (prisma as any).supplier.findMany({
      orderBy: { name: 'asc' },
    });
    return { success: true, suppliers };
  });

  app.post('/suppliers', { preHandler: requireAuth }, async (request, reply) => {
    const data = supplierSchema.parse(request.body);
    const supplier = await (prisma as any).supplier.create({ data });
    return reply.status(201).send({ success: true, supplier });
  });

  app.patch('/suppliers/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = supplierSchema.partial().parse(request.body);
    const existing = await (prisma as any).supplier.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Fornecedor não encontrado' });
    const supplier = await (prisma as any).supplier.update({ where: { id }, data });
    return { success: true, supplier };
  });

  app.delete('/suppliers/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await (prisma as any).supplier.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: 'Fornecedor não encontrado' });
    await (prisma as any).supplier.delete({ where: { id } });
    return { success: true };
  });
}
