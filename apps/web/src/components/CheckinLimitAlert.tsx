'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ShieldAlert, ChevronDown } from 'lucide-react';

interface Limit {
  enabled: boolean;
  contracted: number | null;
  tolerance: number;
  baseLimit: number | null;
  released: number;
  limit: number | null;
  checkedIn: number;
  level: 'ok' | 'warning' | 'blocked';
  remaining: number | null;
}
interface Release { id: string; extraGuests: number; reason: string; releasedByName: string; createdAt: string }

// Alerta do limite de check-in por A&B contratado (+10%): aparece na tela do evento quando o contratado
// foi atingido (aviso) ou quando os 10% acabaram e a recepção travou (liberação com motivo obrigatório).
export default function CheckinLimitAlert({ eventId, active }: { eventId: string; active: boolean }) {
  const [limit, setLimit] = useState<Limit | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [extra, setExtra] = useState('5');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  async function load() {
    try {
      const r = await fetch(`/api/v2/events/${eventId}/checkin-limit`, { credentials: 'include' });
      if (!r.ok) return;
      const d = await r.json();
      setLimit(d.limit ?? null);
      setReleases(d.releases ?? []);
    } catch { /* silent */ }
  }

  useEffect(() => {
    if (!active) return;
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [eventId, active]);

  async function release() {
    const n = Number(extra);
    if (!Number.isInteger(n) || n < 1) { setError('Informe quantas pessoas liberar (1 ou mais).'); return; }
    if (reason.trim().length < 5) { setError('Explique o motivo da liberação (mínimo 5 caracteres).'); return; }
    setSaving(true);
    setError('');
    try {
      const r = await fetch(`/api/v2/events/${eventId}/checkin-limit/release`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extraGuests: n, reason: reason.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || 'Não foi possível liberar.'); return; }
      setReason('');
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (!active || !limit?.enabled || limit.level === 'ok') return null;

  const blocked = limit.level === 'blocked';
  return (
    <div className={`mb-4 rounded-xl border px-4 py-3 ${blocked ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
      <div className="flex items-start gap-2">
        {blocked
          ? <ShieldAlert size={16} className="text-red-600 mt-0.5 shrink-0" />
          : <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />}
        <div className="flex-1">
          {blocked ? (
            <>
              <p className="text-sm font-medium text-red-900">
                Check-in travado na recepção — limite de {limit.limit} pessoas atingido
              </p>
              <p className="text-xs text-red-800 mt-1">
                {limit.checkedIn} check-ins · {limit.contracted} de A&amp;B contratado + {limit.tolerance} adicionais (10%)
                {limit.released > 0 ? ` + ${limit.released} já liberadas` : ''}. A recepção só volta a fazer check-in quando você liberar mais pessoas, explicando o motivo.
              </p>
              <div className="mt-2 flex flex-wrap items-start gap-2">
                <label className="text-xs text-red-900 flex items-center gap-1.5">
                  Liberar +
                  <input
                    type="number" min={1} value={extra} onChange={e => setExtra(e.target.value)}
                    className="w-16 px-2 py-1 border border-red-300 rounded bg-white text-sm"
                  />
                  pessoas
                </label>
                <textarea
                  value={reason} onChange={e => setReason(e.target.value)} rows={2}
                  placeholder="Motivo da liberação (obrigatório): ex. cliente confirmou mais convidados, acordado com o comercial…"
                  className="flex-1 min-w-[16rem] px-2 py-1 border border-red-300 rounded bg-white text-sm resize-none"
                />
                <button
                  onClick={release} disabled={saving}
                  className="px-3 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
                >
                  {saving ? 'Liberando…' : 'Liberar check-in'}
                </button>
              </div>
              {error && <p className="text-xs text-red-700 mt-1.5">{error}</p>}
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-amber-900">
                A&amp;B contratado atingido: {limit.checkedIn} check-ins para {limit.contracted} pessoas
              </p>
              <p className="text-xs text-amber-800 mt-1">
                Os check-ins estão usando os 10% adicionais — {limit.remaining === 1 ? 'falta 1 check-in' : `faltam ${limit.remaining} check-ins`} para
                travar a recepção (limite {limit.limit}). Quando travar, a liberação é feita aqui.
              </p>
            </>
          )}
          {releases.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowHistory(v => !v)}
                className={`text-xs flex items-center gap-1 hover:underline ${blocked ? 'text-red-800' : 'text-amber-800'}`}
              >
                Liberações anteriores ({releases.length}) <ChevronDown size={12} className={showHistory ? 'rotate-180' : ''} />
              </button>
              {showHistory && (
                <ul className="mt-1 space-y-1 text-xs text-foreground/80">
                  {releases.map(r => (
                    <li key={r.id}>
                      <strong>+{r.extraGuests}</strong> por {r.releasedByName} em {new Date(r.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} — {r.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
