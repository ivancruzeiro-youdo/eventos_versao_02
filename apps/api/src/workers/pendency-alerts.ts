import { prisma } from '../server.js';
import { runPendencyAlerts, spHourAndDate } from '../lib/pendency-alerts.js';

// Agenda o alerta de pendências (lib/pendency-alerts.ts) às 10h e 16h de São Paulo. Cada rodada
// (data + hora) é reservada no AuditLog antes de enviar, então reinício da API ou segunda
// checagem na mesma hora nunca repete o envio.
const HOURS = [10, 16];
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function startPendencyAlerts(log: (msg: string) => void = console.log) {
  const check = async () => {
    const { hour, dateStr } = spHourAndDate(new Date());
    if (!HOURS.includes(hour)) return;
    const slot = `${dateStr}T${String(hour).padStart(2, '0')}`;
    try {
      const done = await (prisma as any).auditLog.findFirst({ where: { action: 'pendency_alert_run', entityId: slot }, select: { id: true } });
      if (done) return;
      // Reserva a rodada antes de enviar — reinício da API não repete o envio
      await (prisma as any).auditLog.create({ data: { action: 'pendency_alert_run', entityType: 'system', entityId: slot } });
      log(`pendency-alerts: rodada ${slot} iniciada`);
      const r = await runPendencyAlerts(prisma, { log });
      await (prisma as any).auditLog.create({
        data: { action: 'pendency_alert_done', entityType: 'system', entityId: slot, after: { events: r.events, withPendency: r.withPendency, staffMessages: r.staffMessages, clientMessages: r.clientMessages } },
      });
      log(`pendency-alerts: ${r.withPendency}/${r.events} eventos com pendência, ${r.staffMessages} avisos à equipe, ${r.clientMessages} a clientes`);
    } catch (err: any) {
      log(`pendency-alerts: erro — ${err.message}`);
    }
  };
  setInterval(check, CHECK_INTERVAL_MS);
  log(`pendency-alerts agendado: ${HOURS.join('h e ')}h (horário de São Paulo)`);
}
