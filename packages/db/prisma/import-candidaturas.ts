/**
 * Import freelancer applications from the legacy system TSV export.
 *
 * Only imports applications for events on or after CUTOFF_DATE (tomorrow).
 * Freelancers not found in the DB are created from TSV data.
 * Events are matched by clientName + date, with fallback to event name + date.
 *
 * Run:
 *   cd packages/db
 *   DATABASE_URL="..." TSV_FILE="/path/to/candidaturas.tsv" tsx prisma/import-candidaturas.ts
 */

import { PrismaClient, ApplicationStatus, FreelancerStatus } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient({ log: ['warn', 'error'] });

const TSV_FILE =
  process.env.TSV_FILE ??
  '/Users/youdo/Downloads/candidaturas_freelancers.xlsx - Candidaturas.tsv';

// Only import applications for events on or after this date (YYYY-MM-DD, BRT)
const CUTOFF_DATE = '2026-07-12';

// ---------------------------------------------------------------------------
// TSV parser
// ---------------------------------------------------------------------------
interface CandidaturaRow {
  freelancer_id: string;
  freelancer_nome: string;
  freelancer_email: string;
  freelancer_telefone: string;
  event_id: string;
  evento: string;
  cliente: string;
  data_evento: string; // DD/MM/YYYY
  servico: string;
  max_employers: string;
  status_candidatura: string;
  candidatura_em: string; // DD/MM/YYYY HH:mm
}

function parseTSV(content: string): CandidaturaRow[] {
  const lines = content.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split('\t').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split('\t').map(v => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row as unknown as CandidaturaRow;
  });
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Parse "DD/MM/YYYY" → Date at midnight BRT (UTC-3) */
function parseDateBRT(ddmmyyyy: string): Date {
  const [d, m, y] = ddmmyyyy.split('/').map(Number);
  // midnight BRT = 03:00 UTC
  return new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
}

/** Parse "DD/MM/YYYY HH:mm" → Date in BRT (UTC-3) */
function parseDateTimeBRT(ddmmyyyyHHmm: string): Date {
  const [datePart, timePart = '00:00'] = ddmmyyyyHHmm.split(' ');
  const [d, m, y] = datePart.split('/').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  // BRT = UTC-3, so add 3 hours to get UTC
  return new Date(Date.UTC(y, m - 1, d, hh + 3, mm, 0));
}

/** Day range [00:00, 23:59:59] in UTC for a BRT date string "DD/MM/YYYY" */
function dayRangeBRT(ddmmyyyy: string): { gte: Date; lte: Date } {
  const [d, m, y] = ddmmyyyy.split('/').map(Number);
  // BRT midnight = UTC 03:00; BRT 23:59 = UTC next day 02:59
  return {
    gte: new Date(Date.UTC(y, m - 1, d, 3, 0, 0)),
    lte: new Date(Date.UTC(y, m - 1, d + 1, 2, 59, 59, 999)),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== Import Candidaturas Legadas ===\n');

  const content = fs.readFileSync(TSV_FILE, 'utf-8');
  const allRows = parseTSV(content);
  console.log(`Lidas: ${allRows.length} linhas`);

  // -------------------------------------------------------------------------
  // 1. Filter: only future events (data_evento >= CUTOFF_DATE)
  // -------------------------------------------------------------------------
  const cutoff = new Date(`${CUTOFF_DATE}T03:00:00.000Z`); // midnight BRT
  const rows = allRows.filter(r => parseDateBRT(r.data_evento) >= cutoff);
  const discarded = allRows.length - rows.length;
  console.log(`Descartadas (eventos passados): ${discarded}`);
  console.log(`Candidaturas a processar: ${rows.length}\n`);

  if (rows.length === 0) {
    console.log('Nada a importar.');
    return;
  }

  // -------------------------------------------------------------------------
  // 2. Resolve freelancers (find or create)
  // -------------------------------------------------------------------------
  console.log('── Resolvendo freelancers...');

  const uniqueByEmail = new Map<string, { nome: string; telefone: string }>();
  for (const r of rows) {
    const email = r.freelancer_email.toLowerCase().trim();
    if (email && !uniqueByEmail.has(email)) {
      uniqueByEmail.set(email, { nome: r.freelancer_nome.trim(), telefone: r.freelancer_telefone.trim() });
    }
  }

  const freelancerMap = new Map<string, string>(); // email → new UUID
  let freelancerCreated = 0;

  for (const [email, info] of uniqueByEmail) {
    let fl = await prisma.freelancer.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    if (!fl) {
      fl = await prisma.freelancer.create({
        data: {
          name: info.nome,
          email,
          cpf: `IMPORT_${email}`,
          phone: info.telefone || null,
          status: FreelancerStatus.active,
        },
      });
      console.log(`  CRIADO   ${info.nome} (${email})`);
      freelancerCreated++;
    }
    freelancerMap.set(email, fl.id);
  }

  console.log(`  → ${freelancerMap.size} freelancers resolvidos (${freelancerCreated} criados)\n`);

  // -------------------------------------------------------------------------
  // 3. Resolve events (match by clientName + date, fallback name + date)
  // -------------------------------------------------------------------------
  console.log('── Resolvendo eventos...');

  const uniqueOldEvents = new Map<string, { cliente: string; evento: string; data: string }>();
  for (const r of rows) {
    if (!uniqueOldEvents.has(r.event_id)) {
      uniqueOldEvents.set(r.event_id, { cliente: r.cliente.trim(), evento: r.evento.trim(), data: r.data_evento.trim() });
    }
  }

  const eventMap = new Map<string, string | null>(); // oldId → new UUID (null = not found/ambiguous)
  const notFoundEvents: string[] = [];

  for (const [oldId, info] of uniqueOldEvents) {
    const range = dayRangeBRT(info.data);

    // Try clientName match first
    let matches = await prisma.event.findMany({
      where: {
        clientName: { contains: info.cliente, mode: 'insensitive' },
        startAt: range,
      },
      select: { id: true, name: true, clientName: true },
    });

    // Fallback: event name match
    if (matches.length === 0 && info.evento && info.evento.toLowerCase() !== 'a definir') {
      matches = await prisma.event.findMany({
        where: {
          name: { contains: info.evento, mode: 'insensitive' },
          startAt: range,
        },
        select: { id: true, name: true, clientName: true },
      });
    }

    if (matches.length === 0) {
      notFoundEvents.push(`NOT FOUND  old#${oldId}: "${info.evento}" | ${info.cliente} | ${info.data}`);
      eventMap.set(oldId, null);
    } else if (matches.length > 1) {
      notFoundEvents.push(`AMBIGUOUS  old#${oldId}: "${info.evento}" | ${info.cliente} | ${info.data} (${matches.length} matches)`);
      eventMap.set(oldId, null);
    } else {
      eventMap.set(oldId, matches[0].id);
    }
  }

  const eventFound = [...eventMap.values()].filter(v => v !== null).length;
  console.log(`  → ${eventFound}/${uniqueOldEvents.size} eventos encontrados\n`);

  // -------------------------------------------------------------------------
  // 4. Create FreelancerApplication records
  // -------------------------------------------------------------------------
  console.log('── Criando candidaturas...');

  let appCreated = 0;
  let appSkippedNoEvent = 0;
  let appSkippedNoFreelancer = 0;
  let appSkippedDuplicate = 0;

  for (const r of rows) {
    const email = r.freelancer_email.toLowerCase().trim();
    const freelancerId = freelancerMap.get(email);
    if (!freelancerId) {
      appSkippedNoFreelancer++;
      continue;
    }

    const eventId = eventMap.get(r.event_id);
    if (!eventId) {
      appSkippedNoEvent++;
      continue;
    }

    const role = r.servico.trim();

    const existing = await prisma.freelancerApplication.findFirst({
      where: { freelancerId, eventId, role },
    });
    if (existing) {
      appSkippedDuplicate++;
      continue;
    }

    const status: ApplicationStatus =
      r.status_candidatura === 'Aceita' ? ApplicationStatus.approved : ApplicationStatus.pending;

    const appliedAt = r.candidatura_em ? parseDateTimeBRT(r.candidatura_em) : new Date();

    await prisma.freelancerApplication.create({
      data: { freelancerId, eventId, role, status, appliedAt },
    });
    appCreated++;
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n=== Resumo ===');
  console.log(`Eventos passados descartados : ${discarded}`);
  console.log(`Freelancers criados           : ${freelancerCreated}`);
  console.log(`Candidaturas criadas          : ${appCreated}`);
  console.log(`Puladas (evento não encontrado): ${appSkippedNoEvent}`);
  console.log(`Puladas (freelancer sem email) : ${appSkippedNoFreelancer}`);
  console.log(`Puladas (duplicata)            : ${appSkippedDuplicate}`);

  if (notFoundEvents.length > 0) {
    console.log('\nEventos não encontrados / ambíguos:');
    notFoundEvents.forEach(e => console.log(`  • ${e}`));
  }

  const total = await prisma.freelancerApplication.count();
  console.log(`\nTotal FreelancerApplication no DB: ${total}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
