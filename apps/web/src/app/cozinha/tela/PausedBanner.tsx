'use client';

import { PauseCircle } from 'lucide-react';
import { usePauseCountdown, fmtCountdown } from './usePauseCountdown';
import type { Res } from './useServiceCommands';

interface Props {
  pause: { reason: string; pausedAt: string; pauseUntil: string };
  onResume: () => Promise<Res>;
  onExpire: () => void;
  working: boolean;
}

export default function PausedBanner({ pause, onResume, onExpire, working }: Props) {
  const remainingMs = usePauseCountdown(pause.pauseUntil, onExpire);

  return (
    <div className="rounded-lg border-4 border-sky-500 bg-sky-50 p-3">
      <div className="flex items-center gap-2">
        <PauseCircle className="size-7 shrink-0 text-sky-700" />
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-black leading-none text-sky-800">SERVIÇO PAUSADO</p>
          <p className="mt-1 truncate text-sm text-sky-700">{pause.reason}</p>
        </div>
        <p className="shrink-0 text-3xl font-black tabular-nums text-sky-800">{fmtCountdown(remainingMs)}</p>
        <button
          onClick={onResume}
          disabled={working}
          className="shrink-0 rounded bg-sky-700 px-3 py-1.5 text-sm font-bold text-white hover:bg-sky-800 disabled:opacity-40"
        >
          Retomar agora
        </button>
      </div>
    </div>
  );
}
