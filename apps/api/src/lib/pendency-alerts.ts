import { getEventPendencies } from './pendencies.js';
import { normalizePhone, sendWhatsAppAlert } from './notifications.js';

// Alerta de pendências dos eventos futuros, 2x/dia (10h e 16h, horário de São Paulo):
//  - destinatários: quem está aprovado como "Assessoria de Produçao" no evento; se ninguém
//    estiver, todos os freelancers ativos habilitados nesse serviço (FreelancerServiceLink);
//  - SÓ quando há "plano não confirmado pelo cliente", o cliente também recebe o aviso (telefones
//    dos usuários do contrato no Userp, com preferência pra quem acessa o app).
// Cada rodada (data + hora) é reservada no AuditLog antes de enviar, então reinício da API ou
// segunda checagem na mesma hora nunca repete o envio.
export const TZ = 'America/Sao_Paulo';
const ROLE_NAME = 'assessoria de producao';
const BASE_URL = 'https://eventos.youdobrasil.com.br';
// Só eventos que acontecem nos próximos N dias entram no alerta — evento a meses de distância
// sempre tem "pendência" (equipe vazia, plano por responder) e viraria ruído duas vezes por dia.
const HORIZON_DAYS = Number(process.env.PENDENCY_ALERTS_HORIZON_DAYS) || 30;
const MAX_DETAIL = 900; // limite do valor do template do WhatsApp (1024) com folga
// Usuários internos cadastrados nos contratos (ex.: "YouDO Live & Work") não são o cliente.
const isInternalContact = (u: { nome?: string | null; email?: string | null }) =>
  /youdo/i.test(u.nome ?? '') || /@youdobrasil\.com\.br$/i.test(u.email ?? '');

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function spHourAndDate(d: Date) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(d)) % 24;
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return { hour, dateStr };
}

const fmtDate = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });

export interface PendencyRunResult {
  events: number;
  withPendency: number;
  staffMessages: number;
  clientMessages: number;
  lines: string[];
}

export async function runPendencyAlerts(db: any, opts: { dryRun?: boolean; log?: (m: string) => void } = {}): Promise<PendencyRunResult> {
  const log = opts.log ?? (() => {});
  const res: PendencyRunResult = { events: 0, withPendency: 0, staffMessages: 0, clientMessages: 0, lines: [] };
  const say = (m: string) => { res.lines.push(m); log(m); };

  const events = await db.event.findMany({
    where: {
      status: { in: ['draft', 'confirmed', 'in_progress'] },
      startAt: { gte: new Date(), lte: new Date(Date.now() + HORIZON_DAYS * 24 * 60 * 60 * 1000) },
      degustacao: { is: null },
    },
    select: { id: true, name: true, startAt: true, clientToken: true },
    orderBy: { startAt: 'asc' },
  });
  res.events = events.length;

  const services = await db.freelancerService.findMany({ select: { id: true, name: true } });
  const serviceIds = services.filter((s: any) => norm(s.name) === ROLE_NAME).map((s: any) => s.id);
  const roleNames = services.filter((s: any) => norm(s.name) === ROLE_NAME).map((s: any) => s.name);
  const qualified = serviceIds.length
    ? await db.freelancer.findMany({
        where: { status: 'active', services: { some: { serviceId: { in: serviceIds } } } },
        select: { name: true, phone: true },
      })
    : [];

  const digests = new Map<string, { name: string; lines: string[]; events: string[] }>();

  for (const ev of events) {
    try {
      const pend = await getEventPendencies(db, ev.id);
      if (pend.items.length === 0) continue;
      res.withPendency++;

      const link = `${BASE_URL}/events/${ev.id}`;
      const when = ev.startAt ? fmtDate(new Date(ev.startAt)) : 'sem data';
      const approved = await db.freelancerApplication.findMany({
        where: { eventId: ev.id, status: 'approved', role: { in: roleNames.length ? roleNames : ['Assessoria de Produçao'] } },
        select: { freelancer: { select: { name: true, phone: true } } },
      });
      const fromEvent = approved.map((a: any) => a.freelancer).filter(Boolean);
      const recipients = fromEvent.length ? fromEvent : qualified;
      const scope = fromEvent.length ? 'Assessoria de Produçao do evento' : 'todos habilitados como Assessoria de Produçao (ninguém alocado)';

      const sent: string[] = [], noPhone: string[] = [];
      const seen = new Set<string>();
      for (const f of recipients) {
        const phone = f.phone ? normalizePhone(f.phone) : null;
        if (!phone) { noPhone.push(f.name); continue; }
        if (seen.has(phone)) continue;
        seen.add(phone);
        sent.push(f.name);
        // Uma mensagem por pessoa por rodada (resumo de todos os eventos dela), não uma por evento
        const d: { name: string; lines: string[]; events: string[] } = digests.get(phone) ?? { name: f.name, lines: [], events: [] };
        d.lines.push(`${ev.name} (${when}): ${pend.items.join(', ')}`);
        d.events.push(ev.id);
        digests.set(phone, d);
      }
      res.staffMessages += sent.length;

      // Cliente: só quando o aviso inclui plano não confirmado por ele
      const clientSent: string[] = [];
      if (pend.planUnconfirmed > 0 && process.env.PENDENCY_ALERTS_CLIENT !== 'off') {
        const users = (await db.eventContractUser.findMany({
          where: { eventContract: { eventId: ev.id }, telefone: { not: null } },
          select: { nome: true, telefone: true, email: true, acessaApp: true },
        })).filter((u: any) => !isInternalContact(u));
        const pref = users.filter((u: any) => u.acessaApp);
        const seenC = new Set<string>();
        for (const u of (pref.length ? pref : users)) {
          const phone = u.telefone ? normalizePhone(u.telefone) : null;
          if (!phone || seenC.has(phone)) continue;
          seenC.add(phone);
          const portal = ev.clientToken ? `${BASE_URL}/client/${ev.clientToken}` : null;
          if (opts.dryRun) { clientSent.push(u.nome); continue; }
          const ok = await sendWhatsAppAlert(phone, {
            titulo: `Seu evento ${ev.name}: confirme o plano`,
            detalhe: `Olá ${u.nome}! Ainda há ${pend.planUnconfirmed} ${pend.planUnconfirmed > 1 ? 'itens' : 'item'} do plano do seu evento de ${when} aguardando a sua confirmação.`,
            acao: portal ? `Confirme pelo portal do cliente: ${portal}` : 'Fale com a nossa equipe para confirmar.',
          });
          if (ok) clientSent.push(u.nome);
        }
        res.clientMessages += clientSent.length;
      }

      say(`${opts.dryRun ? '[simulação] ' : ''}${ev.name} (${when}): ${pend.items.join('; ')} → equipe[${scope}]: ${sent.join(', ') || 'ninguém'}${noPhone.length ? ` | sem telefone: ${noPhone.join(', ')}` : ''}${pend.planUnconfirmed > 0 ? ` | cliente: ${clientSent.join(', ') || 'sem telefone no contrato'}` : ''}`);

      if (!opts.dryRun) {
        await db.eventComment.create({
          data: {
            eventId: ev.id, userId: null, isSystem: true,
            content: `Alerta de pendências (10h/16h). Pendente: ${pend.items.join('; ')}. Aviso por WhatsApp (resumo) para ${scope}: ${sent.join(', ') || 'ninguém'}${noPhone.length ? `; sem telefone cadastrado: ${noPhone.join(', ')}` : ''}${pend.planUnconfirmed > 0 ? `. Cliente avisado (plano não confirmado): ${clientSent.join(', ') || 'ninguém — sem telefone nos usuários do contrato'}` : ''}.`,
          },
        });
      }
    } catch (err: any) {
      say(`erro no evento ${ev.name}: ${err.message}`);
    }
  }
  for (const [phone, d] of digests) {
    let detalhe = `Olá ${d.name}! Pendências: `;
    let shown = 0;
    for (const line of d.lines) {
      const next = (shown ? ' | ' : '') + line;
      if ((detalhe + next).length > MAX_DETAIL - 40) break;
      detalhe += next; shown++;
    }
    if (shown < d.lines.length) detalhe += ` | … e mais ${d.lines.length - shown} evento(s)`;
    const single = d.events.length === 1;
    say(`${opts.dryRun ? '[simulação] ' : ''}resumo para ${d.name}: ${d.lines.length} evento(s)`);
    if (opts.dryRun) continue;
    await sendWhatsAppAlert(phone, {
      titulo: single ? '📋 Pendência de evento' : `📋 Pendências em ${d.lines.length} eventos`,
      detalhe,
      acao: single ? `Resolva pela tela do evento: ${BASE_URL}/events/${d.events[0]}` : `Resolva pelas telas dos eventos: ${BASE_URL}/events`,
    });
  }
  return res;
}

