import { prisma } from '../server.js';

// Envia alerta via n8n para atividades atrasadas, no máximo a cada 30 min por atividade.
// URL de produção do fluxo ENVIAR_MSG; sobrescrever com N8N_WEBHOOK_URL se necessário.
const WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.youdobrasil.com.br/webhook/ENVIAR_MSG';
const CHECK_INTERVAL_MS = 5 * 60 * 1000;   // verifica a cada 5 min
const ALERT_INTERVAL_MS = 30 * 60 * 1000;  // re-alerta a cada 30 min

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.startsWith('55') ? `+${digits}` : `+55${digits}`;
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
  const alertCutoff = new Date(now.getTime() - ALERT_INTERVAL_MS);

  const overdue = await (prisma as any).eventActivity.findMany({
    where: {
      status: 'open',
      dueAt: { lt: now },
      assignedToId: { not: null },
      OR: [{ lastAlertAt: null }, { lastAlertAt: { lt: alertCutoff } }],
    },
    include: {
      assignedTo: { select: { name: true, phone: true } },
      event: { select: { name: true } },
    },
    take: 50,
  });

  for (const act of overdue) {
    const phone = act.assignedTo?.phone ? normalizePhone(act.assignedTo.phone) : null;
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
      `Olá ${act.assignedTo.name}! Você tem uma atividade pendente que já passou do prazo.${BR}` +
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
