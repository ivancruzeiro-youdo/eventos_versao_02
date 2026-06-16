import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../server.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as acessosClient from '../services/acessos.js';

const mappingSchema = z.object({
  acessoId: z.string().uuid(),
  acessoNome: z.string().optional(),
});

export async function acessosRoutes(app: FastifyInstance) {
  // Lista os acessos disponíveis na API externa (para popular o select do admin)
  app.get(
    '/acessos/externos',
    { preHandler: [requireAuth, requireRole(['admin'])] },
    async (_request, reply) => {
      try {
        const acessos = await acessosClient.listAcessos();
        return { success: true, acessos };
      } catch (err: any) {
        return reply.status(502).send({ success: false, error: err.message });
      }
    },
  );

  // Lista os mapeamentos de um serviço
  app.get(
    '/services/:id/acessos',
    { preHandler: requireAuth },
    async (request) => {
      const { id: serviceId } = request.params as { id: string };
      const mappings = await (prisma as any).serviceAcessoMapping.findMany({
        where: { serviceId },
        orderBy: { acessoNome: 'asc' },
      });
      return { success: true, mappings };
    },
  );

  // Adiciona um mapeamento serviço → acesso
  app.post(
    '/services/:id/acessos',
    { preHandler: [requireAuth, requireRole(['admin'])] },
    async (request, reply) => {
      const { id: serviceId } = request.params as { id: string };
      const { acessoId, acessoNome } = mappingSchema.parse(request.body);

      const mapping = await (prisma as any).serviceAcessoMapping.upsert({
        where: { serviceId_acessoId: { serviceId, acessoId } },
        create: { serviceId, acessoId, acessoNome },
        update: { acessoNome },
      });
      return reply.status(201).send({ success: true, mapping });
    },
  );

  // Remove um mapeamento
  app.delete(
    '/services/:id/acessos/:acessoId',
    { preHandler: [requireAuth, requireRole(['admin'])] },
    async (request) => {
      const { id: serviceId, acessoId } = request.params as { id: string; acessoId: string };
      await (prisma as any).serviceAcessoMapping.deleteMany({ where: { serviceId, acessoId } });
      return { success: true };
    },
  );

  // Logs de integração por freelancer
  app.get(
    '/freelancers/:id/acesso-logs',
    { preHandler: requireAuth },
    async (request) => {
      const { id: freelancerId } = request.params as { id: string };
      const logs = await (prisma as any).acessoLog.findMany({
        where: { freelancerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return { success: true, logs };
    },
  );

  // Trigger manual de sync com leitores físicos (catracas ControlID)
  app.post(
    '/acesso-logs/:id/sync-leitores',
    { preHandler: [requireAuth, requireRole(['admin'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const log = await (prisma as any).acessoLog.findUnique({ where: { id } });
      if (!log || !log.acessoExternoId) {
        return reply.status(404).send({ success: false, error: 'Log sem ID externo' });
      }
      await acessosClient.syncLeitores(log.acessoExternoId);
      return { success: true };
    },
  );
}
