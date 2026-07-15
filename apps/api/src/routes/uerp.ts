import type { FastifyInstance } from 'fastify';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';

// Cache duration in seconds (1 hour)
const CACHE_TTL = 3600;

// Parse HTML product description into structured subitems
// Returns: Array of { group: string, items: string[] }
function parseProductSubitems(html: string | null): { group: string; items: string[] }[] {
  if (!html) return [];

  // Decode HTML entities
  const decode = (s: string) =>
    s.replace(/&amp;/g, '&')
     .replace(/&lt;/g, '<')
     .replace(/&gt;/g, '>')
     .replace(/&quot;/g, '"')
     .replace(/&#39;/g, "'")
     .replace(/&nbsp;/g, ' ')
     .replace(/&ccedil;/g, 'ç')
     .replace(/&atilde;/g, 'ã')
     .replace(/&otilde;/g, 'õ')
     .replace(/&eacute;/g, 'é')
     .replace(/&ecirc;/g, 'ê')
     .replace(/&oacute;/g, 'ó')
     .replace(/&ocirc;/g, 'ô')
     .replace(/&aacute;/g, 'á')
     .replace(/&acirc;/g, 'â')
     .replace(/&iacute;/g, 'í')
     .replace(/&uacute;/g, 'ú')
     .replace(/&ucirc;/g, 'û')
     .replace(/&agrave;/g, 'à')
     .replace(/&Atilde;/g, 'Ã')
     .replace(/&Otilde;/g, 'Õ')
     .replace(/&Eacute;/g, 'É')
     .replace(/&Aacute;/g, 'Á')
     .replace(/&#\d+;/g, '')
     .replace(/&[a-z]+;/gi, '');

  // Strip all HTML tags and return plain text
  const stripTags = (s: string) => s.replace(/<[^>]*>/g, '').trim();

  const groups: { group: string; items: string[] }[] = [];

  // Find all <div> blocks that contain a group header + <ul>
  // Pattern: <p ...>GROUP_TITLE...</p> followed by <ul>...</ul>
  const groupPattern = /<p[^>]*>([\s\S]*?)<\/p>\s*<ul[^>]*>([\s\S]*?)<\/ul>/gi;
  let match;

  while ((match = groupPattern.exec(html)) !== null) {
    const rawGroupTitle = decode(stripTags(match[1])).replace(/\s+/g, ' ').trim();
    if (!rawGroupTitle) continue;

    // Extract <li> items
    const ulHtml = match[2];
    const items: string[] = [];
    const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch;
    while ((liMatch = liPattern.exec(ulHtml)) !== null) {
      const text = decode(stripTags(liMatch[1])).replace(/\s+/g, ' ').trim();
      if (text) items.push(text);
    }

    if (items.length > 0) {
      groups.push({ group: rawGroupTitle, items });
    }
  }

  // If no groups found, try flat <ul> (single list without group title)
  if (groups.length === 0) {
    const ulMatch = /<ul[^>]*>([\s\S]*?)<\/ul>/i.exec(html);
    if (ulMatch) {
      const items: string[] = [];
      const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let liMatch;
      while ((liMatch = liPattern.exec(ulMatch[1])) !== null) {
        const text = decode(stripTags(liMatch[1])).replace(/\s+/g, ' ').trim();
        if (text) items.push(text);
      }
      if (items.length > 0) groups.push({ group: 'Itens', items });
    }
  }

  return groups;
}

async function getUserpCredentials() {
  const rows = await (prisma as any).uerpConfig.findMany();
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    userpBaseUrl: map['userpBaseUrl'] || '',
    userpEmail: map['userpEmail'] || '',
    userpSenha: map['userpSenha'] || '',
  };
}

export async function uerpRoutes(app: FastifyInstance) {
  // Get Userp config
  app.get('/userp-config', { preHandler: requireAuth }, async () => {
    const creds = await getUserpCredentials();
    return { success: true, config: { userpBaseUrl: creds.userpBaseUrl, userpEmail: creds.userpEmail, hasPassword: !!creds.userpSenha } };
  });

  // Save Userp config
  app.post('/userp-config', { preHandler: requireAuth }, async (request, reply) => {
    const { userpBaseUrl, userpEmail, userpSenha } = request.body as { userpBaseUrl?: string; userpEmail?: string; userpSenha?: string };
    const upsert = async (key: string, value: string) => {
      await (prisma as any).uerpConfig.upsert({ where: { key }, create: { key, value }, update: { value } });
    };
    if (userpBaseUrl !== undefined) await upsert('userpBaseUrl', userpBaseUrl);
    if (userpEmail !== undefined) await upsert('userpEmail', userpEmail);
    if (userpSenha !== undefined && userpSenha !== '') await upsert('userpSenha', userpSenha);
    return { success: true };
  });

  // Test Userp connection
  app.post('/userp-config/test', { preHandler: requireAuth }, async (request, reply) => {
    const creds = await getUserpCredentials();
    if (!creds.userpBaseUrl || !creds.userpEmail || !creds.userpSenha) {
      return reply.status(400).send({ error: 'Credenciais não configuradas.' });
    }
    const authRes = await fetch(`${creds.userpBaseUrl}/api/userp-satelite/auth/token.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ email: creds.userpEmail, senha: creds.userpSenha }),
    });
    if (!authRes.ok) return reply.status(401).send({ error: 'Falha na autenticação. Verifique as credenciais.' });
    const data = await authRes.json() as any;
    if (!data.access_token) return reply.status(401).send({ error: 'Token não retornado.' });
    return { success: true, message: 'Conexão bem-sucedida!' };
  });
  // Get products (cached from UERP)
  app.get('/products', { preHandler: requireAuth }, async (request, reply) => {
    const products = await (prisma as any).product.findMany({
      orderBy: [{ categoryName: 'asc' }, { name: 'asc' }],
      include: { services: { include: { service: true } } },
    });

    return {
      success: true,
      products: products.map((p: any) => ({
        id: p.id,
        name: p.name,
        category: p.categoryName,
        subitems: p.subitems ?? [],
        price: p.price,
        unitName: p.unitName,
        unitAbbr: p.unitAbbr,
        externalId: p.externalId,
        services: (p.services || []).map((l: any) => l.service),
      })),
    };
  });

  // Get categories (cached from UERP)
  app.get('/categories', { preHandler: requireAuth }, async (request, reply) => {
    const categories = await prisma.product.findMany({
      select: { categoryId: true, categoryName: true },
      distinct: ['categoryId'],
      where: { categoryName: { not: null } },
      orderBy: { categoryName: 'asc' },
    });

    return {
      success: true,
      categories: categories.map(c => ({
        id: String(c.categoryId),
        name: c.categoryName,
      })),
    };
  });

  // Delete product (only if not linked to any briefing question)
  app.delete('/products/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return reply.status(404).send({ error: 'Produto não encontrado' });
    }

    await prisma.product.delete({ where: { id } });
    return { success: true };
  });

  // Preview products from Userp-Satélite (fetch only, no save)
  app.post('/products/preview-userp', { preHandler: requireAuth }, async (request, reply) => {
    const { userpBaseUrl, userpEmail, userpSenha } = await getUserpCredentials();

    if (!userpBaseUrl || !userpEmail || !userpSenha) {
      return reply.status(400).send({ error: 'Credenciais Userp não configuradas. Acesse Admin → Integrações para configurar.' });
    }

    // Authenticate
    const authRes = await fetch(`${userpBaseUrl}/api/userp-satelite/auth/token.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ email: userpEmail, senha: userpSenha }),
    });

    if (!authRes.ok) {
      return reply.status(401).send({ error: 'Falha na autenticação com a API Userp. Verifique e-mail e senha.' });
    }

    const authData = await authRes.json() as any;
    const token = authData.access_token;
    if (!token) {
      return reply.status(401).send({ error: 'Token não retornado pela API Userp.' });
    }

    // Fetch all products with pagination
    let start = 0;
    const limit = 200;
    let hasMore = true;
    const allItems: any[] = [];

    while (hasMore) {
      const prodRes = await fetch(
        `${userpBaseUrl}/api/userp-satelite/produtos-experience/index.php?start=${start}&limit=${limit}&sort_field=lcp_categoria&sort_dir=ASC`,
        { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
      );
      if (!prodRes.ok) {
        return reply.status(500).send({ error: 'Erro ao buscar produtos da API Userp.' });
      }
      const prodData = await prodRes.json() as any;
      allItems.push(...(prodData.items || []));
      hasMore = prodData.has_more === true;
      start += limit;
    }

    // Check which are already imported
    const existingIds = new Set(
      (await prisma.product.findMany({ select: { externalId: true } })).map(p => p.externalId)
    );

    return reply.send({
      success: true,
      items: allItems.map(item => ({
        externalId: String(item.produto_id),
        name: item.produto_descricao_curta,
        descriptionLong: item.produto_descricao_longa || null,
        subitems: [],
        price: item.produto_vlr_unitario ? parseFloat(item.produto_vlr_unitario) : null,
        categoryId: item.categoria_id ? String(item.categoria_id) : null,
        categoryName: item.categoria_nome || null,
        unitId: item.unidade_id ? String(item.unidade_id) : null,
        unitName: item.unidade_nome || null,
        unitAbbr: item.unidade_abreviacao || null,
        alreadyImported: existingIds.has(String(item.produto_id)),
      })),
    });
  });

  // Import selected products from Userp-Satélite
  app.post('/products/import-userp', { preHandler: requireAuth }, async (request, reply) => {
    const { items } = request.body as {
      items: {
        externalId: string;
        name: string;
        descriptionLong?: string | null;
        subitems?: { group: string; items: string[] }[] | null;
        price?: number | null;
        categoryId?: string | null;
        categoryName?: string | null;
        unitId?: string | null;
        unitName?: string | null;
        unitAbbr?: string | null;
      }[];
    };

    if (!Array.isArray(items) || items.length === 0) {
      return reply.status(400).send({ error: 'Nenhum produto selecionado para importar' });
    }

    let created = 0;
    let updated = 0;

    for (const item of items) {
      const existing = await prisma.product.findFirst({
        where: { externalId: item.externalId },
      });

      if (existing) {
        await (prisma.product.update as any)({
          where: { id: existing.id },
          data: {
            name: item.name,
            descriptionLong: item.descriptionLong || null,
            price: item.price ?? null,
            categoryId: item.categoryId || null,
            categoryName: item.categoryName || null,
            unitId: item.unitId || null,
            unitName: item.unitName || null,
            unitAbbr: item.unitAbbr || null,
          },
        });
        updated++;
      } else {
        await (prisma.product.create as any)({
          data: {
            externalId: item.externalId,
            name: item.name,
            descriptionLong: item.descriptionLong || null,
            price: item.price ?? null,
            categoryId: item.categoryId || null,
            categoryName: item.categoryName || null,
            unitId: item.unitId || null,
            unitName: item.unitName || null,
            unitAbbr: item.unitAbbr || null,
          },
        });
        created++;
      }
    }

    return reply.send({ success: true, total: items.length, created, updated });
  });

  // Get venues
  app.get('/venues', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    
    const whereClause: any = {};
    if (user.role !== 'admin' && user.employerId) {
      whereClause.employerId = user.employerId;
    }

    const venues = await prisma.venue.findMany({
      where: whereClause,
      orderBy: { name: 'asc' },
    });

    return { success: true, venues };
  });

  // Create venue
  app.post('/venues', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const { name, address, city, capacity, contactName, contactPhone } = request.body as {
      name: string;
      address?: string;
      city?: string;
      capacity?: number;
      contactName?: string;
      contactPhone?: string;
    };

    const employerId = user.role === 'admin' 
      ? (request.body as any).employerId || user.employerId
      : user.employerId;

    const venue = await prisma.venue.create({
      data: {
        name,
        address,
        city,
        capacity,
        contactName,
        contactPhone,
        employerId,
      },
    });

    return reply.status(201).send({ success: true, venue });
  });

  // Get single venue
  app.get('/venues/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).user;

    const venue = await prisma.venue.findUnique({
      where: { id },
      include: {
        _count: { select: { events: true } },
        questions: { orderBy: { order: 'asc' } },
        events: {
          take: 5,
          orderBy: { event: { startAt: 'desc' } },
          include: {
            event: {
              select: {
                id: true,
                name: true,
                startAt: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!venue) {
      return reply.status(404).send({ error: 'Venue not found' });
    }

    // Check permission
    if (user.role !== 'admin' && venue.employerId !== user.employerId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    return { success: true, venue };
  });

  // Update venue
  app.patch('/venues/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).user;
    const data = request.body as {
      name?: string;
      address?: string;
      city?: string;
      state?: string;
      capacity?: number;
      contactName?: string;
      contactPhone?: string;
    };

    const venue = await prisma.venue.findUnique({
      where: { id },
    });

    if (!venue) {
      return reply.status(404).send({ error: 'Venue not found' });
    }

    if (user.role !== 'admin' && venue.employerId !== user.employerId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const updated = await prisma.venue.update({
      where: { id },
      data,
    });

    return { success: true, venue: updated };
  });

  // Delete venue
  app.delete('/venues/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = (request as any).user;

    const venue = await prisma.venue.findUnique({ where: { id } });

    if (!venue) {
      return reply.status(404).send({ error: 'Venue not found' });
    }

    if (user.role !== 'admin' && venue.employerId !== user.employerId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    // Remove event venue links before deleting
    await prisma.eventVenue.deleteMany({ where: { venueId: id } });

    await prisma.venue.delete({ where: { id } });

    return { success: true };
  });

  // Preview venues from Userp-Satélite (fetch only, no save)
  app.post('/venues/preview-userp', { preHandler: requireAuth }, async (request, reply) => {
    const { userpBaseUrl, userpEmail, userpSenha } = await getUserpCredentials();

    if (!userpBaseUrl || !userpEmail || !userpSenha) {
      return reply.status(400).send({ error: 'Credenciais Userp não configuradas. Acesse Admin → Integrações para configurar.' });
    }

    // Authenticate (same endpoint as products)
    const authRes = await fetch(`${userpBaseUrl}/api/userp-satelite/auth/token.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ email: userpEmail, senha: userpSenha }),
    });
    if (!authRes.ok) {
      return reply.status(401).send({ error: 'Falha na autenticação com a API Userp.' });
    }
    const authData = await authRes.json() as any;
    const token = authData.access_token || authData.token;
    if (!token) {
      return reply.status(401).send({ error: 'Token não retornado pela API Userp.' });
    }

    // Fetch all venues paginated
    const allItems: any[] = [];
    let start = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const res = await fetch(
        `${userpBaseUrl}/api/userp-satelite/padroes/index.php?start=${start}&limit=${limit}&sort_field=tpimov_nome&sort_dir=ASC`,
        { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } }
      );
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        return reply.status(500).send({ error: `Erro ao buscar padrões da API Userp. Status: ${res.status}. Resposta: ${errBody.slice(0, 200)}` });
      }
      const data = await res.json() as any;
      allItems.push(...(data.items || []));
      hasMore = data.has_more === true;
      start += limit;
    }

    // Check which are already imported
    const existingIds = new Set(
      (await (prisma.venue.findMany as any)({ select: { externalId: true }, where: { externalId: { not: null } } }))
        .map((v: any) => v.externalId)
    );

    return reply.send({
      success: true,
      items: allItems.map(item => ({
        externalId: String(item.tpimov_id),
        name: item.tpimov_nome ?? '',
        address: null,
        city: item.fase_nome ?? null,
        state: null,
        capacity: null,
        contactName: null,
        contactPhone: null,
        alreadyImported: existingIds.has(String(item.tpimov_id)),
      })),
    });
  });

  // Import selected venues from Userp-Satélite
  app.post('/venues/import-userp', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const { items } = request.body as {
      items: {
        externalId: string;
        name: string;
        address?: string | null;
        city?: string | null;
        state?: string | null;
        capacity?: number | null;
        contactName?: string | null;
        contactPhone?: string | null;
      }[];
    };

    if (!Array.isArray(items) || items.length === 0) {
      return reply.status(400).send({ error: 'Nenhum espaço selecionado para importar' });
    }

    const employerId = user.employerId;
    if (!employerId) {
      return reply.status(400).send({ error: 'Usuário sem employerId para vincular os espaços' });
    }

    let created = 0;
    let updated = 0;

    for (const item of items) {
      const existing = await (prisma.venue.findFirst as any)({ where: { externalId: item.externalId } });

      if (existing) {
        await (prisma.venue.update as any)({
          where: { id: existing.id },
          data: {
            name: item.name,
            address: item.address || null,
            city: item.city || null,
            state: item.state || null,
            capacity: item.capacity ? Number(item.capacity) : null,
            contactName: item.contactName || null,
            contactPhone: item.contactPhone || null,
          },
        });
        updated++;
      } else {
        await (prisma.venue.create as any)({
          data: {
            externalId: item.externalId,
            name: item.name,
            address: item.address || null,
            city: item.city || null,
            state: item.state || null,
            capacity: item.capacity ? Number(item.capacity) : null,
            contactName: item.contactName || null,
            contactPhone: item.contactPhone || null,
            employerId,
          },
        });
        created++;
      }
    }

    return reply.send({ success: true, created, updated });
  });

  // ─── Venue Questions (perguntas padrão do local) ──────────────────────────

  // GET /venues/:id/questions
  app.get('/venues/:id/questions', { preHandler: requireAuth }, async (request) => {
    const { id: venueId } = request.params as { id: string };
    const questions = await (prisma as any).venueQuestion.findMany({
      where: { venueId },
      orderBy: { order: 'asc' },
    });
    return { success: true, questions };
  });

  // POST /venues/:id/questions
  app.post('/venues/:id/questions', { preHandler: requireAuth }, async (request) => {
    const { id: venueId } = request.params as { id: string };
    const body = request.body as { text: string; type: string; required?: boolean; options?: any };
    const count = await (prisma as any).venueQuestion.count({ where: { venueId } });
    const q = await (prisma as any).venueQuestion.create({
      data: {
        venueId,
        text: body.text,
        type: body.type,
        required: body.required ?? false,
        options: body.options ?? null,
        order: count,
      },
    });
    return { success: true, question: q };
  });

  // PATCH /venues/:id/questions/:qId
  app.patch('/venues/:id/questions/:qId', { preHandler: requireAuth }, async (request) => {
    const { qId } = request.params as { id: string; qId: string };
    const body = request.body as { text?: string; type?: string; required?: boolean; options?: any; order?: number };
    const q = await (prisma as any).venueQuestion.update({ where: { id: qId }, data: body });
    return { success: true, question: q };
  });

  // DELETE /venues/:id/questions/:qId
  app.delete('/venues/:id/questions/:qId', { preHandler: requireAuth }, async (request) => {
    const { qId } = request.params as { id: string; qId: string };
    await (prisma as any).venueQuestion.delete({ where: { id: qId } });
    return { success: true };
  });
}
