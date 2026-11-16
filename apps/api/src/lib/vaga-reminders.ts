import { normalizePhone, sendWhatsAppAlert } from './notifications.js';

// Lembrete de vaga: ~12h antes do início do turno, WhatsApp (Avisos Oficial) pra cada freelancer
// APROVADO naquela vaga, lembrando do compromisso e pedindo pra avisar se não puder comparecer.
// Idempotência: cada (candidatura + horário de início) é registrada no AuditLog ANTES de enviar —
// reinício da API ou nova checagem nunca repete; se o horário da vaga mudar, vale um lembrete novo.
export const REMINDER_HOURS = 12;
export const MIN_LEAD_MINUTES = 30;             // vaga que começa em < 30 min não recebe mais "lembrete"
export const CONTACT_LINK = 'https://wa.me/5541995450085';
export const REMINDER_ACTION = 'vaga_reminder_12h';
const TZ = 'America/Sao_Paulo';

const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const fmtTime = (d: Date) => d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const fmtDate = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' });

function whenLabel(start: Date, now: Date): string {
  const diff = (new Date(`${dayKey(start)}T12:00:00Z`).getTime() - new Date(`${dayKey(now)}T12:00:00Z`).getTime()) / 86400000;
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  return `em ${fmtDate(start)}`;
}

export interface ReminderResult { candidates: number; sent: number; failed: number; noPhone: number; skippedAlready: number; lines: string[] }

export async function runVagaReminders(db: any, opts: { dryRun?: boolean; now?: Date; log?: (m: string) => void } = {}): Promise<ReminderResult> {
  const now = opts.now ?? new Date();
  const res: ReminderResult = { candidates: 0, sent: 0, failed: 0, noPhone: 0, skippedAlready: 0, lines: [] };
  const say = (m: string) => { res.lines.push(m); opts.log?.(m); };

  const from = new Date(now.getTime() + MIN_LEAD_MINUTES * 60_000);
  const to = new Date(now.getTime() + REMINDER_HOURS * 3_600_000);
  const slots = await db.eventService.findMany({
    where: {
      status: 'active',
      startAt: { gt: from, lte: to },
      event: { status: { notIn: ['cancelled', 'encerrado'] } },
    },
    include: {
      service: { select: { name: true } },
      event: { select: { id: true, name: true, venues: { select: { venue: { select: { name: true } } } } } },
    },
    orderBy: { startAt: 'asc' },
  });

  for (const slot of slots) {
    const apps = await db.freelancerApplication.findMany({
      where: { eventId: slot.eventId, role: slot.service.name, status: 'approved' },
      include: { freelancer: { select: { name: true, phone: true } } },
    });
    for (const app of apps) {
      res.candidates++;
      const key = `${app.id}:${new Date(slot.startAt).toISOString()}`;
      const already = await db.auditLog.findFirst({ where: { action: REMINDER_ACTION, entityId: key }, select: { id: true } });
      if (already) { res.skippedAlready++; continue; }

      const phone = app.freelancer?.phone ? normalizePhone(app.freelancer.phone) : null;
      const start = new Date(slot.startAt);
      const end = slot.endAt ? new Date(slot.endAt) : null;
      const venues = [...new Set((slot.event.venues ?? []).map((v: any) => v.venue?.name).filter(Boolean))].join(' · ');
      const label = `${app.freelancer.name} — ${slot.service.name} — ${slot.event.name} (${whenLabel(start, now)} ${fmtTime(start)})`;

      if (opts.dryRun) { say(`[simulação] ${label}${phone ? '' : ' | SEM TELEFONE'}`); if (!phone) res.noPhone++; else res.sent++; continue; }

      // Reserva antes de enviar (inclusive sem telefone — não tenta de novo a cada checagem)
      await db.auditLog.create({ data: { action: REMINDER_ACTION, entityType: 'FreelancerApplication', entityId: key, after: { freelancer: app.freelancer.name, phone: phone ? 'ok' : 'sem telefone', startAt: start.toISOString() } } });
      if (!phone) { res.noPhone++; say(`sem telefone: ${label}`); continue; }

      const ok = await sendWhatsAppAlert(phone, {
        titulo: `⏰ Lembrete: você trabalha ${whenLabel(start, now)} às ${fmtTime(start)}`,
        detalhe: `Olá ${app.freelancer.name}! Você está confirmado(a) como ${slot.service.name} no evento ${slot.event.name}, ${whenLabel(start, now)} (${fmtDate(start)}) das ${fmtTime(start)}${end ? ` às ${fmtTime(end)}` : ''}${venues ? `, em ${venues}` : ''}. Se NÃO puder comparecer, avise o quanto antes para podermos substituir.`,
        acao: `Para avisar, fale com a gente: ${CONTACT_LINK}`,
      });
      if (ok) res.sent++; else res.failed++;
      say(`${ok ? 'enviado' : 'FALHA'}: ${label}`);
    }
  }
  return res;
}
