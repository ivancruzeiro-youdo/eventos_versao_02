// Espaços (EventVenue) que deixaram de ser justificados por qualquer contrato do evento — seja
// porque o único contrato que citava o padrão foi arquivado (lib/contract-archive.ts), seja porque
// o contrato mudou de padrão na Userp (sync em routes/sync-events.ts). Recebe o cliente do banco
// por parâmetro pra poder rodar em script.

// Espaços (padrões da Userp) citados por contratos — no principal ou em qualquer secundário,
// mesma regra do sync (collectPadraoIds em sync-events.ts).
// `padroes` (os espaços da simulação) manda; o `padrao_id` do contrato só vale quando `padroes` vem
// vazio. Quando o cliente troca de espaço na Userp, o padrao_id do contrato fica velho (ex.: 106 =
// Lounge 1) e `padroes` traz o espaço atual (107 = Lounge 2) — somar os dois deixava o espaço
// antigo no evento pra sempre (atitude marketing 25/11/2026: 2 em 233 contratos).
export function padraoIdsOf(raws: any[]): Set<string> {
  const ids = new Set<string>();
  const scan = (rc: any) => {
    if (!rc) return;
    const fromList = (rc.padroes || []).map((p: any) => p?.padrao).filter(Boolean).map(String);
    if (fromList.length > 0) fromList.forEach((id: string) => ids.add(id));
    else if (rc.padrao_id) ids.add(String(rc.padrao_id));
  };
  for (const rc of raws) {
    scan(rc);
    for (const sec of rc?._secondary || []) scan(sec);
  }
  return ids;
}

export interface RemovableVenueLink { id: string; venueId: string; name: string }

/** Entre os espaços do evento cujo padrão (Venue.externalId) está em `orphanPadroes`, devolve os
 *  que podem sair sem perder nada: sem layout, sem playlist do Spotify, sem observação e sem
 *  resposta de pergunta EXCLUSIVA dele. Pergunta de espaço compartilhada com outro espaço que
 *  continua no evento não trava — a resposta segue valendo pro que fica (antes, "Vai ter Brinde?"
 *  — ligada ao Lounge 1, 2 e 3 — segurava o Lounge 1 num evento que já era só Lounge 3). */
export async function findRemovableVenueLinks(db: any, eventId: string, orphanPadroes: string[]): Promise<RemovableVenueLink[]> {
  if (orphanPadroes.length === 0) return [];
  const [links, allLinks] = await Promise.all([
    db.eventVenue.findMany({
      where: { eventId, venue: { externalId: { in: orphanPadroes } } },
      select: { id: true, venueId: true, notes: true, venue: { select: { name: true } }, _count: { select: { spotifyPlaylists: true } } },
    }),
    db.eventVenue.findMany({ where: { eventId }, select: { venueId: true } }),
  ]);
  const candidateIds = new Set<string>(links.map((l: any) => l.venueId));
  const keepIds: string[] = allLinks.map((l: any) => l.venueId as string).filter((id: string) => !candidateIds.has(id));

  const out: RemovableVenueLink[] = [];
  for (const l of links) {
    if (l.notes && String(l.notes).trim()) continue;
    const [answers, layouts] = await Promise.all([
      db.eventVenueAnswer.count({
        where: {
          eventId,
          question: {
            venueLinks: { some: { venueId: l.venueId } },
            ...(keepIds.length ? { NOT: { venueLinks: { some: { venueId: { in: keepIds } } } } } : {}),
          },
        },
      }),
      db.eventLayout.count({ where: { eventId, venueId: l.venueId } }),
    ]);
    if (answers === 0 && layouts === 0 && l._count.spotifyPlaylists === 0) out.push({ id: l.id, venueId: l.venueId, name: l.venue?.name ?? '' });
  }
  return out;
}
