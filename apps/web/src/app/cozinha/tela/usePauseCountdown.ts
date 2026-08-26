'use client';

import { useEffect, useRef, useState } from 'react';

/** Contagem regressiva local da pausa. Não depende do relógio compartilhado da tela (useNow,
 *  10s) nem de push do servidor — pauseUntil já veio uma vez no payload de /service, e daqui
 *  em diante é só Date.now() a cada segundo. onExpire dispara UMA vez quando o relógio local
 *  zera, pra reconciliar com o servidor sem esperar o poll de 60s (o servidor já teria o
 *  deslocamento certo desde a criação da pausa — isso só limpa a faixa mais rápido). */
export function usePauseCountdown(pauseUntil: string | null, onExpire: () => void): number {
  const [remainingMs, setRemainingMs] = useState(() =>
    pauseUntil ? new Date(pauseUntil).getTime() - Date.now() : 0);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!pauseUntil) return;
    const until = new Date(pauseUntil).getTime();
    let fired = false;

    const tick = () => {
      const left = until - Date.now();
      setRemainingMs(left);
      if (left <= 0 && !fired) { fired = true; onExpireRef.current(); }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [pauseUntil]);

  return Math.max(0, remainingMs);
}

/** "04:37" — mm:ss, igual ao resto da tela (relógio grande, tabular-nums). */
export function fmtCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const mm = Math.floor(totalSec / 60).toString().padStart(2, '0');
  const ss = (totalSec % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}
