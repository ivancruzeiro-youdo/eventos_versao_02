import { prisma } from '../server.js';

// Envia alerta via n8n para atividades atrasadas, no máximo a cada 30 min por atividade.
// URL de produção do fluxo ENVIAR_MSG; sobrescrever com N8N_WEBHOOK_URL se necessário.
const WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.youdobrasil.com.br/webhook/ENVIAR_MSG';
const CHECK_INTERVAL_MS = 5 * 60 * 1000;   // verifica a cada 5 min
const TZ = 'America/Sao_Paulo';
const BUSINESS_HOUR_START = 8;
const BUSINESS_HOUR_END = 18;

// Alertas só saem em horário útil (dias úteis, 08h–18h no fuso de SP), independente da frequência escolhida
function isBusinessHours(d: Date): boolean {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(d);
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(d));
  return hour >= BUSINESS_HOUR_START && hour < BUSINESS_HOUR_END;
}

// O fluxo n8n prefixa "+55" — enviar apenas DDD + número (dígitos, sem código do país)
function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length > 11) digits = digits.slice(2);
  if (digits.length < 10) return null;
  return digits;
}

function fmtDateTime(d: Date): string {
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

async function checkOverdueActivities(log: (msg: string) => void) {
  const now = new Date();

  if (!isBusinessHours(now)) return; // alertas só em horário útil, qualquer que seja a frequência

  const overdue = await (prisma as any).eventActivity.findMany({
    where: {
      status: 'open',
      dueAt: { lt: now },
      OR: [
        { assignedToId: { not: null } },
        { assignedPersonId: { not: null } },
      ],
    },
    include: {
      assignedTo: { select: { name: true, phone: true } },
      assignedPerson: { select: { name: true, whatsapp: true } },
      event: { select: { name: true } },
    },
    take: 200,
  });

  for (const act of overdue) {
    const freqMs = (act.alertFreqMinutes ?? 30) * 60 * 1000;
    if (act.lastAlertAt && now.getTime() - new Date(act.lastAlertAt).getTime() < freqMs) continue;

    const assigneeName = act.assignedTo?.name ?? act.assignedPerson?.name ?? null;
    const rawPhone = act.assignedTo?.phone ?? act.assignedPerson?.whatsapp ?? null;
    const phone = rawPhone ? normalizePhone(rawPhone) : null;
    if (!phone) {
      // Sem telefone cadastrado — marca para não reprocessar toda rodada
      await (prisma as any).eventActivity.update({ where: { id: act.id }, data: { lastAlertAt: now } });
      continue;
    }

    // Quebras de linha como texto literal "\n\n" (o fluxo n8n espera assim;
    // newlines reais quebram o JSON montado dentro do workflow)
    const BR = '\\n\\n';
    const mensagem =
      `⚠️ *ATIVIDADE ATRASADA*${BR}` +
      `Olá ${assigneeName}! Você tem uma atividade pendente que já passou do prazo.${BR}` +
      `📋 *Atividade:* ${act.title}${BR}` +
      `🎪 *Evento:* ${act.event?.name ?? '—'}${BR}` +
      `🕐 *Prazo:* ${fmtDateTime(new Date(act.dueAt))}${BR}` +
      `Acesse https://eventos.youdobrasil.com.br para concluir ou reagendar.`;

    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fone: phone, mensagem }),
      });
      if (res.ok) {
        await (prisma as any).eventActivity.update({ where: { id: act.id }, data: { lastAlertAt: now } });
        log(`Alerta enviado: atividade "${act.title}" -> ${phone}`);
      } else {
        log(`Falha no webhook (${res.status}) para atividade "${act.title}"`);
      }
    } catch (err: any) {
      log(`Erro ao chamar webhook: ${err.message}`);
    }
  }
}

export function startActivityAlerts(log: (msg: string) => void = console.log) {
  const run = () => checkOverdueActivities(log).catch(err => log(`activity-alerts: ${err.message}`));
  setInterval(run, CHECK_INTERVAL_MS);
  setTimeout(run, 15_000); // primeira checagem 15s após o boot
  log(`activity-alerts iniciado (webhook: ${WEBHOOK_URL})`);
}
