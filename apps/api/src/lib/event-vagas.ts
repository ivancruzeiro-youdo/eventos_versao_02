// Cancelamento de evento → cancelamento das vagas (EventService) e das candidaturas
// (FreelancerApplication). Antes, cancelar o evento só trocava Event.status: as vagas seguiam
// "active" e os freelancers seguiam "approved", o que bloqueava turnos reais deles por conflito
// de horário com um evento que não existe mais (caso INVASIVE 08/12/2026).
//
// NADA É APAGADO. Cada cancelamento grava um retrato no AuditLog (action = event_vagas_cancelled,
// entityId = id do evento) com os ids das vagas e das candidaturas e o status que tinham — é
// com ele que restoreEventVagas devolve as vagas e, se o operador quiser, reaprova as MESMAS
// pessoas. Recebe o cliente do banco por parâmetro (mesmo padrão de lib/pendencies.ts) pra poder
// rodar em script sem subir o servidor; por isso o que depende do servidor (Acessos) entra por
// import dinâmico só quando precisa.
import { randomUUID } from 'node:crypto';

export const VAGAS_CANCELLED_ACTION = 'event_vagas_cancelled';
export const VAGAS_RESTORED_ACTION = 'event_vagas_restored';
const CONTACT_LINK = 'https://wa.me/5541995450085';
const TZ = 'America/Sao_Paulo';

const fmtDate = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const firstName = (n: string) => (n || '').trim().split(/\s+/)[0] || 'tudo bem';

export interface CancelVagasResult {
  skipped?: string;
  services: number;
  applications: number;
  notified: number;
  failed: number;
  noPhone: number;
  acessosRevoked: number;
}

const emptyResult = (skipped?: string): CancelVagasResult => ({ skipped, services: 0, applications: 0, notified: 0, failed: 0, noPhone: 0, acessosRevoked: 0 });

/** Cancela as vagas ativas e as candidaturas pendentes/aprovadas de um evento CANCELADO.
 *  Idempotente: sem nada ativo, não faz nada (e não manda mensagem). `notify` avisa por WhatsApp
 *  cada freelancer que estava aprovado — só se o evento ainda não aconteceu. */
export async function cancelEventVagas(
  db: any,
  eventId: string,
  opts: { notify: boolean; userId?: string | null; reason?: string; now?: Date; acessos?: boolean } = { notify: false },
): Promise<CancelVagasResult> {
  const now = opts.now ?? new Date();
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true, name: true, status: true, startAt: true } });
  if (!event) return emptyResult('evento não encontrado');
  if (event.status !== 'cancelled') return emptyResult('evento não está cancelado');

  const [services, apps] = await Promise.all([
    db.eventService.findMany({ where: { eventId, status: 'active' }, select: { id: true, status: true, maxSlots: true, serviceId: true, service: { select: { name: true } } } }),
    db.freelancerApplication.findMany({
      where: { eventId, status: { in: ['pending', 'approved'] } },
      select: { id: true, status: true, role: true, freelancerId: true, freelancer: { select: { name: true, phone: true } } },
    }),
  ]);
  if (services.length === 0 && apps.length === 0) return emptyResult('nada ativo');

  const logId = randomUUID();
  await db.$transaction([
    ...(services.length ? [db.eventService.updateMany({ where: { id: { in: services.map((s: any) => s.id) } }, data: { status: 'cancelled' } })] : []),
    ...(apps.length ? [db.freelancerApplication.updateMany({ where: { id: { in: apps.map((a: any) => a.id) } }, data: { status: 'cancelled' } })] : []),
    db.auditLog.create({
      data: {
        id: logId,
        userId: opts.userId || null,
        action: VAGAS_CANCELLED_ACTION,
        entityType: 'Event',
        entityId: eventId,
        before: {
          services: services.map((s: any) => ({ id: s.id, status: s.status, maxSlots: s.maxSlots, role: s.service.name })),
          applications: apps.map((a: any) => ({ id: a.id, status: a.status, role: a.role, freelancerId: a.freelancerId, freelancerName: a.freelancer?.name ?? null })),
        },
        after: { reason: opts.reason ?? 'evento cancelado', notify: opts.notify },
      },
    }),
  ]);

  const res: CancelVagasResult = { ...emptyResult(), services: services.length, applications: apps.length };

  // Acesso físico (Acessos): quem já tinha a portaria liberada por esta candidatura perde, e o
  // que sobrar de outros compromissos é reenviado (cada envio SUBSTITUI a lista da pessoa).
  try {
    const granted = opts.acessos === false ? [] : await db.acessoLog.findMany({
      where: { applicationId: { in: apps.map((a: any) => a.id) }, status: 'granted', acessoExternoId: { not: null } },
      select: { applicationId: true, freelancerId: true },
    });
    if (granted.length > 0) {
      const { revokeApplicationAcesso, syncFreelancerAcesso } = await import('./acesso-sync.js');
      for (const g of granted as { applicationId: string; freelancerId: string }[]) { await revokeApplicationAcesso(g.applicationId); res.acessosRevoked++; }
      const freelancerIds: string[] = [...new Set<string>(granted.map((g: any) => g.freelancerId as string))];
      for (const fid of freelancerIds) await syncFreelancerAcesso(fid, null).catch(() => undefined);
    }
  } catch (err: any) {
    console.error(`[event-vagas] falha ao revogar acessos do evento ${eventId}:`, err.message);
  }

  // Aviso por WhatsApp: uma mensagem por pessoa (juntando os cargos), só pra quem estava aprovado
  // e só se o evento ainda não passou.
  const upcoming = !event.startAt || new Date(event.startAt) > now;
  if (opts.notify && upcoming) {
    const { normalizePhone, sendWhatsAppAlert } = await import('./notifications.js');
    const byPerson = new Map<string, { name: string; phone: string | null; roles: string[] }>();
    for (const a of apps.filter((x: any) => x.status === 'approved')) {
      const p = byPerson.get(a.freelancerId) ?? { name: a.freelancer?.name ?? '', phone: a.freelancer?.phone ? normalizePhone(a.freelancer.phone) : null, roles: [] as string[] };
      if (!p.roles.includes(a.role)) p.roles.push(a.role);
      byPerson.set(a.freelancerId, p);
    }
    const when = event.startAt ? ` (${fmtDate(new Date(event.startAt))})` : '';
    for (const p of byPerson.values()) {
      if (!p.phone) { res.noPhone++; continue; }
      const ok = await sendWhatsAppAlert(p.phone, {
        titulo: '❌ Evento cancelado — sua vaga foi cancelada',
        detalhe: `Olá ${firstName(p.name)}! O evento ${event.name}${when} foi cancelado, então sua vaga como ${p.roles.join(' / ')} nele também foi cancelada. Você NÃO precisa comparecer e não há pagamento por esse turno. Pedimos desculpas pelo transtorno.`,
        acao: `Dúvidas? Fale com a gente: ${CONTACT_LINK}`,
      });
      if (ok) res.notified++; else res.failed++;
    }
  }
  await db.auditLog.update({
    where: { id: logId },
    data: { after: { reason: opts.reason ?? 'evento cancelado', notify: opts.notify && upcoming, notified: res.notified, failed: res.failed, noPhone: res.noPhone, acessosRevoked: res.acessosRevoked } },
  }).catch(() => undefined);
  return res;
}

/** Rede de segurança: acha eventos cancelados (que ainda não passaram há mais de 1 dia) com vaga
 *  ativa ou candidatura viva — cancelamento feito por qualquer caminho que não chamou
 *  cancelEventVagas (SQL manual, sync, código futuro) — e cancela. */
export async function sweepCancelledEvents(db: any, opts: { notify: boolean; acessos?: boolean; log?: (m: string) => void } = { notify: true }) {
  const since = new Date(Date.now() - 24 * 3_600_000);
  const events = await db.event.findMany({
    where: {
      status: 'cancelled',
      OR: [{ startAt: null }, { startAt: { gte: since } }],
      AND: [{ OR: [{ services: { some: { status: 'active' } } }, { applications: { some: { status: { in: ['pending', 'approved'] } } } }] }],
    },
    select: { id: true, name: true },
  });
  let services = 0, applications = 0, notified = 0;
  for (const ev of events) {
    const r = await cancelEventVagas(db, ev.id, { notify: opts.notify, acessos: opts.acessos, reason: 'varredura: evento cancelado com vagas ativas' });
    services += r.services; applications += r.applications; notified += r.notified;
    if (r.services || r.applications) opts.log?.(`event-vagas: ${ev.name} — ${r.services} vaga(s) e ${r.applications} candidatura(s) canceladas, ${r.notified} avisados`);
  }
  return { events: events.length, services, applications, notified };
}

export interface RestoreVagasResult {
  error?: string; status?: number;
  reactivatedServices: number;
  reassigned: { freelancerId: string; name: string; role: string }[];
  skipped: { name: string; role: string; reason: string }[];
  notified: number;
}

/** Desfaz cancelEventVagas usando o retrato mais recente: reabre as vagas e, com `reassign`,
 *  reaprova as mesmas pessoas (se ainda houver vaga livre, o freelancer não estiver suspenso e
 *  não houver conflito de horário — `checkConflict` é injetado pela rota). O evento precisa já
 *  ter saído de "cancelled". */
export async function restoreEventVagas(
  db: any,
  eventId: string,
  opts: {
    reassign: boolean; notify?: boolean; userId?: string | null;
    checkConflict?: (freelancerId: string, start: Date, end: Date, excludeApplicationId?: string) => Promise<{ role: string; eventName: string } | null>;
  },
): Promise<RestoreVagasResult> {
  const empty: RestoreVagasResult = { reactivatedServices: 0, reassigned: [], skipped: [], notified: 0 };
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true, name: true, status: true, startAt: true } });
  if (!event) return { ...empty, error: 'Evento não encontrado.', status: 404 };
  if (event.status === 'cancelled') return { ...empty, error: 'O evento ainda está cancelado — reabra o evento antes de recuperar as vagas.', status: 409 };

  const cancelLog = await db.auditLog.findFirst({ where: { action: VAGAS_CANCELLED_ACTION, entityId: eventId }, orderBy: { createdAt: 'desc' } });
  if (!cancelLog) return { ...empty, error: 'Este evento não tem histórico de vagas canceladas.', status: 404 };
  const done = await db.auditLog.findFirst({ where: { action: VAGAS_RESTORED_ACTION, entityId: eventId, after: { path: ['cancelLogId'], equals: cancelLog.id } }, select: { id: true } });
  if (done) return { ...empty, error: 'As vagas deste cancelamento já foram recuperadas.', status: 409 };

  const snap = cancelLog.before as { services: any[]; applications: any[] };
  const serviceIds = snap.services.map(s => s.id);
  const reopened = serviceIds.length
    ? await db.eventService.updateMany({ where: { id: { in: serviceIds }, status: 'cancelled' }, data: { status: 'active' } })
    : { count: 0 };
  const res: RestoreVagasResult = { ...empty, reactivatedServices: reopened.count };

  if (opts.reassign) {
    const slots = await db.eventService.findMany({ where: { eventId, status: 'active' }, select: { maxSlots: true, startAt: true, endAt: true, service: { select: { name: true } } } });
    for (const a of snap.applications) {
      const label = { name: a.freelancerName ?? '—', role: a.role };
      const current = await db.freelancerApplication.findUnique({ where: { id: a.id }, include: { freelancer: { select: { status: true, name: true, phone: true } } } });
      if (!current) { res.skipped.push({ ...label, reason: 'candidatura não existe mais' }); continue; }
      if (current.status !== 'cancelled') { res.skipped.push({ ...label, reason: `já está "${current.status}"` }); continue; }
      if (current.freelancer?.status === 'suspended') { res.skipped.push({ ...label, reason: 'freelancer suspenso' }); continue; }
      const roleSlots = slots.filter((s: any) => s.service.name === a.role);
      if (roleSlots.length === 0) { res.skipped.push({ ...label, reason: 'a vaga desse cargo não existe mais no evento' }); continue; }
      const capacity = roleSlots.reduce((n: number, s: any) => n + s.maxSlots, 0);
      const approved = await db.freelancerApplication.count({ where: { eventId, role: a.role, status: 'approved' } });
      if (approved >= capacity) { res.skipped.push({ ...label, reason: 'vaga já preenchida por outra pessoa' }); continue; }
      const slot = roleSlots[0];
      if (opts.checkConflict && slot.startAt && slot.endAt) {
        const c = await opts.checkConflict(a.freelancerId, slot.startAt, slot.endAt, a.id);
        if (c) { res.skipped.push({ ...label, reason: `conflito de horário com "${c.role}" em "${c.eventName}"` }); continue; }
      }
      await db.freelancerApplication.update({ where: { id: a.id }, data: { status: a.status === 'pending' ? 'pending' : 'approved' } });
      res.reassigned.push({ freelancerId: a.freelancerId, name: label.name, role: a.role });

      if (opts.notify !== false && (!event.startAt || new Date(event.startAt) > new Date()) && current.freelancer?.phone) {
        const { normalizePhone, sendWhatsAppAlert } = await import('./notifications.js');
        const phone = normalizePhone(current.freelancer.phone);
        if (phone) {
          const when = event.startAt ? ` (${fmtDate(new Date(event.startAt))})` : '';
          const ok = await sendWhatsAppAlert(phone, {
            titulo: '✅ Evento mantido — sua vaga foi restabelecida',
            detalhe: `Olá ${firstName(label.name)}! O evento ${event.name}${when} voltou a acontecer e sua vaga como ${a.role} foi restabelecida. Confira os detalhes no portal de vagas.`,
            acao: `Se NÃO puder comparecer, avise: ${CONTACT_LINK}`,
          });
          if (ok) res.notified++;
        }
      }
    }
  }

  await db.auditLog.create({
    data: {
      userId: opts.userId || null, action: VAGAS_RESTORED_ACTION, entityType: 'Event', entityId: eventId,
      after: { cancelLogId: cancelLog.id, reassign: opts.reassign, reactivatedServices: res.reactivatedServices, reassigned: res.reassigned.length, skipped: res.skipped },
    },
  });
  return res;
}
