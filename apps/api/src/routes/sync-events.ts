import type { FastifyInstance } from 'fastify';
import { prisma } from '../server.js';
import { requireAuth } from '../middleware/auth.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getUserpToken(): Promise<{ token: string; baseUrl: string }> {
  const rows = await (prisma as any).uerpConfig.findMany();
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  const baseUrl = map['userpBaseUrl'] || '';
  const email = map['userpEmail'] || '';
  const senha = map['userpSenha'] || '';
  if (!baseUrl || !email || !senha) throw new Error('Credenciais Userp não configuradas.');
  const res = await fetch(`${baseUrl}/api/userp-satelite/auth/token.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, senha }),
  });
  if (!res.ok) throw new Error('Falha na autenticação Userp.');
  const data: any = await res.json();
  if (!data.access_token) throw new Error('Token não retornado pelo Userp.');
  return { token: data.access_token, baseUrl };
}

async function getBaseUrl(): Promise<string> {
  const rows = await (prisma as any).uerpConfig.findMany();
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  const baseUrl = map['userpBaseUrl'] || '';
  if (!baseUrl) throw new Error('URL base Userp não configurada.');
  return baseUrl;
}

// Fetch paginated list of contract IDs from experience API (no auth needed, fixed page size = 15)
async function fetchContratoIds(baseUrl: string): Promise<number[]> {
  const all: number[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${baseUrl}/api/experience/contracts.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ action: 'paginated', page, orderBy: 'contrato_desc' }),
    });
    if (!res.ok) throw new Error(`Erro ao listar contratos: ${res.status}`);
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { throw new Error(`Resposta inválida da API (página ${page}): ${text.slice(0,200)}`); }
    const items: any[] = data?.data?.data || [];
    for (const c of items) all.push(c.codlocacontrato);
    const totalPages: number = data?.data?.total_pages || 1;
    if (page >= totalPages || items.length === 0) break;
    page++;
  }
  return all;
}

// Fetch full contract details (has data_checkin and produtos)
async function fetchContratoDetails(baseUrl: string, codlocacontrato: number): Promise<any | null> {
  const res = await fetch(`${baseUrl}/api/experience/contracts.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ action: 'details', codlocacontrato }),
  });
  if (!res.ok) return null;
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { return null; }
  return data?.data?.contracts ?? null;
}

// Fetch all contracts with details, filtering to today-or-future by data_checkin
async function fetchContratos(baseUrl: string, _token?: string): Promise<any[]> {
  const today = new Date().toISOString().slice(0, 10);
  const ids = await fetchContratoIds(baseUrl);
  const results: any[] = [];
  // Fetch details in parallel batches of 10
  for (let i = 0; i < ids.length; i += 10) {
    const batch = ids.slice(i, i + 10);
    const details = await Promise.all(batch.map(id => fetchContratoDetails(baseUrl, id)));
    for (const d of details) {
      if (!d) continue;
      const main = d.main;
      if (!main) continue;
      const checkin: string = main.data_checkin || '';
      if (checkin < today) continue; // skip past events
      // Attach secondary contracts too
      results.push({ ...main, _secondary: d.secondary || [] });
    }
  }
  return results;
}

// Determine category from product categoryName
function mapCategory(categoryName: string | null): 'ab' | 'infra' | 'staff' | 'venue' | null {
  if (!categoryName) return null;
  const n = categoryName.toLowerCase();
  if (n.includes('alimento') || n.includes('bebida') || n.includes(' a&b') || n.includes('a & b') || n.includes('fornecimento de alimento')) return 'ab';
  if (n.includes('equipe') || n.includes('apoio') || n.includes('staff') || n.includes('fornecimento de equipe')) return 'staff';
  if (n.includes('infraestrutura') || n.includes('infra') || n.includes('loca') || n.includes('equipamento')) return 'infra';
  return null;
}

// Group contracts by (cliente, data_checkin) — same event (one main per key already, but keep for merge)
function groupContracts(contracts: any[]): Map<string, any[]> {
  const map = new Map<string, any[]>();
  for (const c of contracts) {
    const key = `${c.cliente}__${c.data_checkin}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  return map;
}

// Build items snapshot from experience contracts — keeps duplicates separate (one entry per occurrence)
// Fields: id, prodct-id, name, qtde, details.category, details.unity
function buildItemsSnapshot(contracts: any[]): { name: string; qty: number; unit: string; externalProductCode: string | null; categoryName: string | null; occurrenceIndex: number }[] {
  const list: { name: string; qty: number; unit: string; externalProductCode: string | null; categoryName: string | null; occurrenceIndex: number }[] = [];
  const counts: Record<string, number> = {};
  for (const c of contracts) {
    const produtos: any[] = c.produtos || [];
    const secondary: any[] = c._secondary || [];
    const allProdutos = [...produtos, ...secondary.flatMap((s: any) => s.produtos || [])];
    for (const p of allProdutos) {
      const extId = String(p['prodct-id'] || p.id || '');
      const key = extId || p.name || '';
      if (!key) continue;
      const occ = counts[key] ?? 0;
      counts[key] = occ + 1;
      list.push({
        name: p.name || p.details?.description || key,
        qty: Number(p.qtde || 1),
        unit: p.details?.unity || '',
        externalProductCode: extId || null,
        categoryName: p.details?.category || null,
        occurrenceIndex: occ,
      });
    }
  }
  return list;
}

// Collapse duplicate products by summing quantities (used when operator chooses to group)
function collapseItemsSnapshot(items: { name: string; qty: number; unit: string; externalProductCode: string | null; categoryName: string | null; occurrenceIndex: number }[]) {
  const map: Record<string, typeof items[0]> = {};
  for (const item of items) {
    const key = item.externalProductCode || item.name;
    if (map[key]) {
      map[key].qty += item.qty;
    } else {
      map[key] = { ...item, occurrenceIndex: 0 };
    }
  }
  return Object.values(map);
}

// ---------------------------------------------------------------------------
// Preview struct
// ---------------------------------------------------------------------------
interface PreviewEventItem {
  name: string;
  qty: number;
  unit: string;
  externalProductCode: string | null;
  occurrenceIndex: number;
  category: 'ab' | 'infra' | 'staff' | 'venue' | 'unknown';
  productId: string | null;
  productName: string | null;
  venueId: string | null;
  venueName: string | null;
  subitems: { group: string; items: string[] }[];
  staffServices: { id: string; name: string }[];
  missing: boolean;
  missingReason: string;
}

interface PreviewEvent {
  key: string;           // clientCode__startDate
  clientCode: string;
  startDate: string;
  clientName: string;
  existingEventId: string | null;
  action: 'create' | 'update' | 'no_change';
  contractIds: string[];
  items: PreviewEventItem[];
  canImport: boolean;
  blockingReasons: string[];
  hasDuplicates: boolean;
  duplicateNames: string[];
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function syncEventsRoutes(app: FastifyInstance) {
  // DEBUG: raw contract sample — first Experience contract full object
  app.get('/events/debug-raw-contract', { preHandler: requireAuth }, async (_request, reply) => {
    let token: string, baseUrl: string;
    try { ({ token, baseUrl } = await getUserpToken()); } catch (e: any) { return reply.status(400).send({ error: e.message }); }
    const url = `${baseUrl}/api/userp-satelite/contratos/index.php?start=0&limit=1&familia=experience&sort_field=data_inicio&sort_dir=ASC`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    const raw = await res.json();
    return { status: res.status, total: raw.total, filters: raw.filters, firstItem: raw.items?.[0] ?? null };
  });

  // DEBUG: probe Userp experience-specific endpoints
  app.get('/events/debug-probe-endpoints', { preHandler: requireAuth }, async (_request, reply) => {
    let token: string, baseUrl: string;
    try { ({ token, baseUrl } = await getUserpToken()); } catch (e: any) { return reply.status(400).send({ error: e.message }); }
    const paths = [
      '/api/userp-satelite/contratos-experience/index.php?start=0&limit=1',
      '/api/userp-satelite/contratos/index.php?start=0&limit=1&tipo=experience',
      '/api/userp-satelite/contratos/index.php?start=0&limit=1&tipo_contrato=experience',
      '/api/userp-satelite/contratos/index.php?start=0&limit=1&familia=experience',
      '/api/userp-satelite/contratos/index.php?start=0&limit=200&sort_field=data_inicio&sort_dir=ASC',
      '/api/userp-satelite/produtos-experience/index.php?start=0&limit=1',
    ];
    const results: any[] = [];
    for (const p of paths) {
      const res = await fetch(`${baseUrl}${p}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      let body: any;
      try { body = await res.json(); } catch { body = null; }
      results.push({
        path: p,
        status: res.status,
        total: body?.total ?? null,
        topKeys: body ? Object.keys(body) : [],
        firstItemKeys: body?.items?.[0] ? Object.keys(body.items[0]) : [],
        firstItemFamilia: body?.items?.[0]?.familia ?? null,
        firstItemDataInicio: body?.items?.[0]?.data_inicio ?? null,
      });
    }
    return { results };
  });

  // POST /events/sync-preview  — fetch contracts, resolve products/venues, return preview
  app.post('/events/sync-preview', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const employerId: string = user.employerId;
    if (!employerId) return reply.status(400).send({ error: 'Usuário sem employerId.' });

    let baseUrl: string;
    try {
      baseUrl = await getBaseUrl();
    } catch (e: any) {
      return reply.status(400).send({ error: e.message });
    }

    let rawContracts: any[];
    try {
      rawContracts = await fetchContratos(baseUrl);
    } catch (e: any) {
      return reply.status(502).send({ error: e.message });
    }

    // Load all products and venues once
    const [allProducts, allVenues] = await Promise.all([
      (prisma as any).product.findMany({ include: { services: { include: { service: true } } } }),
      (prisma as any).venue.findMany({ where: { employerId } }),
    ]);

    const productByExtId: Map<string, any> = new Map();
    const productByName: Map<string, any> = new Map();
    for (const p of allProducts) {
      if (p.externalId) productByExtId.set(String(p.externalId), p);
      productByName.set(p.name.trim().toLowerCase(), p);
    }
    const venueByName: Map<string, any> = new Map();
    for (const v of allVenues) venueByName.set(v.name.trim().toLowerCase(), v);

    // Load existing contracts (to know which events already exist)
    const existingContracts = await (prisma as any).eventContract.findMany({
      select: { externalId: true, eventId: true, clientCode: true, startDate: true },
    });
    const existingContractIds = new Set(existingContracts.map((c: any) => String(c.externalId)));
    const keyToEventId: Map<string, string> = new Map();
    for (const c of existingContracts) {
      keyToEventId.set(`${c.clientCode}__${c.startDate}`, c.eventId);
    }

    const grouped = groupContracts(rawContracts);
    const previews: PreviewEvent[] = [];

    for (const [key, contracts] of grouped) {
      const [clientCode, startDate] = key.split('__');
      const clientName = contracts[0]?.razaosocial || contracts[0]?.cliente_info?.razaosocial || clientCode;
      const existingEventId = keyToEventId.get(key) || null;

      // Determine action — use codlocacontrato as external ID
      const newContractIds = contracts.map((c: any) => String(c.codlocacontrato || ''));
      const hasNewContracts = newContractIds.some(id => !existingContractIds.has(id));
      const action: 'create' | 'update' | 'no_change' = !existingEventId
        ? 'create'
        : hasNewContracts ? 'update' : 'no_change';

      const rawItems = buildItemsSnapshot(contracts);
      const blockingReasons: string[] = [];
      const previewItems: PreviewEventItem[] = [];

      for (const ri of rawItems) {
        let product: any = null;
        if (ri.externalProductCode) product = productByExtId.get(ri.externalProductCode);
        if (!product) product = productByName.get(ri.name.trim().toLowerCase());

        const category = product ? mapCategory(product.categoryName) : mapCategory(ri.categoryName);

        // Check if it could be a venue (also try categoryName hint)
        const isVenueCat = ri.categoryName?.toLowerCase().includes('espa') || ri.categoryName?.toLowerCase().includes('local') || ri.categoryName?.toLowerCase().includes('sala');
        const venueMatch = venueByName.get(ri.name.trim().toLowerCase()) || (isVenueCat ? null : null);

        let missing = false;
        let missingReason = '';

        if (venueMatch) {
          previewItems.push({
            name: ri.name, qty: ri.qty, unit: ri.unit,
            externalProductCode: ri.externalProductCode,
            occurrenceIndex: ri.occurrenceIndex,
            category: 'venue',
            productId: null, productName: null,
            venueId: venueMatch.id, venueName: venueMatch.name,
            subitems: [], staffServices: [],
            missing: false, missingReason: '',
          });
          continue;
        }

        if (!product) {
          missing = true;
          missingReason = `Produto "${ri.name}" não encontrado. Importe-o em Produtos primeiro.`;
          blockingReasons.push(missingReason);
        } else if (!category) {
          missingReason = `Produto "${ri.name}" sem categoria mapeada (${product.categoryName}).`;
        }

        const subitems: { group: string; items: string[] }[] = product?.subitems || [];
        const staffServices: { id: string; name: string }[] = (product?.services || []).map((l: any) => ({
          id: l.service?.id || l.serviceId,
          name: l.service?.name || '',
        }));

        // Staff items without a linked service cannot create job slots — block import
        const resolvedCategory = category || 'unknown';
        if (!missing && resolvedCategory === 'staff' && staffServices.length === 0) {
          missing = true;
          missingReason = `Produto de equipe "${ri.name}" não possui serviço vinculado. Vincule um serviço ao produto em Produtos.`;
          blockingReasons.push(missingReason);
        }

        previewItems.push({
          name: ri.name, qty: ri.qty, unit: ri.unit,
          externalProductCode: ri.externalProductCode,
          occurrenceIndex: ri.occurrenceIndex,
          category: resolvedCategory,
          productId: product?.id || null,
          productName: product?.name || null,
          venueId: null, venueName: null,
          subitems, staffServices,
          missing, missingReason,
        });
      }

      const duplicateNames = [...new Set(
        previewItems.filter(i => i.occurrenceIndex > 0).map(i => i.name)
      )];
      previews.push({
        key, clientCode, startDate, clientName,
        existingEventId,
        action,
        contractIds: newContractIds,
        items: previewItems,
        canImport: blockingReasons.length === 0,
        blockingReasons,
        hasDuplicates: duplicateNames.length > 0,
        duplicateNames,
      });
    }

    previews.sort((a, b) => a.startDate.localeCompare(b.startDate));

    return { success: true, previews };
  });

  // POST /events/sync-import  — actually create/update events
  app.post('/events/sync-import', { preHandler: requireAuth }, async (request, reply) => {
    const user = (request as any).user;
    const employerId: string = user.employerId;
    if (!employerId) return reply.status(400).send({ error: 'Usuário sem employerId.' });

    const { previews, groupDuplicates = false } = request.body as { previews: PreviewEvent[]; groupDuplicates?: boolean };
    if (!Array.isArray(previews) || previews.length === 0) {
      return reply.status(400).send({ error: 'Nenhum evento para importar.' });
    }

    let baseUrl: string;
    try {
      baseUrl = await getBaseUrl();
    } catch (e: any) {
      return reply.status(400).send({ error: e.message });
    }

    const results: { key: string; action: string; eventId: string }[] = [];

    for (const preview of previews) {
      if (!preview.canImport) continue;
      const { key, clientCode, startDate, clientName, existingEventId, action, contractIds, items } = preview;

      // Fetch raw contract details for each contractId to store rawJson
      const relatedRaw: any[] = [];
      for (const cid of contractIds) {
        if (!cid) continue;
        const detail = await fetchContratoDetails(baseUrl, Number(cid)).catch(() => null);
        if (detail?.main) relatedRaw.push({ ...detail.main, _secondary: detail.secondary || [] });
      }

      let eventId = existingEventId || '';

      if (action === 'create') {
        // Default startAt = noon BRT (15:00 UTC); teardownAt = startAt + 7h
        const startDateObj = new Date(`${startDate}T15:00:00.000Z`); // 12:00 BRT
        const teardownDateObj = new Date(startDateObj.getTime() + 7 * 60 * 60_000); // +7h
        const ev = await (prisma as any).event.create({
          data: {
            name: `${clientName} — ${startDate}`,
            clientName,
            employerId,
            status: 'confirmed',
            startAt: startDateObj,
            teardownAt: teardownDateObj,
          },
        });
        eventId = ev.id;

        // Link all venues via padroes[] array -> Venue.externalId
        const allPadraoIds = new Set<string>();
        for (const rc of relatedRaw) {
          if (rc.padrao_id) allPadraoIds.add(String(rc.padrao_id));
          for (const p of rc.padroes || []) {
            if (p.padrao) allPadraoIds.add(String(p.padrao));
          }
        }
        for (const pid of allPadraoIds) {
          const venue = await (prisma as any).venue.findFirst({ where: { externalId: pid } });
          if (venue) {
            await (prisma as any).eventVenue.create({ data: { eventId, venueId: venue.id } });
          }
        }
      }

      // Upsert contracts (main + their secondaries)
      for (const rc of relatedRaw) {
        const extId = String(rc.codlocacontrato || '');
        if (!extId) continue;
        const exists = await (prisma as any).eventContract.findFirst({ where: { externalId: extId } });
        if (exists) {
          await (prisma as any).eventContract.update({ where: { id: exists.id }, data: { rawJson: rc } });
        } else {
          await (prisma as any).eventContract.create({
            data: { eventId, externalId: extId, clientCode, startDate, rawJson: rc },
          });
        }
        // Also upsert secondary contracts — they don't appear in the paginated list and
        // can't be fetched individually, so they must be tracked via their parent's details.
        for (const sec of (rc._secondary || [])) {
          const secExtId = String(sec.codlocacontrato || '');
          if (!secExtId) continue;
          const secExists = await (prisma as any).eventContract.findFirst({ where: { externalId: secExtId } });
          if (secExists) {
            await (prisma as any).eventContract.update({ where: { id: secExists.id }, data: { rawJson: sec } });
          } else {
            await (prisma as any).eventContract.create({
              data: { eventId, externalId: secExtId, clientCode, startDate, rawJson: sec },
            });
          }
        }
      }

      // Sync venues from padroes[] (additive — never remove existing venues)
      {
        const allPadraoIds = new Set<string>();
        for (const rc of relatedRaw) {
          if (rc.padrao_id) allPadraoIds.add(String(rc.padrao_id));
          for (const p of rc.padroes || []) {
            if (p.padrao) allPadraoIds.add(String(p.padrao));
          }
        }
        for (const pid of allPadraoIds) {
          const venue = await (prisma as any).venue.findFirst({ where: { externalId: pid } });
          if (venue) {
            const exists = await (prisma as any).eventVenue.findFirst({ where: { eventId, venueId: venue.id } });
            if (!exists) {
              await (prisma as any).eventVenue.create({ data: { eventId, venueId: venue.id } });
            }
          }
        }
      }

      // Snapshot before changes (for diff + system comment)
      const oldItemsSnap = await (prisma as any).eventItem.findMany({
        where: { eventId },
        select: { id: true, name: true, quantity: true, productId: true },
      });

      // Track changes for system comment
      const syncAddedItems: string[] = [];
      const syncUpdatedQty: { name: string; oldQty: number; newQty: number }[] = [];

      // Use primary contract as sourceContractId for items in this sync batch
      const primaryContractId = contractIds[0] || null;

      const resolvedItems = groupDuplicates ? (collapseItemsSnapshot(items as any) as unknown as PreviewEventItem[]) : items;

      for (const item of resolvedItems) {
        if (item.category === 'venue' && item.venueId) {
          // Upsert EventVenue link
          const exists = await (prisma as any).eventVenue.findFirst({ where: { eventId, venueId: item.venueId } });
          if (!exists) {
            await (prisma as any).eventVenue.create({ data: { eventId, venueId: item.venueId } });
          }
          // Upsert venue EventItem
          const existingVenueItem = await (prisma as any).eventItem.findFirst({ where: { eventId, venueId: item.venueId } });
          if (!existingVenueItem) {
            await (prisma as any).eventItem.create({
              data: {
                eventId,
                venueId: item.venueId,
                sourceContractId: primaryContractId,
                category: 'venue',
                name: item.name,
                quantity: item.qty,
                unit: item.unit || null,
              },
            });
            syncAddedItems.push(item.name);
          }
          continue;
        }

        if (!item.productId) continue;

        // Upsert by (eventId, productId, occurrenceIndex) — preserves choices/answers/history
        const occIdx = item.occurrenceIndex ?? 0;
        const existing = await (prisma as any).eventItem.findFirst({
          where: { eventId, productId: item.productId, occurrenceIndex: occIdx },
        });

        let eventItemId: string;

        if (existing) {
          // Update quantity and tag sourceContractId if not yet set
          const oldQty: number = existing.quantity;
          const newQty: number = item.qty;
          await (prisma as any).eventItem.update({
            where: { id: existing.id },
            data: {
              quantity: newQty,
              name: item.name,
              unit: item.unit || existing.unit || null,
              ...(existing.sourceContractId == null && primaryContractId
                ? { sourceContractId: primaryContractId }
                : {}),
            },
          });
          eventItemId = existing.id;
          if (Math.abs(oldQty - newQty) > 0.001) {
            syncUpdatedQty.push({ name: item.name, oldQty, newQty });
          }
        } else {
          // New item — create with sourceContractId and occurrenceIndex
          const eventItem = await (prisma as any).eventItem.create({
            data: {
              eventId,
              productId: item.productId,
              sourceContractId: primaryContractId,
              category: item.category === 'unknown' ? 'other' : item.category,
              name: item.name,
              quantity: item.qty,
              unit: item.unit || null,
              occurrenceIndex: occIdx,
            },
          });
          eventItemId = eventItem.id;
          syncAddedItems.push(item.name);
        }

        // Staff: upsert EventService slots (never delete — they carry notes/briefings/checklists)
        if (item.category === 'staff' && item.staffServices.length > 0) {
          const eventRecord = await (prisma as any).event.findUnique({ where: { id: eventId }, select: { startAt: true, teardownAt: true } });
          const eventStartAt: Date = eventRecord?.startAt ?? new Date(`${startDate}T12:00:00`);
          const eventEndBase: Date = eventRecord?.teardownAt ?? eventStartAt;
          for (const svc of item.staffServices) {
            const existingSvc = await (prisma as any).eventService.findFirst({ where: { eventId, serviceId: svc.id } });
            if (existingSvc) {
              // Update maxSlots only — preserve all operator-entered data
              await (prisma as any).eventService.update({
                where: { id: existingSvc.id },
                data: { maxSlots: Math.ceil(item.qty) },
              });
            } else {
              const svcData = await (prisma as any).freelancerService.findUnique({ where: { id: svc.id } });
              const startOffset: number = svcData?.startOffsetMinutes ?? -60;
              const endOffset: number = svcData?.endOffsetMinutes ?? 60;
              const svcStart = new Date(eventStartAt.getTime() + startOffset * 60_000);
              const svcEnd = new Date(eventEndBase.getTime() + endOffset * 60_000);
              await (prisma as any).eventService.create({
                data: {
                  eventId,
                  serviceId: svc.id,
                  productName: item.name,
                  maxSlots: Math.ceil(item.qty),
                  valuePerHour: svcData?.hourlyRate ?? 0,
                  startAt: svcStart,
                  endAt: svcEnd,
                  status: 'active',
                },
              });
            }
          }
        }
      }

      // Auto system comment — only when there are real changes
      if (action !== 'create' && (syncAddedItems.length > 0 || syncUpdatedQty.length > 0)) {
        const lines: string[] = [
          `Sincronização UERP — contrato(s): ${contractIds.filter(Boolean).join(', ')}`,
        ];
        if (syncAddedItems.length > 0) {
          lines.push('');
          lines.push('Adicionados:');
          syncAddedItems.forEach(n => lines.push(`+ ${n}`));
        }
        if (syncUpdatedQty.length > 0) {
          lines.push('');
          lines.push('Quantidades atualizadas:');
          syncUpdatedQty.forEach(u => lines.push(`${u.name}: ${u.oldQty} → ${u.newQty}`));
        }
        await (prisma as any).eventComment.create({
          data: {
            eventId,
            userId: null,
            isSystem: true,
            content: lines.join('\n'),
          },
        });
      }

      // Compute diff for sync log
      const newItemsSnap = items.map(i => ({ name: i.name, qty: i.qty }));
      const oldSnap = oldItemsSnap.map((i: any) => ({ name: i.name, qty: i.quantity }));
      const diff = action !== 'no_change' ? { old: oldSnap, new: newItemsSnap } : null;

      await (prisma as any).eventSyncLog.create({
        data: {
          eventId,
          action,
          diff,
          triggeredBy: user.id || null,
        },
      });

      results.push({ key, action, eventId });
    }

    return { success: true, results };
  });

  // GET /events/:id/userp-status — check USERP for unimported contracts linked to this event
  app.get('/events/:id/userp-status', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const user = (request as any).user;
    const employerId: string = user.employerId;

    // 1. Get this event's already-imported contracts
    const eventContracts = await (prisma as any).eventContract.findMany({
      where: { eventId },
      select: { externalId: true, clientCode: true, startDate: true },
    });

    if (eventContracts.length === 0) {
      return { success: true, status: 'no_contracts' };
    }

    const { clientCode, startDate } = eventContracts[0];

    // 2. Get all globally imported contract IDs from DB (to diff against USERP)
    const allImportedContracts = await (prisma as any).eventContract.findMany({
      select: { externalId: true },
    });
    const globalImportedIds = new Set(allImportedContracts.map((c: any) => String(c.externalId)));

    let baseUrl: string;
    try {
      baseUrl = await getBaseUrl();
    } catch (e: any) {
      return reply.status(400).send({ error: e.message });
    }

    // 3. Fetch all USERP contract IDs (paginated, only IDs — fast)
    let userpIds: number[];
    try {
      userpIds = await fetchContratoIds(baseUrl);
    } catch (e: any) {
      return reply.status(502).send({ error: e.message });
    }

    // 4. Find IDs not yet in DB at all
    const unknownIds = userpIds.filter(id => !globalImportedIds.has(String(id)));

    // 4b. Check secondaries of already-imported event contracts for new entries.
    // Secondary contracts never appear in the paginated list — they're only accessible
    // via their parent main contract's details endpoint. We re-fetch each main contract
    // to detect secondaries added after the original import.
    const secondaryPending: { secId: string; mainDetail: any }[] = [];
    for (const ec of eventContracts) {
      const detail = await fetchContratoDetails(baseUrl, Number(ec.externalId));
      if (!detail?.secondary?.length) continue;
      for (const sec of detail.secondary) {
        const secId = String(sec.codlocacontrato || '');
        if (secId && !globalImportedIds.has(secId)) {
          secondaryPending.push({ secId, mainDetail: detail });
        }
      }
    }

    if (unknownIds.length === 0 && secondaryPending.length === 0) {
      return { success: true, status: 'up_to_date' };
    }

    // 5. Fetch details for unknown IDs in batches of 10, filter by this event's clientCode+startDate
    const pendingContracts: any[] = [];
    for (let i = 0; i < unknownIds.length; i += 10) {
      const batch = unknownIds.slice(i, i + 10);
      const details = await Promise.all(batch.map(id => fetchContratoDetails(baseUrl, id)));
      for (const d of details) {
        if (!d?.main) continue;
        const main = d.main;
        // Must match how clientCode is derived in groupContracts/sync-import (uses main.cliente)
        const contractClientCode = String(main.cliente || '');
        const contractStartDate = String(main.data_checkin || '');
        if (contractClientCode === clientCode && contractStartDate === startDate) {
          pendingContracts.push({ ...main, _secondary: d.secondary || [] });
        }
      }
    }

    // 5b. For secondary-triggered updates, push the parent main contract (with full secondary list)
    // so buildItemsSnapshot sees all products. Secondary contracts can't be fetched individually.
    for (const { mainDetail } of secondaryPending) {
      const mainId = String(mainDetail.main?.codlocacontrato || '');
      if (!pendingContracts.find((p: any) => String(p.codlocacontrato) === mainId)) {
        pendingContracts.push({ ...mainDetail.main, _secondary: mainDetail.secondary });
      }
    }

    if (pendingContracts.length === 0) {
      return { success: true, status: 'up_to_date' };
    }

    // 6. Build preview (same structure as sync-preview) so frontend can pass to sync-import
    const [allProducts, allVenues] = await Promise.all([
      (prisma as any).product.findMany({ include: { services: { include: { service: true } } } }),
      (prisma as any).venue.findMany({ where: { employerId } }),
    ]);

    const productByExtId = new Map<string, any>();
    const productByName = new Map<string, any>();
    for (const p of allProducts) {
      if (p.externalId) productByExtId.set(String(p.externalId), p);
      productByName.set(p.name.trim().toLowerCase(), p);
    }
    const venueByName = new Map<string, any>();
    for (const v of allVenues) venueByName.set(v.name.trim().toLowerCase(), v);

    const clientName = pendingContracts[0]?.razaosocial || pendingContracts[0]?.cliente_info?.razaosocial || clientCode;
    const newContractIds = pendingContracts.map((c: any) => String(c.codlocacontrato || ''));
    const rawItems = buildItemsSnapshot(pendingContracts);
    const blockingReasons: string[] = [];
    const previewItems: PreviewEventItem[] = [];

    for (const ri of rawItems) {
      let product: any = null;
      if (ri.externalProductCode) product = productByExtId.get(ri.externalProductCode);
      if (!product) product = productByName.get(ri.name.trim().toLowerCase());
      const category = product ? mapCategory(product.categoryName) : mapCategory(ri.categoryName);
      const venueMatch = venueByName.get(ri.name.trim().toLowerCase());

      if (venueMatch) {
        previewItems.push({
          name: ri.name, qty: ri.qty, unit: ri.unit,
          externalProductCode: ri.externalProductCode,
          occurrenceIndex: ri.occurrenceIndex,
          category: 'venue',
          productId: null, productName: null,
          venueId: venueMatch.id, venueName: venueMatch.name,
          subitems: [], staffServices: [],
          missing: false, missingReason: '',
        });
        continue;
      }

      let missing = false;
      let missingReason = '';
      if (!product) {
        missing = true;
        missingReason = `Produto "${ri.name}" não encontrado.`;
        blockingReasons.push(missingReason);
      }

      const subitems = product?.subitems || [];
      const staffServices = (product?.services || []).map((l: any) => ({
        id: l.service?.id || l.serviceId,
        name: l.service?.name || '',
      }));
      const resolvedCategory = category || 'unknown';

      if (!missing && resolvedCategory === 'staff' && staffServices.length === 0) {
        missing = true;
        missingReason = `Produto de equipe "${ri.name}" sem serviço vinculado.`;
        blockingReasons.push(missingReason);
      }

      previewItems.push({
        name: ri.name, qty: ri.qty, unit: ri.unit,
        externalProductCode: ri.externalProductCode,
        occurrenceIndex: ri.occurrenceIndex,
        category: resolvedCategory,
        productId: product?.id || null, productName: product?.name || null,
        venueId: null, venueName: null,
        subitems, staffServices,
        missing, missingReason,
      });
    }

    const duplicateNames = [...new Set(
      previewItems.filter(i => i.occurrenceIndex > 0).map(i => i.name)
    )];
    const preview: PreviewEvent = {
      key: `${clientCode}__${startDate}`,
      clientCode, startDate, clientName,
      existingEventId: eventId,
      action: 'update',
      contractIds: newContractIds,
      items: previewItems,
      canImport: blockingReasons.length === 0,
      blockingReasons,
      hasDuplicates: duplicateNames.length > 0,
      duplicateNames,
    };

    // Build display list: new main contracts + newly-discovered secondary contracts
    const mainContractDisplayIds = new Set(
      pendingContracts
        .filter((c: any) => !secondaryPending.some(s => String(s.mainDetail.main?.codlocacontrato) === String(c.codlocacontrato)))
        .map((c: any) => String(c.codlocacontrato))
    );
    const displayContracts = [
      ...pendingContracts
        .filter((c: any) => mainContractDisplayIds.has(String(c.codlocacontrato)))
        .map((c: any) => ({
          id: String(c.codlocacontrato),
          clientName: c.razaosocial || c.cliente_info?.razaosocial || clientCode,
          startDate: c.data_checkin || startDate,
        })),
      ...secondaryPending.map(({ secId, mainDetail }) => ({
        id: secId,
        clientName: `Complemento do contrato #${mainDetail.main?.codlocacontrato}`,
        startDate,
      })),
    ];

    return {
      success: true,
      status: 'pending',
      pendingContracts: displayContracts,
      preview,
    };
  });

  // GET /events/:id/sync-history
  app.get('/events/:id/sync-history', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const logs = await (prisma as any).eventSyncLog.findMany({
      where: { eventId: id },
      orderBy: { syncedAt: 'desc' },
    });
    return { success: true, logs };
  });

  // GET /events/:id/items — items contratados
  app.get('/events/:id/items', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const items = await (prisma as any).eventItem.findMany({
      where: { eventId: id },
      include: {
        choices: true,
        slots: true,
        product: { include: { questions: { orderBy: { order: 'asc' } } } },
        answers: { include: { updatedBy: { select: { id: true, name: true } } } },
      },
      orderBy: { category: 'asc' },
    });
    return { success: true, items };
  });

  // PATCH /events/:id/items/:itemId/choices — save client choices with history
  app.patch('/events/:id/items/:itemId/choices', { preHandler: requireAuth }, async (request, reply) => {
    const { itemId } = request.params as { id: string; itemId: string };
    const user = (request as any).user;
    const { choices } = request.body as { choices: { label: string; chosen: string[] }[] };
    for (const c of choices) {
      const existing = await (prisma as any).eventItemChoice.findFirst({ where: { eventItemId: itemId, label: c.label } });
      if (!existing) continue;
      const before: string[] = existing.chosen ?? [];
      // Making a selection auto-confirms the choice (no separate confirm step);
      // clearing the selection reverts it to pending.
      const hasSelection = (c.chosen?.length ?? 0) > 0;
      await (prisma as any).eventItemChoice.update({
        where: { id: existing.id },
        data: {
          chosen: c.chosen,
          confirmedAt: hasSelection ? new Date() : null,
          confirmedById: hasSelection ? (user?.id ?? null) : null,
        },
      });
      await (prisma as any).eventItemChoiceHistory.create({
        data: { choiceId: existing.id, before, after: c.chosen, userId: user?.id ?? null },
      });
    }
    return { success: true };
  });

  // POST /events/:id/items/:itemId/choices/confirm — confirm current choices
  app.post('/events/:id/items/:itemId/choices/confirm', { preHandler: requireAuth }, async (request, reply) => {
    const { itemId } = request.params as { id: string; itemId: string };
    const user = (request as any).user;
    const now = new Date();
    await (prisma as any).eventItemChoice.updateMany({
      where: { eventItemId: itemId },
      data: { confirmedAt: now, confirmedById: user?.id ?? null },
    });
    return { success: true };
  });

  // GET /events/:id/items/:itemId/choices/:choiceId/history
  app.get('/events/:id/items/:itemId/choices/:choiceId/history', { preHandler: requireAuth }, async (request) => {
    const { choiceId } = request.params as { id: string; itemId: string; choiceId: string };
    const history = await (prisma as any).eventItemChoiceHistory.findMany({
      where: { choiceId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, history };
  });

  // PUT /events/:id/items/:itemId/answers/:questionId — upsert answer with history
  app.put('/events/:id/items/:itemId/answers/:questionId', { preHandler: requireAuth }, async (request, reply) => {
    const { itemId, questionId } = request.params as { id: string; itemId: string; questionId: string };
    const user = (request as any).user;
    const { answer } = request.body as { answer: any };
    const existing = await (prisma as any).eventItemAnswer.findUnique({ where: { eventItemId_questionId: { eventItemId: itemId, questionId } } });
    if (existing) {
      await (prisma as any).eventItemAnswer.update({ where: { id: existing.id }, data: { answer, updatedById: user?.id ?? null } });
      await (prisma as any).eventItemAnswerHistory.create({ data: { answerId: existing.id, before: existing.answer, after: answer, userId: user?.id ?? null } });
    } else {
      const created = await (prisma as any).eventItemAnswer.create({ data: { eventItemId: itemId, questionId, answer, updatedById: user?.id ?? null } });
      await (prisma as any).eventItemAnswerHistory.create({ data: { answerId: created.id, before: null, after: answer, userId: user?.id ?? null } });
    }
    return { success: true };
  });

  // GET /events/:id/items/:itemId/comments — all comments including soft-deleted (history)
  app.get('/events/:id/items/:itemId/comments', { preHandler: requireAuth }, async (request) => {
    const { itemId } = request.params as { id: string; itemId: string };
    const comments = await (prisma as any).eventComment.findMany({
      where: { eventItemId: itemId },
      include: {
        user: { select: { id: true, name: true } },
        deletedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return { success: true, comments };
  });

  // POST /events/:id/items/:itemId/comments — add comment
  app.post('/events/:id/items/:itemId/comments', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId, itemId } = request.params as { id: string; itemId: string };
    const { content } = request.body as { content: string };
    const user = (request as any).user;
    if (!content?.trim()) return reply.status(400).send({ error: 'Conteúdo obrigatório.' });
    const comment = await (prisma as any).eventComment.create({
      data: { eventId, eventItemId: itemId, userId: user.id, content: content.trim() },
      include: {
        user: { select: { id: true, name: true } },
        deletedBy: { select: { id: true, name: true } },
      },
    });
    return reply.status(201).send({ success: true, comment });
  });

  // DELETE /events/:id/items/:itemId/comments/:commentId — soft-delete
  app.delete('/events/:id/items/:itemId/comments/:commentId', { preHandler: requireAuth }, async (request, reply) => {
    const { commentId } = request.params as { id: string; itemId: string; commentId: string };
    const user = (request as any).user;
    const existing = await (prisma as any).eventComment.findUnique({ where: { id: commentId } });
    if (!existing) return reply.status(404).send({ error: 'Comentário não encontrado.' });
    if (existing.deletedAt) return reply.status(409).send({ error: 'Já excluído.' });
    if (existing.userId !== user.id && user.role !== 'admin') {
      return reply.status(403).send({ error: 'Sem permissão.' });
    }
    const comment = await (prisma as any).eventComment.update({
      where: { id: commentId },
      data: { deletedAt: new Date(), deletedById: user.id },
      include: {
        user: { select: { id: true, name: true } },
        deletedBy: { select: { id: true, name: true } },
      },
    });
    return { success: true, comment };
  });

  // GET /events/:id/items/:itemId/answers — get answers with history
  app.get('/events/:id/items/:itemId/answers', { preHandler: requireAuth }, async (request) => {
    const { itemId } = request.params as { id: string; itemId: string };
    const answers = await (prisma as any).eventItemAnswer.findMany({
      where: { eventItemId: itemId },
      include: {
        updatedBy: { select: { id: true, name: true } },
        history: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } },
      },
    });
    return { success: true, answers };
  });
}
