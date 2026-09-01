import { prisma } from '../server.js';
import { getUserpToken } from '../lib/userp-auth.js';

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

export async function registrarCheckinsUserp(eventId: string, triggeredByUserId: string | null): Promise<void> {
  const contracts = await (prisma as any).eventContract.findMany({ where: { eventId } });
  if (contracts.length === 0) return;

  const { token, baseUrl } = await getUserpToken();
  const lines: string[] = [];

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
        lines.push(`Contrato ${contract.externalId} (${item.unidade_nome}): falha ao registrar check-in (${res.status}) — ${body}`);
      } else {
        lines.push(`Contrato ${contract.externalId} (${item.unidade_nome}): check-in registrado na Userp.`);
      }
    } catch (err: any) {
      lines.push(`Contrato ${contract.externalId}: erro ao consultar/registrar check-in na Userp — ${err.message}`);
    }
  }

  await prisma.eventComment.create({
    data: { eventId, userId: triggeredByUserId, isSystem: true, content: `Check-in Userp (início do evento):\n${lines.join('\n')}` },
  });
}

export async function registrarCheckoutsUserp(eventId: string, triggeredByUserId: string | null): Promise<void> {
  const contracts = await (prisma as any).eventContract.findMany({ where: { eventId } });
  if (contracts.length === 0) return;

  let idFunc: number | null = null;
  if (triggeredByUserId) {
    const user = await prisma.user.findUnique({ where: { id: triggeredByUserId }, select: { userpCodigo: true } });
    idFunc = user?.userpCodigo ? parseInt(user.userpCodigo, 10) : null;
  }

  // "Itens Quebrados / Danificados" do encerramento vai no check-out como cobra_obs — campo
  // opcional de checkouts/create.php, "observação sobre valores a cobrar ao cliente" (doc dá
  // exatamente "Danos na parede da sala." como exemplo). Só manda quando preenchido.
  const closure = await (prisma as any).eventClosure.findUnique({ where: { eventId }, select: { itensQuebrados: true } });
  const cobraObs: string | undefined = closure?.itensQuebrados?.trim() || undefined;

  const { token, baseUrl } = await getUserpToken();
  const { date: dataCheckout, time: horaCheckout } = nowBrtParts();
  const lines: string[] = [];

  for (const contract of contracts) {
    try {
      const data = await fetchJson(`${baseUrl}/api/userp-satelite/checkouts/index.php?con_idcontrato=${contract.externalId}`, token);
      const item = data?.items?.[0];
      if (!item) {
        lines.push(`Contrato ${contract.externalId}: sem check-out pendente na Userp (já feito, ou não se aplica a este contrato).`);
        continue;
      }
      if (!idFunc) {
        lines.push(`Contrato ${contract.externalId} (${item.unidade_nome}): não registrado — quem encerrou o evento não tem código de funcionário Userp vinculado (Admin → Usuários).`);
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
        }),
      });
      if (res.status === 409) {
        lines.push(`Contrato ${contract.externalId} (${item.unidade_nome}): check-out já estava registrado na Userp.`);
      } else if (!res.ok) {
        const body = await res.text().catch(() => '');
        lines.push(`Contrato ${contract.externalId} (${item.unidade_nome}): falha ao registrar check-out (${res.status}) — ${body}`);
      } else {
        lines.push(`Contrato ${contract.externalId} (${item.unidade_nome}): check-out registrado na Userp.`);
      }
    } catch (err: any) {
      lines.push(`Contrato ${contract.externalId}: erro ao consultar/registrar check-out na Userp — ${err.message}`);
    }
  }

  await prisma.eventComment.create({
    data: { eventId, userId: triggeredByUserId, isSystem: true, content: `Check-out Userp (encerramento do evento):\n${lines.join('\n')}` },
  });
}
