import type { UserpSimulation } from './userp-simulations.js';

// Por que um contrato do evento é proposto pra sair do sistema: simulação cancelada/anulada na
// Userp (a causa de verdade), contrato que sumiu de lá, ou desvinculado do contrato principal.
export type RemovalReason = 'cancelled' | 'annulled' | 'missing' | 'unlinked';

// Retira o contrato do evento SEM apagar nada de verdade: tudo que dependia dele (itens,
// respostas e escolhas com histórico, horários de serviço, comentários, vagas e os vínculos da
// cozinha) é guardado em EventContractArchive com os ids originais, e só então sai das tabelas
// ativas — restoreContractArchive devolve tudo. Uma única transação: ou arquiva e remove, ou
// nada muda.
export async function archiveContract(db: any, params: {
  eventId: string;
  contract: any;
  reason: RemovalReason;
  simulation: UserpSimulation | null;
  user: any;
}) {
  const { eventId, contract, reason, simulation, user } = params;

  const items = await (db as any).eventItem.findMany({
    where: { eventId, sourceContractId: contract.externalId },
    include: {
      answers: { include: { history: true } },
      choices: { include: { history: true } },
      serviceWindows: true,
      comments: true,
      slots: true,
      kitchenMenuLink: { select: { id: true } },
      servicePlanEntries: { select: { id: true } },
      prepChecks: { select: { id: true } },
    },
  });
  const contractUsers = await (db as any).eventContractUser.findMany({ where: { eventContractId: contract.id } });

  const snapshotItems = items.map((it: any) => {
    const { answers, choices, serviceWindows, comments, slots, kitchenMenuLink, servicePlanEntries, prepChecks, ...scalars } = it;
    return {
      item: scalars,
      answers, choices, serviceWindows, comments, slots,
      kitchen: {
        menuIds: kitchenMenuLink.map((k: any) => k.id),
        planEntryIds: servicePlanEntries.map((k: any) => k.id),
        prepCheckIds: prepChecks.map((k: any) => k.id),
      },
    };
  });
  const itemIds: string[] = items.map((i: any) => i.id);

  const { users: _users, ...contractScalars } = contract;
  const [archive] = await db.$transaction([
    (db as any).eventContractArchive.create({
      data: {
        eventId,
        contractExternalId: contract.externalId,
        contract: { ...contractScalars, users: contractUsers },
        items: snapshotItems,
        reason,
        reasonDetail: simulation ?? undefined,
        archivedById: user?.id ?? null,
        archivedByName: user?.name || user?.email || null,
      },
    }),
    // KitchenEventMenu.eventItemId não tem regra de cascata — solta o vínculo antes de remover o
    // item (os ids ficam no snapshot pra religar na restauração).
    (db as any).kitchenEventMenu.updateMany({ where: { eventItemId: { in: itemIds } }, data: { eventItemId: null } }),
    (db as any).eventItem.deleteMany({ where: { id: { in: itemIds } } }),
    (db as any).eventContract.delete({ where: { id: contract.id } }),
  ]);

  return { archive, items };
}

// Colunas de data viram string ISO no JSON do snapshot — todas as de data dessas tabelas
// terminam em "At" (createdAt, serviceStartAt, confirmedAt...), então só elas voltam a Date.
function reviveDates<T extends Record<string, any>>(row: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === 'string' && k.endsWith('At') && !isNaN(Date.parse(v)) ? new Date(v) : v;
  }
  return out as T;
}

// Devolve o contrato arquivado com os ids originais — mesmos ids, então comentários,
// aprovações do cliente (ClientApproval guarda o id do item) e histórico continuam batendo.
export async function restoreContractArchive(db: any, archiveId: string, eventId: string, user: any) {
  const archive = await (db as any).eventContractArchive.findFirst({ where: { id: archiveId, eventId } });
  if (!archive) return { error: 'Arquivo não encontrado neste evento.', status: 404 };
  if (archive.restoredAt) return { error: 'Este contrato já foi restaurado.', status: 409 };

  const clash = await (db as any).eventContract.findFirst({ where: { externalId: archive.contractExternalId } });
  if (clash) return { error: `O contrato ${archive.contractExternalId} já está vinculado a um evento — não dá pra restaurar por cima.`, status: 409 };

  const snap = archive.items as any[];
  const { users: archivedUsers, ...contractRow } = archive.contract as any;

  // Referências que podem ter deixado de existir desde o arquivamento — não derrubam a restauração.
  const questionIds = [...new Set(snap.flatMap(s => s.answers.map((a: any) => a.questionId)))] as string[];
  const validQuestions = new Set(
    (await (db as any).productQuestion.findMany({ where: { id: { in: questionIds } }, select: { id: true } })).map((q: any) => q.id),
  );
  const userIds = new Set<string>();
  for (const s of snap) {
    for (const a of s.answers) { if (a.updatedById) userIds.add(a.updatedById); for (const h of a.history) if (h.userId) userIds.add(h.userId); }
    for (const c of s.choices) { if (c.confirmedById) userIds.add(c.confirmedById); for (const h of c.history) if (h.userId) userIds.add(h.userId); }
    for (const c of s.comments) { if (c.userId) userIds.add(c.userId); if (c.deletedById) userIds.add(c.deletedById); }
  }
  const validUsers = new Set(
    (await (db as any).user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true } })).map((u: any) => u.id),
  );
  const uid = (id: string | null | undefined) => (id && validUsers.has(id) ? id : null);

  const ops: any[] = [
    (db as any).eventContract.create({ data: reviveDates(contractRow) }),
    ...(archivedUsers?.length ? [(db as any).eventContractUser.createMany({ data: archivedUsers.map(reviveDates) })] : []),
  ];
  let skippedAnswers = 0;
  for (const s of snap) {
    ops.push((db as any).eventItem.create({ data: reviveDates(s.item) }));
    const answers = s.answers.filter((a: any) => validQuestions.has(a.questionId));
    skippedAnswers += s.answers.length - answers.length;
    if (answers.length) {
      ops.push((db as any).eventItemAnswer.createMany({
        data: answers.map(({ history, ...a }: any) => reviveDates({ ...a, updatedById: uid(a.updatedById) })),
      }));
      const hist = answers.flatMap((a: any) => a.history.map((h: any) => {
        const { before, ...rest } = h;
        return reviveDates({ ...rest, ...(before !== null && before !== undefined ? { before } : {}), userId: uid(h.userId) });
      }));
      if (hist.length) ops.push((db as any).eventItemAnswerHistory.createMany({ data: hist }));
    }
    if (s.choices.length) {
      ops.push((db as any).eventItemChoice.createMany({
        data: s.choices.map(({ history, ...c }: any) => reviveDates({ ...c, confirmedById: uid(c.confirmedById) })),
      }));
      const hist = s.choices.flatMap((c: any) => c.history.map((h: any) => reviveDates({ ...h, userId: uid(h.userId) })));
      if (hist.length) ops.push((db as any).eventItemChoiceHistory.createMany({ data: hist }));
    }
    if (s.serviceWindows.length) ops.push((db as any).eventItemServiceWindow.createMany({ data: s.serviceWindows.map(reviveDates) }));
    if (s.slots.length) ops.push((db as any).eventStaffSlot.createMany({ data: s.slots.map(reviveDates) }));
    if (s.comments.length) {
      ops.push((db as any).eventComment.createMany({
        data: s.comments.map((c: any) => reviveDates({ ...c, userId: uid(c.userId), deletedById: uid(c.deletedById) })),
      }));
    }
    // Religa o que a cozinha tinha apontado pra esse item (só o que ainda existe).
    if (s.kitchen.menuIds.length) ops.push((db as any).kitchenEventMenu.updateMany({ where: { id: { in: s.kitchen.menuIds } }, data: { eventItemId: s.item.id } }));
    if (s.kitchen.planEntryIds.length) ops.push((db as any).kitchenServicePlanEntry.updateMany({ where: { id: { in: s.kitchen.planEntryIds } }, data: { eventItemId: s.item.id } }));
    if (s.kitchen.prepCheckIds.length) ops.push((db as any).kitchenPrepCheck.updateMany({ where: { id: { in: s.kitchen.prepCheckIds } }, data: { eventItemId: s.item.id } }));
  }
  ops.push((db as any).eventContractArchive.update({
    where: { id: archive.id },
    data: { restoredAt: new Date(), restoredByName: user?.name || user?.email || null },
  }));
  await db.$transaction(ops);

  // Se o arquivamento desse contrato foi o que cancelou o evento, devolve o status de antes.
  let reopened = false;
  if (archive.eventStatusBefore) {
    const ev = await db.event.findUnique({ where: { id: eventId }, select: { status: true } });
    if (ev?.status === 'cancelled') {
      await db.event.update({ where: { id: eventId }, data: { status: archive.eventStatusBefore as any } });
      reopened = true;
    }
  }
  return { ok: true as const, archive, restoredItems: snap.length, skippedAnswers, reopened };
}
