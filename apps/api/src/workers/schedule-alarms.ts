import { prisma } from '../server.js';
import { normalizePhone, sendWhatsAppAlert } from '../lib/notifications.js';

// Dispara o alarme das atividades do cronograma (EventSchedule.alarmMinutesBefore): WhatsApp
// pra cada membro do time responsável, avisando o que deve acontecer naquele momento. Sem
// restrição de horário útil — eventos acontecem à noite e em fins de semana.
const CHECK_INTERVAL_MS = 60 * 1000;
const MAX_ALARM_MINUTES = 1440;
// Alarme atrasado (API fora do ar, p.ex.) ainda vale até este tempo depois do início; passado
// disso o aviso "vai começar" seria enganoso, então só é descartado.
const LATE_TOLERANCE_MS = 30 * 60 * 1000;
const TZ = 'America/Sao_Paulo';

function fmtDateTime(d: Date): string {
  return d.toLocaleString('pt-BR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function fmtTime(d: Date): string {
  return d.toLocaleString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}

function whenText(startAt: Date, now: Date): string {
  const mins = Math.round((startAt.getTime() - now.getTime()) / 60000);
  if (mins <= 0) return 'começa agora';
  if (mins < 60) return `começa em ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `começa em ${h}h${m ? `${String(m).padStart(2, '0')}` : ''}`;
}

async function checkScheduleAlarms(log: (msg: string) => void) {
  const now = new Date();

  const candidates = await (prisma as any).eventSchedule.findMany({
    where: {
      alarmMinutesBefore: { not: null },
      alarmSentAt: null,
      startAt: {
        gt: new Date(now.getTime() - LATE_TOLERANCE_MS),
        lte: new Date(now.getTime() + MAX_ALARM_MINUTES * 60 * 1000),
      },
    },
    include: {
      event: { select: { name: true } },
      team: { include: { members: { include: { user: { select: { name: true, phone: true } } } } } },
    },
    take: 100,
  });

  for (const sch of candidates) {
    const startAt = new Date(sch.startAt);
    const fireAt = startAt.getTime() - sch.alarmMinutesBefore * 60 * 1000;
    if (fireAt > now.getTime()) continue;

    // Reserva o disparo antes de enviar, pra uma segunda rodada nunca repetir o alarme.
    const claimed = await (prisma as any).eventSchedule.updateMany({
      where: { id: sch.id, alarmSentAt: null },
      data: { alarmSentAt: now },
    });
    if (claimed.count === 0) continue;

    const sent: string[] = [];
    const failed: string[] = [];
    const noPhone: string[] = [];

    for (const member of sch.team?.members ?? []) {
      const user = member.user;
      const phone = user?.phone ? normalizePhone(user.phone) : null;
      if (!phone) { noPhone.push(user?.name ?? '—'); continue; }

      const o = [sch.alarmMessage ? `O que fazer: ${sch.alarmMessage}` : null, sch.description ? `Detalhes: ${sch.description}` : null].filter(Boolean);
      const mensagem = {
        titulo: `⏰ Alarme: ${sch.name} ${whenText(startAt, now)}`,
        detalhe: `Olá ${user.name}! Evento: ${sch.event?.name ?? '—'} · Horário: ${fmtDateTime(startAt)}–${fmtTime(new Date(sch.endAt))}${sch.team?.name ? ` · Time: ${sch.team.name}` : ''}`,
        acao: o.length ? o.join(' · ') : 'Acesse https://eventos.youdobrasil.com.br para ver os detalhes.',
      };

      const ok = await sendWhatsAppAlert(phone, mensagem);
      (ok ? sent : failed).push(user.name);
    }

    const parts = [`Alarme disparado (${sch.alarmMinutesBefore === 0 ? 'na hora do início' : `${sch.alarmMinutesBefore} min antes`})`];
    parts.push(sent.length ? `enviado para: ${sent.join(', ')}` : 'ninguém recebeu');
    if (failed.length) parts.push(`falha no envio: ${failed.join(', ')}`);
    if (noPhone.length) parts.push(`sem telefone cadastrado: ${noPhone.join(', ')}`);
    if (!sch.team) parts.push('atividade sem time');

    await (prisma as any).eventComment.create({
      data: { eventId: sch.eventId, eventScheduleId: sch.id, userId: null, isSystem: true, content: parts.join(' · ') },
    });
    log(`Alarme: "${sch.name}" -> ${sent.length} enviados, ${failed.length} falhas, ${noPhone.length} sem telefone`);
  }
}

export function startScheduleAlarms(log: (msg: string) => void = console.log) {
  const run = () => checkScheduleAlarms(log).catch(err => log(`schedule-alarms: ${err.message}`));
  setInterval(run, CHECK_INTERVAL_MS);
  setTimeout(run, 20_000);
  log('schedule-alarms iniciado (1x/min, YouDoChat, inbox Avisos Oficial)');
}
