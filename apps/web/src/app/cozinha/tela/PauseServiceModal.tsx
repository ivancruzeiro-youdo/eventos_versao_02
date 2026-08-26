'use client';

import { useState } from 'react';
import { X, PauseCircle } from 'lucide-react';
import type { Res } from './useServiceCommands';

const DURATIONS = [5, 10, 15, 20, 30] as const;

interface Props {
  onConfirm: (minutes: number, reason: string) => Promise<Res>;
  onClose: () => void;
}

export default function PauseServiceModal({ onConfirm, onClose }: Props) {
  const [minutes, setMinutes] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!minutes || !reason.trim()) return;
    setSaving(true);
    setError(null);
    const res = await onConfirm(minutes, reason.trim());
    setSaving(false);
    if (!res.ok) { setError(res.error); return; }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-background w-full max-w-md overflow-hidden rounded-2xl shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <PauseCircle className="size-4" /> Pausar serviço
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition"><X size={18} /></button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-sm font-medium">Motivo da pausa</label>
            <textarea
              autoFocus rows={2} maxLength={200}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="ex.: aguardando liberação do salão, atraso da cerimônia…"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Duração</label>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map(m => (
                <button
                  key={m}
                  onClick={() => setMinutes(m)}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                    minutes === m ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {m} min
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-lg border px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
            <button
              onClick={submit}
              disabled={saving || !minutes || !reason.trim()}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-40"
            >
              {saving ? 'Pausando…' : 'Pausar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
