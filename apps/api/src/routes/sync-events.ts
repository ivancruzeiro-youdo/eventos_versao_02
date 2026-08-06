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

// Fetch paginated list of contract IDs from the satelite experience API (Bearer auth; includes real start/end times)
async function fetchContratoIds(token: string, baseUrl: string): Promise<number[]> {
  const all: number[] = [];
  let start = 0;
  const limit = 200;
  while (true) {
    const res = await fetch(`${baseUrl}/api/userp-satelite/experience/contracts-paginated.php?start=${start}&limit=${limit}&order_by=contrato_desc`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Erro ao listar contratos: ${res.status}`);
    const data: any = await res.json();
    const items: any[] = data?.items || [];
    for (const c of items) all.push(c.codlocacontrato);
    if (!data?.has_more || items.length === 0) break;
    start = data?.next_start ?? (start + limit);
  }
  return all;
}

// Fetch full contract details (has inicio_evento/fim_evento/data_checkin with real time, and produtos)
async function fetchContratoDetails(token: string, baseUrl: string, codlocacontrato: number): Promise<any | null> {
  const res = await fetch(`${baseUrl}/api/userp-satelite/experience/contracts-details.php?codlocacontrato=${codlocacontrato}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  let data: any;
  try { data = await res.json(); } catch { return null; }
  if (!data?.success) return null;
  return data?.contracts ?? null;
}

// Distinguish a confirmed "contract no longer exists" (safe to act on) from a transient/other
// error (inconclusive — must never be treated as evidence the contract was removed).
async function contratoStatus(token: string, baseUrl: string, codlocacontrato: number): Promise<'found' | 'not_found' | 'error'> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/userp-satelite/experience/contracts-details.php?codlocacontrato=${codlocacontrato}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
  } catch {
    return 'error';
  }
  let data: any;
  try { data = await res.json(); } catch { return 'error'; }
  if (res.ok && data?.success) return 'found';
  if (data?.error === 'not_found' || res.status === 404) return 'not_found';
  return 'error';
}

// Fetch all contracts with details, filtering to today-or-future by data_checkin (date-only comparison)
async function fetchContratos(token: string, baseUrl: string): Promise<any[]> {
  const today = new Date().toISOString().slice(0, 10);
  const ids = await fetchContratoIds(token, baseUrl);
  const results: any[] = [];
  // Fetch details in parallel batches of 10
  for (let i = 0; i < ids.length; i += 10) {
    const batch = ids.slice(i, i + 10);
    const details = await Promise.all(batch.map(id => fetchContratoDetails(token, baseUrl, id)));
    for (const d of details) {
      if (!d) continue;
      const main = d.main;
      if (!main) continue;
      const checkin: string = String(main.data_checkin || '').slice(0, 10);
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

// Business rule: contracted Garçom/Bartender headcount is automatically split across
// specialized roles instead of a single flat service. Responsável roles are always
// guaranteed (never dropped for small contracts, per business decision); Garçom/Montador
// takes 40% of the total (rounded up, minimum 2) from whatever's left after the
// Responsável de Salão seat, and the remainder stays as base Garçom.
async function resolveStaffAllocations(
  svc: { id: string; name: string },
  qty: number
): Promise<{ serviceId: string; maxSlots: number }[]> {
  const total = Math.ceil(qty);
  if (total <= 0) return [];

  if (svc.name === 'Garçom') {
    const montadorSvc = await (prisma as any).freelancerService.findFirst({ where: { name: 'Garçom/Montador' } });
    const responsavelSvc = await (prisma as any).freelancerService.findFirst({ where: { name: 'Responsavel de salão' } });
    if (!montadorSvc || !responsavelSvc) {
      console.warn(`[resolveStaffAllocations] Cargo "Garçom/Montador" ou "Responsavel de salão" não encontrado no FreelancerService — split desativado, criando ${total} vaga(s) de Garçom sem divisão.`);
      return [{ serviceId: svc.id, maxSlots: total }]; // roles not configured — fall back to flat
    }

    const responsavelCount = 1; // always guaranteed
    const remaining = total - responsavelCount;
    const montadorCount = Math.max(Math.min(remaining, Math.max(Math.ceil(total * 0.4), 2)), 0);
    const baseCount = Math.max(remaining - montadorCount, 0);

    const out: { serviceId: string; maxSlots: number }[] = [{ serviceId: responsavelSvc.id, maxSlots: responsavelCount }];
    if (montadorCount > 0) out.push({ serviceId: montadorSvc.id, maxSlots: montadorCount });
    if (baseCount > 0) out.push({ serviceId: svc.id, maxSlots: baseCount });
    return out;
  }

  if (svc.name === 'Bartender') {
    const responsavelBarSvc = await (prisma as any).freelancerService.findFirst({ where: { name: 'Responsanvel do Bar' } });
    if (!responsavelBarSvc) {
      console.warn(`[resolveStaffAllocations] Cargo "Responsanvel do Bar" não encontrado no FreelancerService — split desativado, criando ${total} vaga(s) de Bartender sem divisão.`);
      return [{ serviceId: svc.id, maxSlots: total }];
    }

    const responsavelCount = 1; // fixed, always exactly 1 per event
    const baseCount = Math.max(total - responsavelCount, 0);

    const out: { serviceId: string; maxSlots: number }[] = [{ serviceId: responsavelBarSvc.id, maxSlots: responsavelCount }];
    if (baseCount > 0) out.push({ serviceId: svc.id, maxSlots: baseCount });
    return out;
  }

  return [{ serviceId: svc.id, maxSlots: total }];
}

// Group contracts by (cliente, data_checkin) — same event (one main per key already, but keep for merge)
function groupContracts(contracts: any[]): Map<string, any[]> {
  const map = new Map<string, any[]>();
  for (const c of contracts) {
    const key = `${c.cliente}__${String(c.data_checkin || '').slice(0, 10)}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }
  return map;
}

// Build items snapshot from experience contracts — keeps duplicates separate (one entry per occurrence)
// Fields: id, prodct-id, name, qtde, details.category, details.unity
function buildItemsSnapshot(contracts: any[]): { name: string; qty: number; unit: string; externalProductCode: string | null; categoryName: string | null; occurrenceIndex: number; sourceContractExternalId: string | null }[] {
  const list: { name: string; qty: number; unit: string; externalProductCode: string | null; categoryName: string | null; occurrenceIndex: number; sourceContractExternalId: string | null }[] = [];
  const counts: Record<string, number> = {};
  for (const c of contracts) {
    const mainContractId = String(c.codlocacontrato || '') || null;
    const produtos: any[] = c.produtos || [];
    const secondary: any[] = c._secondary || [];
    // Tag each product with the actual contract (main or secondary) it came from — used as
    // EventItem.sourceContractId. Products used to be tagged with the *primary* contract of
    // the whole sync batch regardless of which one they really came from, which made it
    // impossible to tell (or later verify against Userp) where an item actually originated.
    const allProdutos = [
      ...produtos.map((p: any) => ({ p, sourceContractExternalId: mainContractId })),
      ...secondary.flatMap((s: any) => {
        const secId = String(s.codlocacontrato || '') || mainContractId;
        return (s.produtos || []).map((p: any) => ({ p, sourceContractExternalId: secId }));
      }),
    ];
    for (const { p, sourceContractExternalId } of allProdutos) {
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
        sourceContractExternalId,
      });
    }
  }
  return list;
}

// Collapse duplicate products by summing quantities (used when operator chooses to group)
function collapseItemsSnapshot(items: { name: string; qty: number; unit: string; externalProductCode: string | null; categoryName: string | null; occurrenceIndex: number; sourceContractExternalId: string | null }[]) {
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
  sourceContractExternalId: string | null;
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

    let token: string, baseUrl: string;
    try {
      ({ token, baseUrl } = await getUserpToken());
    } catch (e: any) {
      return reply.status(400).send({ error: e.message });
    }

    let rawContracts: any[];
    try {
      rawContracts = await fetchContratos(token, baseUrl);
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
    // Identidade do evento vem do codlocacontrato, que é imutável. A chave
    // clientCode__startDate depende de data_checkin, que MUDA no UERP quando o evento é
    // remarcado — e aí a chave antiga nunca mais casava, o evento parecia novo e cada
    // sincronização criava uma duplicata (14 eventos do mesmo contrato, na prática).
    // Mantemos a chave por data só como fallback pra eventos importados antes disso.
    const eventIdByContractId: Map<string, string> = new Map();
    const keyToEventId: Map<string, string> = new Map();
    for (const c of existingContracts) {
      eventIdByContractId.set(String(c.externalId), c.eventId);
      keyToEventId.set(`${c.clientCode}__${c.startDate}`, c.eventId);
    }

    const grouped = groupContracts(rawContracts);
    const previews: PreviewEvent[] = [];

    for (const [key, contracts] of grouped) {
      const [clientCode, startDate] = key.split('__');
      const clientName = contracts[0]?.razaosocial || contracts[0]?.cliente_info?.razaosocial || clientCode;

      // Determine action — use codlocacontrato as external ID
      const newContractIds = contracts.map((c: any) => String(c.codlocacontrato || ''));

      // Procura o evento primeiro pelos contratos deste grupo (inclui os secundários, que
      // também identificam o evento), e só cai na chave por data se nenhum contrato for
      // conhecido — ou seja, se o evento realmente nunca foi importado.
      const identifyingIds = [
        ...newContractIds,
        ...contracts.flatMap((c: any) => (c._secondary || []).map((s: any) => String(s.codlocacontrato || ''))),
      ].filter(Boolean);
      let existingEventId: string | null = null;
      for (const cid of identifyingIds) {
        const mapped = eventIdByContractId.get(cid);
        if (mapped) { existingEventId = mapped; break; }
      }
      if (!existingEventId) existingEventId = keyToEventId.get(key) || null;

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
            sourceContractExternalId: ri.sourceContractExternalId,
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
          sourceContractExternalId: ri.sourceContractExternalId,
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

    let token: string, baseUrl: string;
    try {
      ({ token, baseUrl } = await getUserpToken());
    } catch (e: any) {
      return reply.status(400).send({ error: e.message });
    }

    // Parse a UERP local-time string ("YYYY-MM-DD HH:MM:SS") as BRT (fixed UTC-3, no DST since 2019)
    function parseBrt(s: string | null | undefined): Date | null {
      if (!s) return null;
      const iso = s.trim().replace(' ', 'T');
      const d = new Date(`${iso}-03:00`);
      return isNaN(d.getTime()) ? null : d;
    }

    const results: { key: string; action: string; eventId: string }[] = [];

    for (const preview of previews) {
      if (!preview.canImport) continue;
      const { key, clientCode, startDate, clientName, existingEventId, action, contractIds, items } = preview;

      // Fetch raw contract details for each contractId to store rawJson
      const relatedRaw: any[] = [];
      for (const cid of contractIds) {
        if (!cid) continue;
        const detail = await fetchContratoDetails(token, baseUrl, Number(cid)).catch(() => null);
        if (detail?.main) relatedRaw.push({ ...detail.main, _secondary: detail.secondary || [] });
      }

      let eventId = existingEventId || '';
      let effectiveAction = action;

      // O `previews` chega do frontend, então `action` pode estar velho: reenvio do mesmo
      // payload, duplo clique, outra aba aberta, ou um preview gerado antes de outro
      // operador importar o mesmo evento. Reconfere agora, pela identidade imutável do
      // contrato, se o evento já existe — sem isso, um "create" velho cria uma duplicata.
      if (effectiveAction === 'create') {
        const ids = contractIds.filter(Boolean);
        const already = ids.length
          ? await (prisma as any).eventContract.findFirst({
              where: { externalId: { in: ids } },
              select: { eventId: true },
            })
          : null;
        if (already) {
          eventId = already.eventId;
          effectiveAction = 'update';
        }
      }

      if (effectiveAction === 'create') {
        // Prefer real times from Userp (inicio_evento/fim_evento/data_checkin); fall back to the
        // old fixed placeholder (noon-to-7pm BRT) when Userp's hour fields aren't filled in.
        const primaryRaw = relatedRaw[0] || null;
        const setupAtObj = parseBrt(primaryRaw?.data_checkin);
        const startAtObj = parseBrt(primaryRaw?.inicio_evento) || new Date(`${startDate}T15:00:00.000Z`); // fallback: 12:00 BRT
        const teardownAtObj = parseBrt(primaryRaw?.fim_evento) || new Date(startAtObj.getTime() + 7 * 60 * 60_000); // fallback: +7h
        const checkoutAtObj = parseBrt(primaryRaw?.data_checkout);
        const ev = await (prisma as any).event.create({
          data: {
            name: `${clientName} — ${startDate}`,
            clientName,
            employerId,
            status: 'confirmed',
            ...(setupAtObj ? { setupAt: setupAtObj } : {}),
            startAt: startAtObj,
            teardownAt: teardownAtObj,
            ...(checkoutAtObj ? { checkoutAt: checkoutAtObj } : {}),
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
          // Reescreve também clientCode/startDate: antes só o rawJson era atualizado, então
          // um evento remarcado no UERP ficava com o startDate antigo pra sempre e a chave
          // de deduplicação nunca se corrigia (gerando uma duplicata por sincronização).
          await (prisma as any).eventContract.update({
            where: { id: exists.id },
            data: { rawJson: rc, clientCode, startDate },
          });
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
            await (prisma as any).eventContract.update({
              where: { id: secExists.id },
              data: { rawJson: sec, clientCode, startDate },
            });
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

      // Fallback only — every item should carry its own sourceContractExternalId now
      // (tagged per-product in buildItemsSnapshot), pointing at the exact main/secondary
      // contract it came from instead of always the batch's primary contract.
      const primaryContractId = contractIds[0] || null;

      const resolvedItems = groupDuplicates ? (collapseItemsSnapshot(items as any) as unknown as PreviewEventItem[]) : items;

      for (const item of resolvedItems) {
        const itemContractId = item.sourceContractExternalId || primaryContractId;

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
                sourceContractId: itemContractId,
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
              ...(existing.sourceContractId == null && itemContractId
                ? { sourceContractId: itemContractId }
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
              sourceContractId: itemContractId,
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
            const allocations = await resolveStaffAllocations(svc, item.qty);
            for (const alloc of allocations) {
              const existingSvc = await (prisma as any).eventService.findFirst({ where: { eventId, serviceId: alloc.serviceId } });
              if (existingSvc) {
                // Update maxSlots only — preserve all operator-entered data
                await (prisma as any).eventService.update({
                  where: { id: existingSvc.id },
                  data: { maxSlots: alloc.maxSlots },
                });
              } else {
                const svcData = await (prisma as any).freelancerService.findUnique({ where: { id: alloc.serviceId } });
                if (!svcData) {
                  console.error(`[sync-events] FreelancerService ${alloc.serviceId} não encontrado ao criar EventService pro item "${item.name}" (evento ${eventId}) — vaga será criada com valorPorHora=0 e horário padrão -60/+60min. Verifique se o serviço foi renomeado/excluído.`);
                }
                const startOffset: number = svcData?.startOffsetMinutes ?? -60;
                const endOffset: number = svcData?.endOffsetMinutes ?? 60;
                const svcStart = new Date(eventStartAt.getTime() + startOffset * 60_000);
                const svcEnd = new Date(eventEndBase.getTime() + endOffset * 60_000);
                await (prisma as any).eventService.create({
                  data: {
                    eventId,
                    serviceId: alloc.serviceId,
                    productName: item.name,
                    maxSlots: alloc.maxSlots,
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
      }

      // Datas remarcadas no UERP: avisa em vez de sobrescrever. O evento pode ter horários
      // ajustados à mão pelo operador (o resto deste import nunca sobrescreve dado humano),
      // mas uma divergência silenciosa é pior — foi assim que um evento ficou marcado 5 dias
      // depois da data real, com freelancer já inscrito. Aqui a equipe vê e decide.
      if (effectiveAction !== 'create') {
        const primaryRaw = relatedRaw[0] || null;
        const uerpStart = parseBrt(primaryRaw?.inicio_evento);
        const evNow = await (prisma as any).event.findUnique({
          where: { id: eventId },
          select: { startAt: true },
        });
        const curStart: Date | null = evNow?.startAt ?? null;
        const sameDay = uerpStart && curStart
          && uerpStart.toISOString().slice(0, 10) === curStart.toISOString().slice(0, 10);
        if (uerpStart && curStart && !sameDay) {
          await (prisma as any).eventComment.create({
            data: {
              eventId,
              userId: null,
              isSystem: true,
              content:
                `ATENÇÃO — data divergente do UERP (contrato ${contractIds.filter(Boolean).join(', ')}):\n` +
                `no sistema: ${curStart.toISOString().slice(0, 10)}\n` +
                `no UERP: ${uerpStart.toISOString().slice(0, 10)}\n\n` +
                `A data não foi alterada automaticamente para não sobrescrever ajustes manuais. ` +
                `Confira e corrija o evento se necessário.`,
            },
          });
        }
      }

      // Auto system comment — only when there are real changes
      if (effectiveAction !== 'create' && (syncAddedItems.length > 0 || syncUpdatedQty.length > 0)) {
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
      const diff = effectiveAction !== 'no_change' ? { old: oldSnap, new: newItemsSnap } : null;

      await (prisma as any).eventSyncLog.create({
        data: {
          eventId,
          action: effectiveAction,
          diff,
          triggeredBy: user.id || null,
        },
      });

      results.push({ key, action: effectiveAction, eventId });
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
      select: { id: true, externalId: true, clientCode: true, startDate: true },
      orderBy: { createdAt: 'asc' },
    });

    if (eventContracts.length === 0) {
      return { success: true, status: 'no_contracts', pendingRemovals: [], pendingItemRemovals: [] };
    }

    const { clientCode, startDate } = eventContracts[0];

    // 2. Get all globally imported contract IDs from DB (to diff against USERP)
    const allImportedContracts = await (prisma as any).eventContract.findMany({
      select: { externalId: true },
    });
    const globalImportedIds = new Set(allImportedContracts.map((c: any) => String(c.externalId)));

    let token: string, baseUrl: string;
    try {
      ({ token, baseUrl } = await getUserpToken());
    } catch (e: any) {
      return reply.status(400).send({ error: e.message });
    }

    // 3. Fetch all USERP contract IDs (paginated, only IDs — fast)
    let userpIds: number[];
    try {
      userpIds = await fetchContratoIds(token, baseUrl);
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
    const detailByExternalId = new Map<string, any | null>();
    for (const ec of eventContracts) {
      const detail = await fetchContratoDetails(token, baseUrl, Number(ec.externalId));
      detailByExternalId.set(ec.externalId, detail);
      if (!detail?.secondary?.length) continue;
      for (const sec of detail.secondary) {
        const secId = String(sec.codlocacontrato || '');
        if (secId && !globalImportedIds.has(secId)) {
          secondaryPending.push({ secId, mainDetail: detail });
        }
      }
    }

    // Health check: does each locally-stored contract still match the current UERP state?
    // - missing (main contract only): fetchContratoDetails returned null for a direct lookup by
    //   its own id — meaningful ONLY for the primary contract. Secondary contracts 404 on that
    //   same direct lookup even when perfectly valid (Userp only resolves them via their parent's
    //   own `secondary[]` list, never standalone) — so "missing" is left false for them and the
    //   only trustworthy signal is unlinkedInUerp below.
    // - unlinkedInUerp: contract was imported as a secondary, but no longer appears in the
    //   main contract's current `secondary[]` list (link was broken on the UERP side)
    const mainDetail = detailByExternalId.get(eventContracts[0].externalId);
    const mainSecondaryIds = new Set(
      (mainDetail?.secondary ?? []).map((s: any) => String(s.codlocacontrato || ''))
    );
    const contractHealth = eventContracts.map((ec: any, i: number) => {
      if (i === 0) {
        const detail = detailByExternalId.get(ec.externalId);
        return { id: ec.id, externalId: ec.externalId, missing: detail === null, unlinkedInUerp: false };
      }
      const unlinkedInUerp = mainDetail !== null && !mainSecondaryIds.has(String(ec.externalId));
      return { id: ec.id, externalId: ec.externalId, missing: false, unlinkedInUerp };
    });

    // Removal proposals: contracts confirmed gone from UERP — list what would be removed, but
    // never delete anything here. Actual deletion only happens via
    // POST /events/:id/contracts/:contractId/confirm-removal, after the operator explicitly confirms.
    const pendingRemovals: {
      contractId: string; externalId: string; clientCode: string; startDate: string;
      items: { id: string; name: string; category: string; quantity: number }[];
    }[] = [];
    for (let i = 0; i < contractHealth.length; i++) {
      const h = contractHealth[i];
      let confirmedGone = false;
      if (i === 0 && h.missing) {
        // Primary contract: a direct lookup is meaningful, but double-check via contratoStatus
        // to distinguish a real 404 from a transient error before proposing removal.
        const status = await contratoStatus(token, baseUrl, Number(h.externalId));
        confirmedGone = status === 'not_found';
      } else if (i > 0 && h.unlinkedInUerp) {
        // Secondary contract: already confirmed via the primary's own secondary[] list above —
        // no further (unreliable) standalone lookup needed.
        confirmedGone = true;
      }
      if (!confirmedGone) continue;
      const ec = eventContracts.find((c: any) => c.id === h.id);
      const items = await (prisma as any).eventItem.findMany({
        where: { eventId, sourceContractId: h.externalId },
        select: { id: true, name: true, category: true, quantity: true },
      });
      pendingRemovals.push({
        contractId: h.id, externalId: h.externalId,
        clientCode: ec?.clientCode ?? '', startDate: ec?.startDate ?? '',
        items,
      });
    }

    // Live product list (by name, lowercased) for every contract that's still linked and
    // valid (main + secondaries not flagged missing/unlinked) — built once, reused below by
    // both the reconciliation (add-missing) and removal-detection (drop-orphaned) passes.
    const liveNamesByContract = new Map<string, Set<string>>();
    for (let i = 0; i < contractHealth.length; i++) {
      const h = contractHealth[i];
      if (h.missing || h.unlinkedInUerp) continue; // gone entirely — handled by pendingRemovals above
      const liveProducts: any[] | undefined = i === 0
        ? detailByExternalId.get(h.externalId)?.main?.produtos
        : (mainDetail?.secondary ?? []).find((s: any) => String(s.codlocacontrato || '') === String(h.externalId))?.produtos;
      if (!liveProducts) continue; // couldn't verify this contract's current product list — inconclusive
      liveNamesByContract.set(
        h.externalId,
        new Set(liveProducts.map((p: any) => String(p.name || p.details?.description || '').trim().toLowerCase()))
      );
    }
    // Union across all valid contracts — checking removal-eligibility against this instead of
    // only the item's own recorded sourceContractId avoids false positives when that field is
    // stale/wrong (e.g. items imported before per-item contract tracking existed): a product
    // that's live under a DIFFERENT valid contract than the one it happens to be tagged with
    // must never be proposed for removal.
    const allLiveNames = new Set<string>();
    for (const set of liveNamesByContract.values()) for (const n of set) allLiveNames.add(n);
    const validExternalIds = [...liveNamesByContract.keys()];

    // Reconciliation: a live product in a still-valid contract with no matching EventItem
    // anywhere in the event (by name) is imported right now — purely additive, so unlike
    // removal this needs no confirmation step, same as a normal periodic sync would do.
    const reimportedNames: string[] = [];
    if (validExternalIds.length > 0) {
      const existingItems = await (prisma as any).eventItem.findMany({ where: { eventId }, select: { name: true } });
      const existingNames = new Set(existingItems.map((it: any) => it.name.trim().toLowerCase()));

      const [allProducts, eventRecord] = await Promise.all([
        (prisma as any).product.findMany({ include: { services: { include: { service: true } } } }),
        (prisma as any).event.findUnique({ where: { id: eventId }, select: { startAt: true, teardownAt: true } }),
      ]);
      const productByName = new Map<string, any>();
      for (const p of allProducts) productByName.set(p.name.trim().toLowerCase(), p);

      for (let i = 0; i < contractHealth.length; i++) {
        const h = contractHealth[i];
        const liveNames = liveNamesByContract.get(h.externalId);
        if (!liveNames) continue;
        const liveProducts: any[] = i === 0
          ? detailByExternalId.get(h.externalId)?.main?.produtos ?? []
          : (mainDetail?.secondary ?? []).find((s: any) => String(s.codlocacontrato || '') === String(h.externalId))?.produtos ?? [];

        for (const p of liveProducts) {
          const pname = String(p.name || p.details?.description || '').trim();
          if (!pname || existingNames.has(pname.toLowerCase())) continue;

          const product = productByName.get(pname.toLowerCase());
          if (!product) continue; // not in our catalog — nothing we can safely auto-create

          const category = mapCategory(product.categoryName) || 'other';
          const qty = Number(p.qtde || 1);
          await (prisma as any).eventItem.create({
            data: {
              eventId, productId: product.id, sourceContractId: h.externalId,
              category, name: pname, quantity: qty, unit: p.details?.unity || null,
            },
          });
          existingNames.add(pname.toLowerCase());
          reimportedNames.push(pname);

          // Staff: upsert EventService slots (never delete/duplicate — existingSvc short-circuits)
          if (category === 'staff') {
            const staffServices: { id: string; name: string }[] = (product.services || []).map((l: any) => ({
              id: l.service?.id || l.serviceId, name: l.service?.name || '',
            }));
            const eventStartAt: Date = eventRecord?.startAt ?? new Date(`${startDate}T12:00:00`);
            const eventEndBase: Date = eventRecord?.teardownAt ?? eventStartAt;
            for (const svc of staffServices) {
              const allocations = await resolveStaffAllocations(svc, qty);
              for (const alloc of allocations) {
                const existingSvc = await (prisma as any).eventService.findFirst({ where: { eventId, serviceId: alloc.serviceId } });
                if (existingSvc) {
                  await (prisma as any).eventService.update({ where: { id: existingSvc.id }, data: { maxSlots: alloc.maxSlots } });
                } else {
                  const svcData = await (prisma as any).freelancerService.findUnique({ where: { id: alloc.serviceId } });
                  const startOffset: number = svcData?.startOffsetMinutes ?? -60;
                  const endOffset: number = svcData?.endOffsetMinutes ?? 60;
                  await (prisma as any).eventService.create({
                    data: {
                      eventId, serviceId: alloc.serviceId, productName: pname, maxSlots: alloc.maxSlots,
                      valuePerHour: svcData?.hourlyRate ?? 0,
                      startAt: new Date(eventStartAt.getTime() + startOffset * 60_000),
                      endAt: new Date(eventEndBase.getTime() + endOffset * 60_000),
                      status: 'active',
                    },
                  });
                }
              }
            }
          }
        }
      }

      if (reimportedNames.length > 0) {
        await (prisma as any).eventComment.create({
          data: {
            eventId, userId: null, isSystem: true,
            content: `Reconciliação automática com o Userp: item(ns) ausente(s) no sistema foram reimportados — ${reimportedNames.join(', ')}.`,
          },
        });
      }
    }

    // Individual products dropped from a contract that's still linked and valid (different
    // from the whole-contract case above) — e.g. the contract still exists, but this one
    // product line was removed/replaced in Userp. Same detect-only, confirm-to-delete pattern
    // via POST /events/:id/items/:itemId/confirm-removal.
    const pendingItemRemovals: {
      itemId: string; name: string; category: string; quantity: number; contractExternalId: string;
    }[] = [];
    if (validExternalIds.length > 0) {
      const itemsFromValidContracts = await (prisma as any).eventItem.findMany({
        where: { eventId, sourceContractId: { in: validExternalIds } },
        select: { id: true, name: true, category: true, quantity: true, sourceContractId: true },
      });
      for (const it of itemsFromValidContracts) {
        if (!allLiveNames.has(it.name.trim().toLowerCase())) {
          pendingItemRemovals.push({
            itemId: it.id, name: it.name, category: it.category, quantity: it.quantity,
            contractExternalId: it.sourceContractId,
          });
        }
      }
    }

    if (unknownIds.length === 0 && secondaryPending.length === 0) {
      return { success: true, status: 'up_to_date', contractHealth, pendingRemovals, pendingItemRemovals };
    }

    // 5. Fetch details for unknown IDs in batches of 10, filter by this event's clientCode+startDate
    const pendingContracts: any[] = [];
    for (let i = 0; i < unknownIds.length; i += 10) {
      const batch = unknownIds.slice(i, i + 10);
      const details = await Promise.all(batch.map(id => fetchContratoDetails(token, baseUrl, id)));
      for (const d of details) {
        if (!d?.main) continue;
        const main = d.main;
        // Must match how clientCode is derived in groupContracts/sync-import (uses main.cliente)
        const contractClientCode = String(main.cliente || '');
        const contractStartDate = String(main.data_checkin || '').slice(0, 10);
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
      return { success: true, status: 'up_to_date', contractHealth, pendingRemovals, pendingItemRemovals };
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
          sourceContractExternalId: ri.sourceContractExternalId,
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
        sourceContractExternalId: ri.sourceContractExternalId,
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
          startDate: String(c.data_checkin || '').slice(0, 10) || startDate,
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
      contractHealth,
      pendingRemovals,
      pendingItemRemovals,
    };
  });

  // POST /events/:id/items/:itemId/confirm-removal — operator-confirmed removal of a single
  // item whose product dropped off a contract that's still linked and otherwise valid
  // (contrast with confirm-removal below, which removes an entire contract).
  app.post('/events/:id/items/:itemId/confirm-removal', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId, itemId } = request.params as { id: string; itemId: string };
    const user = (request as any).user;

    const item = await (prisma as any).eventItem.findFirst({ where: { id: itemId, eventId } });
    if (!item) return reply.status(404).send({ error: 'Item não encontrado neste evento.' });
    if (!item.sourceContractId) return reply.status(400).send({ error: 'Este item não tem contrato de origem registrado.' });

    let token: string, baseUrl: string;
    try {
      ({ token, baseUrl } = await getUserpToken());
    } catch (e: any) {
      return reply.status(400).send({ error: e.message });
    }

    // Re-check right before deleting against the UNION of every still-valid contract linked to
    // this event (not just item.sourceContractId's own one) — that field can be stale/wrong for
    // items imported before per-item contract tracking existed, and trusting it alone here would
    // risk deleting a product that's actually still live under a different valid contract.
    const eventContracts = await (prisma as any).eventContract.findMany({ where: { eventId }, orderBy: { createdAt: 'asc' } });
    const mainExternalId = eventContracts[0]?.externalId;
    const mainDetail = mainExternalId ? await fetchContratoDetails(token, baseUrl, Number(mainExternalId)) : null;
    if (!mainDetail) {
      return reply.status(409).send({ error: 'Não foi possível confirmar o estado atual no Userp — remoção cancelada.' });
    }
    const mainSecondaryIds = new Set((mainDetail.secondary ?? []).map((s: any) => String(s.codlocacontrato || '')));
    const allLiveNames = new Set<string>();
    for (const p of mainDetail.main?.produtos ?? []) {
      allLiveNames.add(String(p.name || p.details?.description || '').trim().toLowerCase());
    }
    for (const ec of eventContracts.slice(1)) {
      if (!mainSecondaryIds.has(String(ec.externalId))) continue; // unlinked — not part of the valid union
      const secProducts = (mainDetail.secondary ?? []).find((s: any) => String(s.codlocacontrato || '') === String(ec.externalId))?.produtos ?? [];
      for (const p of secProducts) {
        allLiveNames.add(String(p.name || p.details?.description || '').trim().toLowerCase());
      }
    }
    if (allLiveNames.has(item.name.trim().toLowerCase())) {
      return reply.status(409).send({ error: 'Este produto voltou a existir num contrato válido do Userp — remoção cancelada.' });
    }

    // KitchenEventMenu.eventItemId has no cascade rule — null it out before deleting the item.
    await (prisma as any).kitchenEventMenu.updateMany({ where: { eventItemId: item.id }, data: { eventItemId: null } });
    await (prisma as any).eventItem.delete({ where: { id: item.id } });

    const categoryLabel: Record<string, string> = { ab: 'A&B', infra: 'Infraestrutura', staff: 'Mão de Obra', venue: 'Local' };
    await (prisma as any).eventComment.create({
      data: {
        eventId, userId: user.id || null, isSystem: true,
        content: `Item "${item.name}" (${categoryLabel[item.category] || item.category}, qtd. ${item.quantity}) não foi mais encontrado no contrato ${item.sourceContractId} do Userp e foi removido por ${user.name || user.email}.`,
      },
    });

    return { success: true };
  });

  // POST /events/:id/contracts/:contractId/confirm-removal — operator-confirmed removal of a
  // contract that no longer exists in Userp, plus the items it contributed to A&B/Infra/Staff.
  app.post('/events/:id/contracts/:contractId/confirm-removal', { preHandler: requireAuth }, async (request, reply) => {
    const { id: eventId, contractId } = request.params as { id: string; contractId: string };
    const user = (request as any).user;

    const contract = await (prisma as any).eventContract.findFirst({ where: { id: contractId, eventId } });
    if (!contract) return reply.status(404).send({ error: 'Contrato não encontrado neste evento.' });

    let token: string, baseUrl: string;
    try {
      ({ token, baseUrl } = await getUserpToken());
    } catch (e: any) {
      return reply.status(400).send({ error: e.message });
    }

    // Re-check right before deleting — avoid removing something that came back since the proposal was shown.
    const status = await contratoStatus(token, baseUrl, Number(contract.externalId));
    if (status !== 'not_found') {
      return reply.status(409).send({ error: 'O contrato voltou a existir no Userp (ou a checagem falhou) — remoção cancelada.' });
    }

    const items = await (prisma as any).eventItem.findMany({
      where: { eventId, sourceContractId: contract.externalId },
      select: { id: true, name: true, category: true, quantity: true },
    });
    const itemIds = items.map((i: any) => i.id);

    if (itemIds.length > 0) {
      // KitchenEventMenu.eventItemId has no cascade rule — null it out before deleting the items.
      await (prisma as any).kitchenEventMenu.updateMany({
        where: { eventItemId: { in: itemIds } },
        data: { eventItemId: null },
      });
      await (prisma as any).eventItem.deleteMany({ where: { id: { in: itemIds } } });
    }

    const categoryLabel: Record<string, string> = { ab: 'A&B', infra: 'Infraestrutura', staff: 'Mão de Obra', venue: 'Local' };
    const lines = [
      `Contrato ${contract.externalId} não foi mais encontrado no Userp e foi removido por ${user.name || user.email}.`,
    ];
    if (items.length > 0) {
      lines.push('');
      lines.push('Itens removidos:');
      items.forEach((i: any) => lines.push(`- ${i.name} (${categoryLabel[i.category] || i.category}) — qtd. ${i.quantity}`));
    } else {
      lines.push('Nenhum item vinculado a esse contrato para remover.');
    }

    await (prisma as any).eventComment.create({
      data: { eventId, userId: user.id || null, isSystem: true, content: lines.join('\n') },
    });

    await (prisma as any).eventContract.delete({ where: { id: contractId } });

    return { success: true, removedItems: items.length };
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
