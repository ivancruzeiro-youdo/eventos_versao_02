// Atividade semanal "Adicionar mão de obra cozinha", direcionada à equipe Cozinha. Atividade exige
// evento, então vai no evento futuro mais próximo; fica atribuída ao 1º membro da equipe (a
// atividade tem um único responsável) e a descrição lista a equipe toda.
export const KITCHEN_TEAM_NAME = 'Cozinha';
export const KITCHEN_ACTIVITY_TITLE = 'Adicionar mão de obra cozinha';

export async function createKitchenWeeklyActivity(db: any, dateStr: string): Promise<string> {
  const event = await db.event.findFirst({
    where: { status: { in: ['draft', 'confirmed', 'in_progress'] }, startAt: { gte: new Date() }, degustacao: { is: null } },
    orderBy: { startAt: 'asc' },
    select: { id: true, name: true },
  });
  if (!event) return 'nenhum evento futuro — atividade não criada';

  const team = await db.team.findUnique({
    where: { name: KITCHEN_TEAM_NAME },
    include: { members: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } } },
  });
  const members = team?.members.map((m: any) => m.user) ?? [];
  const dueAt = new Date(`${dateStr}T17:00:00-03:00`);

  await db.eventActivity.create({
    data: {
      eventId: event.id,
      title: KITCHEN_ACTIVITY_TITLE,
      description: `Atividade semanal automática: avaliar a escala da semana e adicionar mão de obra de cozinha aos eventos. Equipe Cozinha: ${members.map((u: any) => u.name).join(', ') || 'sem membros cadastrados'}.`,
      assignedToId: members[0]?.id ?? null,
      dueAt,
    },
  });
  return `atividade criada no evento "${event.name}" para ${members[0]?.name ?? 'ninguém (equipe Cozinha sem membros)'}`;
}
