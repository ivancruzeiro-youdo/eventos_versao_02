/**
 * Update EventService start/end times from the new TSV that includes
 * servico_inicio and servico_fim columns.
 *
 * Run:
 *   cd packages/db
 *   DATABASE_URL="..." TSV_FILE="/path/to/candidaturas.tsv" npx tsx prisma/update-service-hours.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient({ log: ['warn', 'error'] });

const TSV_FILE =
  process.env.TSV_FILE ??
  '/Users/youdo/Downloads/candidaturas_freelancers.xlsx - Candidaturas (1).tsv';

const CUTOFF_DATE = '2026-07-12'; // só eventos a partir daqui

interface Row {
  freelancer_email: string;
  event_id: string;
  evento: string;
  cliente: string;
  data_evento: string;   // DD/MM/YYYY
  servico: string;
  servico_inicio: string; // DD/MM/YYYY HH:mm
  servico_fim: string;    // DD/MM/YYYY HH:mm
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

/** Parse "DD/MM/YYYY HH:mm" BRT → UTC Date */
function parseBRT(s: string): Date | null {
  if (!s || !s.trim()) return null;
  const [datePart, timePart = '00:00'] = s.trim().split(' ');
  const parts = datePart.split('/').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [d, m, y] = parts;
  const [hh, mm] = timePart.split(':').map(Number);
  if (isNaN(hh) || isNaN(mm)) return null;
  // BRT (UTC-3) → UTC: add 3h
  return new Date(Date.UTC(y, m - 1, d, hh + 3, mm, 0));
}

/** Day range in UTC for a "DD/MM/YYYY" BRT date */
function dayRangeBRT(ddmmyyyy: string): { gte: Date; lte: Date } {
  const [d, m, y] = ddmmyyyy.split('/').map(Number);
  return {
    gte: new Date(Date.UTC(y, m - 1, d, 3, 0, 0)),
    lte: new Date(Date.UTC(y, m - 1, d + 1, 2, 59, 59, 999)),
  };
}

/** Canonical service name — maps old names to new ones */
function canonicalService(name: string): string[] {
  const n = name.trim();
  // aliases → check both so we match whichever name is in DB
  const aliases: Record<string, string[]> = {
    'Limpeza':  ['Aux Limpeza', 'Limpeza'],
    'Gerente':  ['Gestão de evento', 'Gerente'],
  };
  return aliases[n] ?? [n];
}

async function main() {
  console.log('=== Atualizar horários de EventService ===\n');

  const content = fs.readFileSync(TSV_FILE, 'utf-8');
  const allRows = parseTSV(content);
  console.log(`Lidas: ${allRows.length} linhas`);

  const cutoff = new Date(`${CUTOFF_DATE}T03:00:00.000Z`);

  // Filter to future events and rows that have time data
  const rows = allRows.filter(r => {
    const [d, mo, y] = r.data_evento.split('/').map(Number);
    const dt = new Date(Date.UTC(y, mo - 1, d, 3, 0, 0));
    return dt >= cutoff && r.servico_inicio && r.servico_fim;
  });
  console.log(`Com data futura e horários: ${rows.length}`);

  // Deduplicate by (event_id_old, servico) — one update per slot type per event
  const seen = new Map<string, Row>();
  for (const r of rows) {
    const key = `${r.event_id}::${r.servico.trim()}`;
    if (!seen.has(key)) seen.set(key, r);
  }
  console.log(`Combinações únicas (evento × serviço): ${seen.size}\n`);

  // Cache event lookups to avoid repeated queries
  const eventCache = new Map<string, string | null>(); // oldId → new UUID

  let updated = 0;
  let skippedNoEvent = 0;
  let skippedNoSlot = 0;
  let skippedBadTime = 0;
  const problems: string[] = [];

  for (const [key, r] of seen) {
    const startAt = parseBRT(r.servico_inicio);
    const endAt   = parseBRT(r.servico_fim);

    if (!startAt || !endAt) {
      skippedBadTime++;
      problems.push(`HORA INVÁLIDA  "${r.servico}" | ${r.cliente} | ${r.data_evento} → inicio="${r.servico_inicio}" fim="${r.servico_fim}"`);
      continue;
    }

    // Resolve event
    if (!eventCache.has(r.event_id)) {
      const range = dayRangeBRT(r.data_evento);

      let matches = await prisma.event.findMany({
        where: { clientName: { contains: r.cliente.trim(), mode: 'insensitive' }, startAt: range },
        select: { id: true, name: true },
      });

      if (matches.length === 0 && r.evento && r.evento.toLowerCase() !== 'a definir') {
        matches = await prisma.event.findMany({
          where: { name: { contains: r.evento.trim(), mode: 'insensitive' }, startAt: range },
          select: { id: true, name: true },
        });
      }

      if (matches.length === 0) {
        problems.push(`NÃO ENCONTRADO  "${r.evento}" | ${r.cliente} | ${r.data_evento}`);
        eventCache.set(r.event_id, null);
      } else if (matches.length > 1) {
        problems.push(`AMBÍGUO  "${r.evento}" | ${r.cliente} | ${r.data_evento} (${matches.length} eventos)`);
        eventCache.set(r.event_id, null);
      } else {
        eventCache.set(r.event_id, matches[0].id);
      }
    }

    const eventId = eventCache.get(r.event_id);
    if (!eventId) {
      skippedNoEvent++;
      continue;
    }

    // Find matching EventService slot(s) by service name
    const nameVariants = canonicalService(r.servico);

    const slots = await (prisma as any).eventService.findMany({
      where: {
        eventId,
        service: { name: { in: nameVariants } },
      },
      include: { service: { select: { name: true } } },
    });

    if (slots.length === 0) {
      skippedNoSlot++;
      problems.push(`SEM SLOT  "${r.servico}" no evento "${r.evento}" | ${r.cliente} | ${r.data_evento}`);
      continue;
    }

    // Update all matching slots (usually 1, could be multiple seats for same role)
    for (const slot of slots) {
      await (prisma as any).eventService.update({
        where: { id: slot.id },
        data: { startAt, endAt },
      });
      const startBRT = `${String(startAt.getUTCHours() - 3 < 0 ? startAt.getUTCHours() + 21 : startAt.getUTCHours() - 3).padStart(2,'0')}:${String(startAt.getUTCMinutes()).padStart(2,'0')}`;
      const endBRT   = `${String(endAt.getUTCHours()   - 3 < 0 ? endAt.getUTCHours()   + 21 : endAt.getUTCHours()   - 3).padStart(2,'0')}:${String(endAt.getUTCMinutes()).padStart(2,'0')}`;
      console.log(`  ✓ ${slot.service.name.padEnd(22)} ${r.cliente.substring(0,30).padEnd(30)} ${r.data_evento}  ${startBRT}–${endBRT}`);
    }
    updated += slots.length;
  }

  console.log('\n=== Resumo ===');
  console.log(`Slots atualizados       : ${updated}`);
  console.log(`Evento não encontrado   : ${skippedNoEvent}`);
  console.log(`Slot não encontrado     : ${skippedNoSlot}`);
  console.log(`Hora inválida no TSV    : ${skippedBadTime}`);

  if (problems.length > 0) {
    console.log('\nProblemas:');
    problems.forEach(p => console.log(`  • ${p}`));
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
