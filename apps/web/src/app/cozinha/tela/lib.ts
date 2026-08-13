'use client';

import { useEffect, useRef, useState } from 'react';

// Toda formatação fixa o fuso de São Paulo: o PC da cozinha pode estar com relógio/fuso
// errado, e a tela não pode mostrar horário deslocado por causa disso.
const TZ = 'America/Sao_Paulo';

export function fmtTime(iso: string | Date | null | undefined): string {
  if (!iso) return '--:--';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return '--:--';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d);
}

/** "11/08" — data curta de um instante. */
export function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return '--/--';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return '--/--';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(d);
}

/** "SEG" — dia da semana curto e em caixa alta. */
export function fmtWeekday(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'short' })
    .format(d).replace('.', '').toUpperCase();
}

/** "11/08 19:32" — para linhas de histórico. */
export function fmtDateTimeShort(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

export function fmtDayLabel(dateKey: string): string {
  // dateKey é "YYYY-MM-DD" já no dia BRT (calculado no servidor). Constrói ao meio-dia UTC
  // pra não escorregar de dia na formatação.
  const d = new Date(`${dateKey}T12:00:00.000Z`);
  const weekday = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'short' }).format(d);
  const day = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(d);
  return `${weekday.replace('.', '').toUpperCase()} ${day}`;
}

export function isToday(dateKey: string): boolean {
  const todayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return dateKey === todayKey;
}

/** Relógio que atualiza a cada `ms` — usado no cabeçalho da tela. */
export function useNow(ms = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/**
 * Poll com as guardas que uma tela de cozinha precisa:
 * - não busca com a aba escondida (economiza request e evita rajada ao voltar)
 * - `paused` permite congelar durante drag ou enquanto o operador digita, senão a resposta
 *   do poll atropela o que ele está mexendo
 */
export function usePoll(fn: () => void | Promise<void>, intervalMs: number, paused = false) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (paused) return;
    let stopped = false;

    const tick = () => {
      if (stopped || document.hidden) return;
      void fnRef.current();
    };

    const t = setInterval(tick, intervalMs);
    return () => { stopped = true; clearInterval(t); };
  }, [intervalMs, paused]);
}

// Troca só a hora/minuto de um instante, mantendo o dia — no fuso de SP, com offset fixo
// (BRT não tem horário de verão desde 2019, mesmo padrão já usado no parse de horário do
// UERP). Usado tanto pelo clique direto na hora quanto pelo comando de voz de remarcar.
export function withTimeInSaoPaulo(baseIso: string, hh: number, mm: number): string {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(baseIso));
  const hhStr = String(hh).padStart(2, '0');
  const mmStr = String(mm).padStart(2, '0');
  return new Date(`${ymd}T${hhStr}:${mmStr}:00-03:00`).toISOString();
}

export const LS_KEY = 'telaCozinha:v1';
