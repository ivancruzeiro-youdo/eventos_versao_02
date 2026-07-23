import type { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { prisma } from '../server.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { uploadBufferToS3, s3Client, getS3Bucket } from '../lib/s3.js';

const ALLOWED_IMAGE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const DEFAULT_ELEMENTS = [
  { type: 'mesa_6',       label: 'Mesa 6 lugares',           widthMeters: 1.2,  heightMeters: 1.2,  active: true },
  { type: 'mesa_10',      label: 'Mesa 10 lugares',          widthMeters: 1.5,  heightMeters: 1.5,  active: true },
  { type: 'mesa_ret',     label: 'Mesa Retangular',          widthMeters: 1.8,  heightMeters: 0.9,  active: true },
  { type: 'bistro_5',     label: 'Mesa Bistro 5 cadeiras',   widthMeters: 0.8,  heightMeters: 0.8,  active: true },
  { type: 'bistro_3',     label: 'Mesa Bistro 3 cadeiras',   widthMeters: 0.7,  heightMeters: 0.7,  active: true },
  { type: 'arbusto',      label: 'Arbusto',                  widthMeters: 0.6,  heightMeters: 0.6,  active: true },
  { type: 'puff',         label: 'Puff',                     widthMeters: 0.8,  heightMeters: 0.8,  active: true },
  { type: 'puff_quad',    label: 'Puff Preto Quadrado',      widthMeters: 1.0,  heightMeters: 1.0,  active: true },
  { type: 'puff_rond',    label: 'Puff Redondo 50cm',        widthMeters: 0.5,  heightMeters: 0.5,  active: true },
  { type: 'sofa_chester', label: 'Sofá Chesterfield Preto',  widthMeters: 2.2,  heightMeters: 0.85, active: true },
  { type: 'aparador_a',   label: 'Aparador Industrial A',    widthMeters: 2.2,  heightMeters: 0.4,  active: true },
  { type: 'aparador_b',   label: 'Aparador Industrial B',    widthMeters: 1.6,  heightMeters: 0.45, active: true },
  { type: 'mesa_dj',      label: 'Mesa Industrial DJ',       widthMeters: 1.7,  heightMeters: 0.95, active: true },
  { type: 'palco',        label: 'Palco',                    widthMeters: 6.0,  heightMeters: 3.0,  active: true },
  { type: 'bar',          label: 'Bar',                      widthMeters: 3.0,  heightMeters: 1.5,  active: true },
  { type: 'wc',           label: 'WC',                       widthMeters: 1.0,  heightMeters: 1.0,  active: true },
];

async function getFloorPlanUrl(s3Key: string): Promise<string> {
  return getSignedUrl(s3Client, new GetObjectCommand({ Bucket: getS3Bucket(), Key: s3Key }), { expiresIn: 3600 });
}

export async function layoutRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1 } });

  // POST /venues/:id/floorplan — upload floor plan image
  app.post('/venues/:id/floorplan', { preHandler: requireAuth }, async (request, reply) => {
    const { id: venueId } = request.params as { id: string };
    let s3Key: string | null = null;

    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (!ALLOWED_IMAGE.has(part.mimetype)) { await part.toBuffer(); continue; }
        const buffer = await part.toBuffer();
        const ext = part.filename?.split('.').pop() ?? 'jpg';
        s3Key = `venues/${venueId}/floorplan.${ext}`;
        await uploadBufferToS3(s3Key, buffer, part.mimetype);
      }
    }

    if (!s3Key) return reply.status(400).send({ error: 'Nenhuma imagem enviada.' });

    const venue = await prisma.venue.update({
      where: { id: venueId },
      data: { floorPlanS3Key: s3Key },
    });

    const url = await getFloorPlanUrl(s3Key);
    return { success: true, url };
  });

  // GET /venues/:id/floorplan-url — presigned URL for floor plan
  app.get('/venues/:id/floorplan-url', { preHandler: requireAuth }, async (request, reply) => {
    const { id: venueId } = request.params as { id: string };
    const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { floorPlanS3Key: true } });
    if (!venue) return reply.status(404).send({ error: 'Espaço não encontrado' });
    if (!venue.floorPlanS3Key) return { success: true, url: null };
    const url = await getFloorPlanUrl(venue.floorPlanS3Key);
    return { success: true, url };
  });

  // GET /events/:id/layout-venues — floor plan info for EVERY venue linked to the event
  // (an event can have multiple venues; each has its own independent floor plan/scale/stock)
  app.get('/events/:id/layout-venues', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };

    const eventVenues = await prisma.eventVenue.findMany({
      where: { eventId },
      include: { venue: { select: { id: true, name: true, floorPlanS3Key: true, floorPlanWidthMeters: true, floorPlanHeightMeters: true, layoutStock: true } as any } },
      orderBy: { id: 'asc' },
    });

    const venues = await Promise.all(eventVenues.map(async (ev: any) => {
      const v = ev.venue;
      const floorPlanUrl = v?.floorPlanS3Key ? await getFloorPlanUrl(v.floorPlanS3Key) : null;
      return {
        venueId: ev.venueId,
        venueName: v?.name ?? '',
        floorPlanUrl,
        floorPlanWidthMeters: v?.floorPlanWidthMeters ?? null,
        floorPlanHeightMeters: v?.floorPlanHeightMeters ?? null,
        layoutStock: v?.layoutStock ?? null,
      };
    }));

    return { success: true, venues };
  });

  // GET /events/:id/layouts — list all layouts for an event (optionally filtered by venueId)
  app.get('/events/:id/layouts', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const { venueId } = request.query as { venueId?: string };
    const layouts = await (prisma as any).eventLayout.findMany({
      where: venueId ? { eventId, venueId } : { eventId },
      orderBy: { createdAt: 'asc' },
    });
    return { success: true, layouts };
  });

  // POST /events/:id/layouts — create a new layout, scoped to one of the event's venues
  app.post('/events/:id/layouts', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const { name = 'Novo Layout', elements = [], venueId } = request.body as any;
    const user = (request as any).user;

    if (venueId) {
      const link = await prisma.eventVenue.findFirst({ where: { eventId, venueId } });
      if (!link) return reply.status(400).send({ error: 'Espaço não vinculado a este evento' });
    }

    const layout = await (prisma as any).eventLayout.create({
      data: { eventId, venueId: venueId || null, name, elements, createdById: user.id },
    });
    return { success: true, layout };
  });

  // PUT /events/:id/layouts/:layoutId — update a layout
  app.put('/events/:id/layouts/:layoutId', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId, layoutId } = request.params as { id: string; layoutId: string };
    const { name, elements, isLocked } = request.body as any;

    const existing = await (prisma as any).eventLayout.findUnique({ where: { id: layoutId } });
    if (!existing || existing.eventId !== eventId) return reply.status(404).send({ error: 'Layout não encontrado' });

    const updateData: any = { updatedAt: new Date() };
    if (elements !== undefined) updateData.elements = elements;
    if (name !== undefined) updateData.name = name;
    if (isLocked !== undefined) updateData.isLocked = isLocked;

    const layout = await (prisma as any).eventLayout.update({ where: { id: layoutId }, data: updateData });
    return { success: true, layout };
  });

  // DELETE /events/:id/layouts/:layoutId — delete a layout
  app.delete('/events/:id/layouts/:layoutId', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId, layoutId } = request.params as { id: string; layoutId: string };
    const existing = await (prisma as any).eventLayout.findUnique({ where: { id: layoutId } });
    if (!existing || existing.eventId !== eventId) return reply.status(404).send({ error: 'Layout não encontrado' });
    await (prisma as any).eventLayout.delete({ where: { id: layoutId } });
    return { success: true };
  });

  // GET /venues/:id/layout-templates
  app.get('/venues/:id/layout-templates', { preHandler: requireAuth }, async (request, reply) => {
    const { id: venueId } = request.params as { id: string };
    const templates = await (prisma as any).venueLayoutTemplate.findMany({
      where: { venueId },
      orderBy: { createdAt: 'asc' },
    });
    return { success: true, templates };
  });

  // POST /venues/:id/layout-templates
  app.post('/venues/:id/layout-templates', { preHandler: requireAuth }, async (request, reply) => {
    const { id: venueId } = request.params as { id: string };
    const { name = 'Novo Modelo', elements = [] } = request.body as any;
    const template = await (prisma as any).venueLayoutTemplate.create({
      data: { venueId, name, elements },
    });
    return { success: true, template };
  });

  // PUT /venues/:id/layout-templates/:templateId
  app.put('/venues/:id/layout-templates/:templateId', { preHandler: requireAuth }, async (request, reply) => {
    const { id: venueId, templateId } = request.params as { id: string; templateId: string };
    const { name, elements } = request.body as any;
    const existing = await (prisma as any).venueLayoutTemplate.findUnique({ where: { id: templateId } });
    if (!existing || existing.venueId !== venueId) return reply.status(404).send({ error: 'Template não encontrado' });
    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (elements !== undefined) updateData.elements = elements;
    const template = await (prisma as any).venueLayoutTemplate.update({ where: { id: templateId }, data: updateData });
    return { success: true, template };
  });

  // DELETE /venues/:id/layout-templates/:templateId
  app.delete('/venues/:id/layout-templates/:templateId', { preHandler: requireAuth }, async (request, reply) => {
    const { id: venueId, templateId } = request.params as { id: string; templateId: string };
    const existing = await (prisma as any).venueLayoutTemplate.findUnique({ where: { id: templateId } });
    if (!existing || existing.venueId !== venueId) return reply.status(404).send({ error: 'Template não encontrado' });
    await (prisma as any).venueLayoutTemplate.delete({ where: { id: templateId } });
    return { success: true };
  });

  // GET /admin/layout-config — get element type configuration
  app.get('/admin/layout-config', { preHandler: requireAuth }, async (request, reply) => {
    const row = await (prisma as any).eventLayoutConfig.findUnique({ where: { id: 'default' } });
    const rawElements = row?.config?.elements?.length ? row.config.elements : DEFAULT_ELEMENTS;
    const elements = await Promise.all(rawElements.map(async (el: any) => {
      const enriched = { ...el };
      if (el.iconS3Key) enriched.iconUrl = await getFloorPlanUrl(el.iconS3Key);
      if (el.photoS3Key) enriched.photoUrl = await getFloorPlanUrl(el.photoS3Key);
      return enriched;
    }));
    return { success: true, elements };
  });

  // PUT /admin/layout-config — update element type configuration (admin only)
  app.put('/admin/layout-config', { preHandler: [requireAuth, requireRole(['admin'])] }, async (request, reply) => {
    const { elements } = request.body as { elements: any[] };
    const toSave = elements.map(({ iconUrl, photoUrl, ...rest }: any) => rest);
    await (prisma as any).eventLayoutConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', config: { elements: toSave }, updatedAt: new Date() },
      update: { config: { elements: toSave }, updatedAt: new Date() },
    });
    return { success: true, elements };
  });

  // POST /admin/layout-element-photo/:type — upload real photo for an element type
  app.post('/admin/layout-element-photo/:type', { preHandler: [requireAuth, requireRole(['admin'])] }, async (request, reply) => {
    const { type: elementType } = request.params as { type: string };
    let s3Key: string | null = null;

    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (!ALLOWED_IMAGE.has(part.mimetype)) { await part.toBuffer(); continue; }
        const buffer = await part.toBuffer();
        const ext = part.filename?.split('.').pop() ?? 'jpg';
        s3Key = `layout-elements/${elementType}/photo.${ext}`;
        await uploadBufferToS3(s3Key, buffer, part.mimetype);
      }
    }

    if (!s3Key) return reply.status(400).send({ error: 'Nenhuma imagem enviada.' });

    const row = await (prisma as any).eventLayoutConfig.findUnique({ where: { id: 'default' } });
    const rawElements = row?.config?.elements?.length ? row.config.elements : [...DEFAULT_ELEMENTS];
    const idx = rawElements.findIndex((el: any) => el.type === elementType);
    if (idx >= 0) rawElements[idx] = { ...rawElements[idx], photoS3Key: s3Key };
    await (prisma as any).eventLayoutConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', config: { elements: rawElements }, updatedAt: new Date() },
      update: { config: { elements: rawElements }, updatedAt: new Date() },
    });

    const photoUrl = await getFloorPlanUrl(s3Key);
    return { success: true, photoUrl, photoS3Key: s3Key };
  });

  // POST /admin/layout-element-icon/:type — upload icon for an element type
  app.post('/admin/layout-element-icon/:type', { preHandler: [requireAuth, requireRole(['admin'])] }, async (request, reply) => {
    const { type: elementType } = request.params as { type: string };
    let s3Key: string | null = null;

    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (!ALLOWED_IMAGE.has(part.mimetype)) { await part.toBuffer(); continue; }
        const buffer = await part.toBuffer();
        const ext = part.filename?.split('.').pop() ?? 'png';
        s3Key = `layout-elements/${elementType}/icon.${ext}`;
        await uploadBufferToS3(s3Key, buffer, part.mimetype);
      }
    }

    if (!s3Key) return reply.status(400).send({ error: 'Nenhuma imagem enviada.' });

    const row = await (prisma as any).eventLayoutConfig.findUnique({ where: { id: 'default' } });
    const rawElements = row?.config?.elements?.length ? row.config.elements : [...DEFAULT_ELEMENTS];
    const idx = rawElements.findIndex((el: any) => el.type === elementType);
    if (idx >= 0) {
      rawElements[idx] = { ...rawElements[idx], iconS3Key: s3Key };
    }
    await (prisma as any).eventLayoutConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default', config: { elements: rawElements }, updatedAt: new Date() },
      update: { config: { elements: rawElements }, updatedAt: new Date() },
    });

    const iconUrl = await getFloorPlanUrl(s3Key);
    return { success: true, iconUrl, iconS3Key: s3Key };
  });
}
