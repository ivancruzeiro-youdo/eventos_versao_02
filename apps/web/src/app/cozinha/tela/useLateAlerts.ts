'use client';

// Alerta de atraso: saída que passou da hora e não foi marcada como servida.
//
// Cálculo 100% no cliente e sem endpoint novo — `serveAt` e `status` já estão na tela, e
// atraso é função pura de horário contra o relógio. Isso também significa que o alerta aparece
// no segundo em que vence, sem esperar o poll de 60s.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ServiceEntry } from './ServicePanel';

/** Tolerância antes de considerar atrasado. Ninguém serve no segundo exato, e alarmar aos
 *  20:00:30 de uma saída marcada 20:00 destruiria a confiança no alerta. */
export const GRACE_MS = 2 * 60_000;
/** A partir daqui é crítico: destaque mais forte e novo anúncio. */
export const CRITICAL_MS = 10 * 60_000;
/** Acima disso não alarma: é evento antigo sendo revisado, não atraso acontecendo. */
const STALE_MS = 3 * 60 * 60_000;

export type LateTier = 'atrasado' | 'critico';

export interface LateItem {
  entry: ServiceEntry;
  lateMs: number;
  tier: LateTier;
  label: string;
}

interface Opts {
  entries: ServiceEntry[];
  /** Só o modo dia tem sequência de serviço. */
  active: boolean;
  now: Date;
  /** Chamado uma vez por item por faixa — nunca em loop. */
  onAnnounce?: (items: LateItem[], tier: LateTier) => void;
}

export function useLateAlerts({ entries, active, now, onAnnounce }: Opts) {
  // Silenciados pelo operador ("ciente") e já anunciados: ambos em memória de propósito.
  // Se a tela recarregar e o item continuar atrasado, alarmar de novo é o certo.
  const [acked, setAcked] = useState<Set<string>>(new Set());
  const announced = useRef<Map<string, LateTier>>(new Map());
  const announceRef = useRef(onAnnounce);
  announceRef.current = onAnnounce;

  const late = useMemo<LateItem[]>(() => {
    if (!active) return [];
    const t = now.getTime();
    const out: LateItem[] = [];

    for (const e of entries) {
      // 'skipped' foi decisão de não servir — não é atraso.
      if (e.status !== 'pending') continue;
      // Órfão já é sinalizado como "não está mais no cardápio"; somar alarme de atraso em cima
      // só faria ruído.
      if (e.orphan) continue;

      const due = new Date(e.serveAt).getTime();
      if (isNaN(due)) continue;
      const lateMs = t - due - GRACE_MS;
      if (lateMs <= 0) continue;
      // Guarda contra abrir um evento antigo e a tela inteira gritar.
      if (t - due > STALE_MS) continue;

      const kindLabel = e.entryKind === 'item' ? '' :
        e.entryKind === 'montagem' ? 'Montagem — ' :
        e.entryKind === 'reposicao' ? 'Reposição — ' : 'Desmontagem — ';

      out.push({
        entry: e,
        lateMs,
        tier: lateMs >= CRITICAL_MS - GRACE_MS ? 'critico' : 'atrasado',
        label: `${kindLabel}${e.itemName}`,
      });
    }

    return out.sort((a, b) => b.lateMs - a.lateMs);
  }, [entries, active, now]);

  const visible = useMemo(() => late.filter(l => !acked.has(l.entry.id)), [late, acked]);

  // Anuncia só a transição: entrou em atraso, ou piorou para crítico. Repetir a cada tick
  // viraria alarme constante e a cozinha desligaria o som no primeiro turno.
  useEffect(() => {
    const fresh: LateItem[] = [];
    let tier: LateTier = 'atrasado';
    for (const l of visible) {
      const prev = announced.current.get(l.entry.id);
      if (prev === l.tier || (prev === 'critico' && l.tier === 'atrasado')) continue;
      announced.current.set(l.entry.id, l.tier);
      fresh.push(l);
      if (l.tier === 'critico') tier = 'critico';
    }
    // Limpa quem saiu do atraso, pra alarmar de novo se voltar a atrasar.
    const stillLate = new Set(visible.map(l => l.entry.id));
    for (const id of [...announced.current.keys()]) {
      if (!stillLate.has(id)) announced.current.delete(id);
    }
    if (fresh.length > 0) announceRef.current?.(fresh, tier);
  }, [visible]);

  return {
    late: visible,
    /** Todos os atrasados, inclusive os que o operador deu ciente — a linha continua marcada. */
    allLate: late,
    lateIds: useMemo(() => new Set(late.map(l => l.entry.id)), [late]),
    criticalCount: visible.filter(l => l.tier === 'critico').length,
    ack: (entryId: string) => setAcked(prev => new Set(prev).add(entryId)),
    ackAll: () => setAcked(new Set(late.map(l => l.entry.id))),
    tierOf: (entryId: string): LateTier | null =>
      late.find(l => l.entry.id === entryId)?.tier ?? null,
  };
}

/** "3 min" / "1h 12min" — texto curto pra caber na faixa. */
export function fmtLate(ms: number): string {
  const totalMin = Math.max(1, Math.floor((ms + GRACE_MS) / 60_000));
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}
