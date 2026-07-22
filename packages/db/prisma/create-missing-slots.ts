/**
 * Creates missing EventService slots (and FreelancerService catalog entries if needed)
 * for roles present in the TSV but without a slot in the matched event.
 *
 * Run:
 *   cd packages/db
 *   DATABASE_URL="..." TSV_FILE="/path/to/candidaturas.tsv" npx tsx prisma/create-missing-slots.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient({ log: ['warn', 'error'] });

const TSV_FILE =
  process.env.TSV_FILE ??
  '/Users/youdo/Downloads/candidaturas_freelancers.xlsx - Candidaturas (1).tsv';

const CUTOFF_DATE = '2026-07-12';

interface Row {
  freelancer_email: string;
  event_id: string;
  evento: string;
  cliente: string;
  data_evento: string;
  servico: string;
  servico_inicio: string;
  servico_fim: string;
  max_employers: string;
  status_candidatura: string;
}

function parseTSV(content: string): Row[] {
  const lines = content.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split('\t').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split('\t').map(v => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row as unknown as Row;
  });
}

function parseBRT(s: string): Date | null {
  if (!s?.trim()) return null;
  const [datePart, timePart = '00:00'] = s.trim().split(' ');
  const parts = datePart.split('/').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [d, m, y] = parts;
  const [hh, mm] = timePart.split(':').map(Number);
  if (isNaN(hh) || isNaN(mm)) return null;
  return new Date(Date.UTC(y, m - 1, d, hh + 3, mm, 0));
}

function dayRangeBRT(ddmmyyyy: string): { gte: Date; lte: Date } {
  const [d, m, y] = ddmmyyyy.split('/').map(Number);
  return {
    gte: new Date(Date.UTC(y, m - 1, d, 3, 0, 0)),
    lte: new Date(Date.UTC(y, m - 1, d + 1, 2, 59, 59, 999)),
  };
}

function fmtBRT(d: Date): string {
  const h = (d.getUTCHours() - 3 + 24) % 24;
  return `${String(h).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
}

// Map TSV service name → DB FreelancerService name (handles typos and aliases)
const SERVICE_MAP: Record<string, string> = {
  'Limpeza':            'Aux Limpeza',
  'Gerente':            'Gestão de evento',
  'Responsável do Bar': 'Responsanvel do Bar',
};
function canonicalName(raw: string): string {
  return SERVICE_MAP[raw.trim()] ?? raw.trim();
}

async function main() {
  console.log('=== Criar slots ausentes de EventService ===\n');

  const content = fs.readFileSync(TSV_FILE, 'utf-8');
  const allRows = parseTSV(content);

  const cutoff = new Date(`${CUTOFF_DATE}T03:00:00.000Z`);
  const rows = allRows.filter(r => {
    const [d, mo, y] = r.data_evento.split('/').map(Number);
    return new Date(Date.UTC(y, mo - 1, d, 3, 0, 0)) >= cutoff && r.servico_inicio && r.servico_fim;
  });

  // Deduplicate by (old_event_id, servico)
  const seen = new Map<string, Row>();
  for (const r of rows) {
    const k = `${r.event_id}::${r.servico.trim()}`;
    if (!seen.has(k)) seen.set(k, r);
  }

  // ── 1. Ensure all needed FreelancerService catalog entries exist ──────────
  const neededServices = new Set<string>();
  for (const r of seen.values()) neededServices.add(canonicalName(r.servico));

  const catalogMap = new Map<string, string>(); // name → id
  const allServices = await (prisma as any).freelancerService.findMany({ select: { id: true, name: true } });
  for (const s of allServices) catalogMap.set(s.name, s.id);

  let catalogCreated = 0;
  for (const name of neededServices) {
    if (!catalogMap.has(name)) {
      const created = await (prisma as any).freelancerService.create({
        data: { id: randomUUID(), name, endOffsetMinutes: 30 },
      });
      catalogMap.set(name, created.id);
      console.log(`  CATÁLOGO CRIADO: "${name}"`);
      catalogCreated++;
    }
  }
  if (catalogCreated === 0) console.log('  Todos os serviços já existem no catálogo.\n');
  else console.log();

  // ── 2. Resolve events (cached) ────────────────────────────────────────────
  const eventCache = new Map<string, string | null>();

  async function resolveEvent(r: Row): Promise<string | null> {
    if (eventCache.has(r.event_id)) return eventCache.get(r.event_id)!;
    const range = dayRangeBRT(r.data_evento);
    let matches = await prisma.event.findMany({
      where: { clientName: { contains: r.cliente.trim(), mode: 'insensitive' }, startAt: range },
      select: { id: true },
    });
    if (matches.length === 0 && r.evento && r.evento.toLowerCase() !== 'a definir') {
      matches = await prisma.event.findMany({
        where: { name: { contains: r.evento.trim(), mode: 'insensitive' }, startAt: range },
        select: { id: true },
      });
    }
    const result = matches.length === 1 ? matches[0].id : null;
    eventCache.set(r.event_id, result);
    return result;
  }

  // ── 3. Create missing EventService slots ─────────────────────────────────
  console.log('── Criando slots ausentes...');
  let created = 0;
  let alreadyExists = 0;
  let skipped = 0;
  const problems: string[] = [];

  for (const [, r] of seen) {
    const startAt = parseBRT(r.servico_inicio);
    const endAt   = parseBRT(r.servico_fim);
    if (!startAt || !endAt) { skipped++; continue; }

    const eventId = await resolveEvent(r);
    if (!eventId) {
      skipped++;
      continue;
    }

    const dbName    = canonicalName(r.servico);
    const serviceId = catalogMap.get(dbName);
    if (!serviceId) { skipped++; continue; }

    // Check if slot already exists
    const existing = await (prisma as any).eventService.findFirst({
      where: { eventId, serviceId },
    });

    if (existing) {
      // Slot exists but wasn't matched earlier (different name alias) — just update times
      await (prisma as any).eventService.update({
        where: { id: existing.id },
        data: { startAt, endAt },
      });
      alreadyExists++;
      console.log(`  ~ ${dbName.padEnd(25)} ${r.cliente.substring(0,28).padEnd(28)} ${r.data_evento}  ${fmtBRT(startAt)}–${fmtBRT(endAt)}  (atualizado)`);
      continue;
    }

    const maxSlots = parseInt(r.max_employers, 10) || 1;

    await (prisma as any).eventService.create({
      data: {
        id: randomUUID(),
        eventId,
        serviceId,
        maxSlots,
        valuePerHour: 0,
        startAt,
        endAt,
        status: 'active',
      },
    });
    created++;
    console.log(`  + ${dbName.padEnd(25)} ${r.cliente.substring(0,28).padEnd(28)} ${r.data_evento}  ${fmtBRT(startAt)}–${fmtBRT(endAt)}`);
  }

  console.log('\n=== Resumo ===');
  console.log(`Serviços criados no catálogo : ${catalogCreated}`);
  console.log(`Slots criados                : ${created}`);
  console.log(`Slots atualizados (já existia): ${alreadyExists}`);
  console.log(`Pulados (evento não encontrado / hora inválida): ${skipped}`);
  if (problems.length) problems.forEach(p => console.log(`  • ${p}`));
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
