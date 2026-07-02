/**
 * Import data from the legacy YouDo system into the new database.
 *
 * What is imported:
 *   1. FreelancerService  (servicos.csv)
 *   2. Freelancer          (taxas.csv)
 *   3. FreelancerServiceLink (taxas_habilitadas.csv — status=1 only)
 *   4. ChecklistTemplate + ChecklistTemplateItem (youdo_export.json)
 *   5. EventService        (servicos_eventos.csv — matched by event name+date)
 *   6. FreelancerApplication (vagas_preenchidas.csv — accept=1 only)
 *
 * Run:
 *   cd packages/db && DATABASE_URL="..." tsx prisma/import-legacy.ts
 */

import { PrismaClient, FreelancerStatus, ApplicationStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient({ log: ['warn', 'error'] });

const EXPORT_DIR = process.env.EXPORT_DIR ?? '/Users/youdo/Downloads/export_youdo_20260702_135531';

// ---------------------------------------------------------------------------
// CSV parser — handles semicolon separator and quoted fields
// ---------------------------------------------------------------------------
function parseCSV(content: string): Record<string, string>[] {
  const lines = content.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] ?? '').trim();
    });
    return row;
  });
}

function parseLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ';' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function padCPF(cpf: string): string {
  return cpf.replace(/\D/g, '').padStart(11, '0');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== YouDo Legacy Import ===\n');

  const serviceIdMap: Record<string, string> = {}; // old int id -> new UUID
  const freelancerIdMap: Record<string, string> = {}; // old int id -> new UUID

  // -------------------------------------------------------------------------
  // 1. FreelancerService
  // -------------------------------------------------------------------------
  console.log('── 1. Importing services (serviços)...');
  const servicos = parseCSV(fs.readFileSync(path.join(EXPORT_DIR, 'servicos.csv'), 'utf-8'));

  for (const s of servicos) {
    // Import all services regardless of status so we have the full catalog.
    // Inactive ones just won't have any links.
    const existing = await prisma.freelancerService.findFirst({
      where: { name: s.name },
    });

    let svc;
    if (existing) {
      svc = await prisma.freelancerService.update({
        where: { id: existing.id },
        data: {
          description: s.description || existing.description,
          hourlyRate: parseFloat(s.value_per_hour) || existing.hourlyRate,
        },
      });
      console.log(`  UPDATED  ${s.name}`);
    } else {
      svc = await prisma.freelancerService.create({
        data: {
          name: s.name,
          description: s.description || null,
          hourlyRate: parseFloat(s.value_per_hour) || 0,
        },
      });
      console.log(`  CREATED  ${s.name}`);
    }

    serviceIdMap[s.id] = svc.id;
  }

  console.log(`  → ${Object.keys(serviceIdMap).length} services mapped\n`);

  // -------------------------------------------------------------------------
  // 2. Freelancers (taxas)
  // -------------------------------------------------------------------------
  console.log('── 2. Importing freelancers (taxas)...');
  const taxas = parseCSV(fs.readFileSync(path.join(EXPORT_DIR, 'taxas.csv'), 'utf-8'));

  let freelancerCreated = 0;
  let freelancerUpdated = 0;
  let freelancerError = 0;

  for (const t of taxas) {
    const cpf = padCPF(t.cpf);
    const status: FreelancerStatus = t.status === '1' ? 'active' : 'suspended';

    try {
      const existing = await prisma.freelancer.findFirst({
        where: { OR: [{ cpf }, { email: t.email }] },
      });

      let freelancer;
      if (existing) {
        freelancer = await prisma.freelancer.update({
          where: { id: existing.id },
          data: {
            name: t.name,
            cpf, // normalize CPF
            phone: t.phone || existing.phone,
            birthDate: t.birth_date ? new Date(t.birth_date) : existing.birthDate,
            status,
          },
        });
        freelancerUpdated++;
      } else {
        freelancer = await prisma.freelancer.create({
          data: {
            name: t.name,
            email: t.email,
            cpf,
            phone: t.phone || null,
            birthDate: t.birth_date ? new Date(t.birth_date) : null,
            status,
          },
        });
        freelancerCreated++;
      }

      freelancerIdMap[t.id] = freelancer.id;
    } catch (err) {
      console.error(`  ERROR  ${t.name} (${t.email}): ${err instanceof Error ? err.message : err}`);
      freelancerError++;
    }
  }

  console.log(`  → ${freelancerCreated} created, ${freelancerUpdated} updated, ${freelancerError} errors\n`);

  // -------------------------------------------------------------------------
  // 3. FreelancerServiceLink (taxas_habilitadas)
  // -------------------------------------------------------------------------
  console.log('── 3. Importing service links (taxas habilitadas)...');
  const taxasHab = parseCSV(
    fs.readFileSync(path.join(EXPORT_DIR, 'taxas_habilitadas.csv'), 'utf-8'),
  );

  let linked = 0;
  let linkSkipped = 0;

  for (const th of taxasHab) {
    if (th.status === '0') {
      linkSkipped++;
      continue;
    }

    const freelancerId = freelancerIdMap[th.employer_id];
    const serviceId = serviceIdMap[th.service_id];

    if (!freelancerId || !serviceId) {
      linkSkipped++;
      continue;
    }

    try {
      await prisma.freelancerServiceLink.upsert({
        where: { freelancerId_serviceId: { freelancerId, serviceId } },
        create: { freelancerId, serviceId },
        update: {},
      });
      linked++;
    } catch {
      linkSkipped++;
    }
  }

  console.log(`  → ${linked} links created/existing, ${linkSkipped} skipped\n`);

  // -------------------------------------------------------------------------
  // 4. ChecklistTemplate + ChecklistTemplateItem
  // -------------------------------------------------------------------------
  console.log('── 4. Importing checklist templates...');
  const exportJson = JSON.parse(
    fs.readFileSync(path.join(EXPORT_DIR, 'youdo_export.json'), 'utf-8'),
  );

  let tmplCreated = 0;
  let tmplSkipped = 0;

  for (const tmpl of exportJson.checklist_templates) {
    // Skip test templates
    if (tmpl.template_name === 'TESTE') {
      tmplSkipped++;
      continue;
    }

    const existing = await prisma.checklistTemplate.findFirst({
      where: { title: tmpl.template_name },
    });

    if (existing) {
      console.log(`  EXISTS   "${tmpl.template_name}"`);
      tmplSkipped++;
      continue;
    }

    const template = await prisma.checklistTemplate.create({
      data: { title: tmpl.template_name },
    });

    for (const item of tmpl.items) {
      await prisma.checklistTemplateItem.create({
        data: {
          templateId: template.id,
          text: item.description,
          order: item.order,
        },
      });
    }

    console.log(`  CREATED  "${tmpl.template_name}" (${tmpl.items.length} itens)`);
    tmplCreated++;
  }

  console.log(`  → ${tmplCreated} templates created, ${tmplSkipped} skipped\n`);

  // -------------------------------------------------------------------------
  // 5. EventService + 6. FreelancerApplication (vagas preenchidas)
  // -------------------------------------------------------------------------
  console.log('── 5. Importing event services and assignments...');
  const servicosEventos = parseCSV(
    fs.readFileSync(path.join(EXPORT_DIR, 'servicos_eventos.csv'), 'utf-8'),
  );
  const vagasPreenchidas = parseCSV(
    fs.readFileSync(path.join(EXPORT_DIR, 'vagas_preenchidas.csv'), 'utf-8'),
  );

  // Build lookup: old event_service_id -> accepted vagas
  const vagasMap: Record<string, typeof vagasPreenchidas> = {};
  for (const v of vagasPreenchidas) {
    if (!vagasMap[v.id_event_service]) vagasMap[v.id_event_service] = [];
    vagasMap[v.id_event_service].push(v);
  }

  let esCreated = 0;
  let esSkipped = 0;
  let appCreated = 0;

  const notFoundEvents = new Set<string>();

  for (const se of servicosEventos) {
    if (se.status === '0') {
      esSkipped++;
      continue;
    }

    const serviceId = serviceIdMap[se.service_id];
    if (!serviceId) {
      esSkipped++;
      continue;
    }

    // Try to find event by name + date
    const dateStr = se.event_date; // YYYY-MM-DD
    const dateStart = new Date(`${dateStr}T00:00:00.000Z`);
    const dateEnd = new Date(`${dateStr}T23:59:59.999Z`);

    const matchedEvents = await prisma.event.findMany({
      where: {
        name: { contains: se.event_name.replace(/['"]/g, '').trim(), mode: 'insensitive' },
        startAt: { gte: dateStart, lte: dateEnd },
      },
    });

    if (matchedEvents.length === 0) {
      notFoundEvents.add(`${se.event_name} (${dateStr})`);
      esSkipped++;
      continue;
    }

    // If ambiguous (e.g. "A DEFINIR"), skip to avoid wrong assignment
    if (matchedEvents.length > 1) {
      notFoundEvents.add(`AMBIGUOUS: ${se.event_name} (${dateStr}) — ${matchedEvents.length} matches`);
      esSkipped++;
      continue;
    }

    const event = matchedEvents[0];
    const startAt = se.start_time ? new Date(se.start_time) : null;
    const endAt = se.end_time ? new Date(se.end_time) : null;

    // Avoid duplicate EventService for same event+service+startTime
    const existingES = await prisma.eventService.findFirst({
      where: {
        eventId: event.id,
        serviceId,
        ...(startAt ? { startAt } : {}),
      },
    });

    const eventService = existingES ?? await prisma.eventService.create({
      data: {
        eventId: event.id,
        serviceId,
        valuePerHour: parseFloat(se.value_per_hour) || 0,
        maxSlots: parseInt(se.max_employers) || 1,
        startAt,
        endAt,
        status: 'active',
      },
    });

    if (!existingES) esCreated++;

    // Import approved assignments
    const vagas = vagasMap[se.id_event_service] ?? [];
    const svcRecord = await prisma.freelancerService.findUnique({ where: { id: serviceId } });

    for (const v of vagas) {
      if (v.accept !== '1') continue;

      const freelancerId = freelancerIdMap[v.employer_id];
      if (!freelancerId) continue;

      const role = svcRecord?.name ?? se.service_name;

      const existingApp = await prisma.freelancerApplication.findFirst({
        where: { freelancerId, eventId: event.id, role },
      });

      if (!existingApp) {
        await prisma.freelancerApplication.create({
          data: {
            freelancerId,
            eventId: event.id,
            role,
            status: ApplicationStatus.approved,
          },
        });
        appCreated++;
      }
    }
  }

  if (notFoundEvents.size > 0) {
    console.log('\n  Events not found in DB (skipped):');
    [...notFoundEvents].forEach(e => console.log(`    • ${e}`));
  }

  console.log(`\n  → Event services: ${esCreated} created, ${esSkipped} skipped`);
  console.log(`  → Applications:   ${appCreated} created`);

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n=== Import complete ===');
  const counts = await Promise.all([
    prisma.freelancerService.count(),
    prisma.freelancer.count(),
    prisma.freelancerServiceLink.count(),
    prisma.checklistTemplate.count(),
    prisma.eventService.count(),
    prisma.freelancerApplication.count(),
  ]);
  console.log(`FreelancerService:     ${counts[0]}`);
  console.log(`Freelancer:            ${counts[1]}`);
  console.log(`FreelancerServiceLink: ${counts[2]}`);
  console.log(`ChecklistTemplate:     ${counts[3]}`);
  console.log(`EventService:          ${counts[4]}`);
  console.log(`FreelancerApplication: ${counts[5]}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
