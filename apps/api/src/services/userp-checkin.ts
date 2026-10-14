import { prisma } from '../server.js';
import { getUserpToken } from '../lib/userp-auth.js';
import { computeClosureBilling } from '../lib/closure-billing.js';

// Check-in/check-out da Userp são registros de "reserva de espaço" (tb_loca_res_reservas /
// tb_loca_res_desocupacao) por CONTRATO — não por evento. Um evento pode ter mais de um
// EventContract (principal + secundários); cada um pode ou não ter um check-in/check-out
// pendente na Userp (ex.: um contrato de upgrade não tem reserva de espaço própria). Por isso
// este módulo sempre itera TODOS os EventContract do evento e simplesmente pula os que não
// têm nada pendente — silêncio ali é esperado, não erro.
//
// Fire-and-forget de propósito (mesmo padrão de handleAcessoGrant em freelancers.ts): iniciar
// ou encerrar um evento físico não pode ficar preso esperando a Userp responder. O resultado
// (registrado, já feito, ou falhou) vira um comentário de sistema no evento — nunca falha
// silenciosamente sem deixar rastro.

// BRT é UTC-3 fixo (sem horário de verão desde 2019) — mesma convenção já usada em
// sync-events.ts (parseBrt).
function nowBrtParts(): { date: string; time: string } {
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return { date: brt.toISOString().slice(0, 10), time: brt.toISOString().slice(11, 19) };
}

async function fetchJson(url: string, token: string): Promise<any> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${url} falhou: ${res.status}`);
  return res.json();
}

export interface CheckinResult {
  ok: boolean;
  /** Uma mensagem por contrato que falhou de verdade — "sem pendente" e "já feito" (409) não
   *  contam como falha, só erro de rede/auth ou resposta não-ok da Userp. */
  failures: string[];
}

// Retorna resultado (em vez de void) pra quem inicia o evento poder BLOQUEAR a transição de
// status se o check-in de espaço falhar — ao contrário do check-out (sempre fire-and-forget,
// nunca trava o encerramento), aqui o pedido foi explícito: se travar, mostra o motivo pro
// operador e NÃO inicia o evento, em vez de deixar iniciar e só logar o erro escondido.
export async function registrarCheckinsUserp(eventId: string, triggeredByUserId: string | null): Promise<CheckinResult> {
  const contracts = await (prisma as any).eventContract.findMany({ where: { eventId } });
  if (contracts.length === 0) return { ok: true, failures: [] };

  const { token, baseUrl } = await getUserpToken();
  const lines: string[] = [];
  const failures: string[] = [];

  for (const contract of contracts) {
    try {
      const data = await fetchJson(`${baseUrl}/api/userp-satelite/checkins/index.php?codlocacontrato=${contract.externalId}`, token);
      const item = data?.items?.[0];
      if (!item) {
        lines.push(`Contrato ${contract.externalId}: sem check-in pendente na Userp (já feito, ou não se aplica a este contrato).`);
        continue;
      }

      const res = await fetch(`${baseUrl}/api/userp-satelite/checkins/create.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          res_id: item.checkin_id,
          id_unidade: item.unidade_id,
          cliente_id: item.cliente_id,
          tipo_contrato: String(item.tipo_contrato_id),
        }),
      });
      if (res.status === 409) {
        lines.push(`Contrato ${contract.externalId} (${item.unidade_nome}): check-in já estava registrado na Userp.`);
      } else if (!res.ok) {
        const body = await res.text().catch(() => '');
        const msg = `Contrato ${contract.externalId} (${item.unidade_nome}): falha ao registrar check-in (${res.status}) — ${body}`;
        lines.push(msg);
        failures.push(msg);
      } else {
        lines.push(`Contrato ${contract.externalId} (${item.unidade_nome}): check-in registrado na Userp.`);
      }
    } catch (err: any) {
      const msg = `Contrato ${contract.externalId}: erro ao consultar/registrar check-in na Userp — ${err.message}`;
      lines.push(msg);
      failures.push(msg);
    }
  }

  await prisma.eventComment.create({
    data: { eventId, userId: triggeredByUserId, isSystem: true, content: `Check-in Userp (início do evento):\n${lines.join('\n')}` },
  });

  return { ok: failures.length === 0, failures };
}

export interface CheckoutProblem {
  /** null = problema do evento inteiro (não de um contrato específico) */
  contract: string | null;
  kind: 'no_record' | 'no_func' | 'rejected' | 'error';
  /** O que houve, em linguagem de operador. */
  message: string;
  /** Dado técnico: status HTTP/corpo da Userp, ou o registro achado em OUTRO contrato do mesmo cliente. */
  detail?: string;
}

export interface CheckoutResult {
  ok: boolean;
  /** Contratos com check-out registrado agora ou que já estavam registrados. */
  registered: number;
  problems: CheckoutProblem[];
}

const normName = (s: string) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

// Quando a Userp não tem registro de check-out pro contrato do evento, o motivo mais comum é o
// contrato ter sido SUBSTITUÍDO por outro (simulação anulada/cancelada → contrato novo): o
// registro de desocupação fica preso ao contrato antigo. Procura, entre todos os check-outs, o do
// mesmo cliente + mesmo espaço + data próxima ligado a outro contrato — é o que o operador
// precisa saber pra pedir o ajuste na Userp.
async function findCheckoutInOtherContract(
  baseUrl: string,
  token: string,
  event: { clientName: string; startAt: Date | null },
  contracts: { externalId: string }[],
): Promise<string | null> {
  if (!event.startAt) return null;
  const unitIds = new Set<number>();
  for (const c of contracts) {
    try {
      const d = await fetchJson(`${baseUrl}/api/userp-satelite/contratos/index.php?codlocacontrato=${c.externalId}`, token);
      const u = d?.items?.[0]?.unidade_id;
      if (u) unitIds.add(Number(u));
    } catch { /* sem a unidade desse contrato, segue com os outros */ }
  }
  if (unitIds.size === 0) return null;

  const all: any[] = [];
  let start = 0;
  while (true) {
    const d = await fetchJson(`${baseUrl}/api/userp-satelite/checkouts/index.php?start=${start}&limit=2000`, token);
    all.push(...(d?.items ?? []));
    if (!d?.has_more || !(d?.items ?? []).length) break;
    start = d?.next_start ?? start + 2000;
  }
  const ownIds = new Set(contracts.map(c => String(c.externalId)));
  const evMs = event.startAt.getTime();
  const wanted = normName(event.clientName).slice(0, 14);
  const hits = all.filter(r =>
    !ownIds.has(String(r.con_idcontrato)) &&
    unitIds.has(Number(r.unidade_id)) &&
    Math.abs(new Date(r.des_datadesocupa).getTime() - evMs) <= 4 * 86_400_000 &&
    normName(r.cliente_nome).slice(0, 14) === wanted,
  );
  if (hits.length === 0) return null;
  return hits.map(r =>
    `registro ${r.des_id} (${r.unidade_nome}, previsto ${r.des_datadesocupa}, ${r.data_realizado_desocupacao ? 'já realizado' : 'pendente'}) está ligado ao contrato ${r.con_idcontrato}, que não é um contrato deste evento — provavelmente o contrato foi substituído`,
  ).join('; ');
}

// Nunca lança: qualquer falha vira problema no resultado + comentário no evento — o encerramento
// já foi feito, o que o operador precisa é saber que a baixa na Userp NÃO aconteceu e por quê.
export async function registrarCheckoutsUserp(eventId: string, triggeredByUserId: string | null): Promise<CheckoutResult> {
  const contracts = await (prisma as any).eventContract.findMany({ where: { eventId } });
  if (contracts.length === 0) return { ok: true, registered: 0, problems: [] };

  const lines: string[] = [];
  const problems: CheckoutProblem[] = [];
  let registered = 0;
  const noRecord: string[] = [];

  try {
    let idFunc: number | null = null;
    if (triggeredByUserId) {
      const user = await prisma.user.findUnique({ where: { id: triggeredByUserId }, select: { userpCodigo: true } });
      idFunc = user?.userpCodigo ? parseInt(user.userpCodigo, 10) : null;
    }

    // Itens Quebrados + excedente de A&B + itens avulsos a cobrar, tudo somado num único
    // cobra_obs (descrição) e cobra_valor (total) — campos opcionais de checkouts/create.php
    // ("observação sobre valores a cobrar ao cliente" / "valor a cobrar ao cliente"). Só manda
    // quando há algo a cobrar de fato.
    const closure = await (prisma as any).eventClosure.findUnique({
      where: { eventId },
      select: { itensQuebrados: true, abExcessQty: true, abExcessUnitValue: true, charges: true },
    });
    const billing = closure ? computeClosureBilling(closure) : { obs: '', valor: 0 };
    const cobraObs: string | undefined = billing.obs || undefined;
    const cobraValor: number | undefined = billing.valor > 0 ? billing.valor : undefined;

    const { token, baseUrl } = await getUserpToken();
    const { date: dataCheckout, time: horaCheckout } = nowBrtParts();

    for (const contract of contracts) {
      try {
        const data = await fetchJson(`${baseUrl}/api/userp-satelite/checkouts/index.php?con_idcontrato=${contract.externalId}`, token);
        const item = data?.items?.[0];
        if (!item) {
          lines.push(`Contrato ${contract.externalId}: sem check-out pendente na Userp (já feito, ou não se aplica a este contrato).`);
          noRecord.push(contract.externalId);
          continue;
        }
        if (!idFunc) {
          const msg = `Contrato ${contract.externalId} (${item.unidade_nome}): não registrado — quem encerrou o evento não tem código de funcionário Userp vinculado (Admin → Usuários).`;
          lines.push(msg);
          problems.push({ contract: contract.externalId, kind: 'no_func', message: `${item.unidade_nome}: quem encerrou o evento não tem código de funcionário Userp vinculado, então a baixa não pôde ser enviada.` });
          continue;
        }

        const res = await fetch(`${baseUrl}/api/userp-satelite/checkouts/create.php`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            des_id: item.des_id,
            id_unidade: item.unidade_id,
            cliente_id: item.cli_idcliente,
            tipo_contrato: String(item.tipo_contrato_id),
            id_func: idFunc,
            data_checkout: dataCheckout,
            hora_checkout: horaCheckout,
            ...(cobraObs ? { cobra_obs: cobraObs } : {}),
            ...(cobraValor !== undefined ? { cobra_valor: cobraValor } : {}),
          }),
        });
        if (res.status === 409) {
          lines.push(`Contrato ${contract.externalId} (${item.unidade_nome}): check-out já estava registrado na Userp.`);
          registered++;
        } else if (!res.ok) {
          const body = await res.text().catch(() => '');
          lines.push(`Contrato ${contract.externalId} (${item.unidade_nome}): falha ao registrar check-out (${res.status}) — ${body}`);
          problems.push({
            contract: contract.externalId, kind: 'rejected',
            message: `${item.unidade_nome}: a Userp recusou a baixa do check-out.`,
            detail: `HTTP ${res.status}${body ? ` — ${body.slice(0, 300)}` : ''}`,
          });
        } else {
          lines.push(`Contrato ${contract.externalId} (${item.unidade_nome}): check-out registrado na Userp.`);
          registered++;
        }
      } catch (err: any) {
        lines.push(`Contrato ${contract.externalId}: erro ao consultar/registrar check-out na Userp — ${err.message}`);
        problems.push({
          contract: contract.externalId, kind: 'error',
          message: 'Não foi possível falar com a Userp para registrar o check-out deste contrato.',
          detail: err.message,
        });
      }
    }

    // Nenhum contrato do evento tem registro de check-out na Userp (e nada mais falhou): a baixa
    // não aconteceu. Um evento com contrato principal + complementos costuma ter registro só no
    // principal — por isso só vira problema quando NENHUM contrato registrou.
    if (registered === 0 && problems.length === 0 && noRecord.length > 0) {
      let detail: string | undefined;
      try {
        const event = await prisma.event.findUnique({ where: { id: eventId }, select: { clientName: true, startAt: true } });
        const found = event ? await findCheckoutInOtherContract(baseUrl, token, event, contracts) : null;
        detail = found
          ? `Encontrei na Userp: ${found}.`
          : 'Também não existe check-out deste cliente, neste espaço e data, ligado a nenhum outro contrato.';
      } catch (err: any) {
        detail = `Não consegui procurar o registro em outros contratos: ${err.message}`;
      }
      problems.push({
        contract: null, kind: 'no_record',
        message: 'A Userp não tem registro de check-out para nenhum contrato deste evento, então a baixa não foi feita.',
        detail,
      });
    }
  } catch (err: any) {
    lines.push(`Erro ao registrar check-out na Userp — ${err.message}`);
    problems.push({ contract: null, kind: 'error', message: 'Não foi possível falar com a Userp para registrar o check-out.', detail: err.message });
  }

  const ok = problems.length === 0;
  const aviso = ok ? '' : `ATENÇÃO — a baixa do check-out NÃO foi feita na Userp:\n${problems.map(p => `• ${p.message}${p.detail ? ` (${p.detail})` : ''}`).join('\n')}\n\n`;
  await prisma.eventComment.create({
    data: { eventId, userId: triggeredByUserId, isSystem: true, content: `${aviso}Check-out Userp (encerramento do evento):\n${lines.join('\n')}` },
  });

  return { ok, registered, problems };
}
