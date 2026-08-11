'use client';

import { useState } from 'react';
import { Clock, Check, X } from 'lucide-react';
import { utcToLocalInput } from '@/lib/utils';

interface AbServiceTimeFieldsProps {
  eventId: string;
  itemId: string;
  serviceStartAt: string | null;
  serviceEndAt: string | null;
  /** Data do evento (ISO) — usada só pra pré-preencher o dia quando ainda não há horário. */
  eventStartAt?: string | null;
  onSaved?: (item: { serviceStartAt: string | null; serviceEndAt: string | null }) => void;
}

/** Editor do horário de serviço de um item de A&B. Usado na aba A&B e no Plano do Evento —
 *  uma implementação só, pros dois lugares não divergirem. O horário salvo aparece no
 *  cronograma como linha tracejada (merge visual, sem criar item de cronograma). */
export default function AbServiceTimeFields({
  eventId,
  itemId,
  serviceStartAt,
  serviceEndAt,
  eventStartAt,
  onSaved,
}: AbServiceTimeFieldsProps) {
  // Pré-preenche o dia com a data do evento pro operador só digitar a hora.
  const dayPrefill = eventStartAt ? utcToLocalInput(eventStartAt).slice(0, 10) : '';
  const [start, setStart] = useState(serviceStartAt ? utcToLocalInput(serviceStartAt) : '');
  const [end, setEnd] = useState(serviceEndAt ? utcToLocalInput(serviceEndAt) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState(false);

  const dirty =
    start !== (serviceStartAt ? utcToLocalInput(serviceStartAt) : '') ||
    end !== (serviceEndAt ? utcToLocalInput(serviceEndAt) : '');

  async function save() {
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`/api/v2/events/${eventId}/items/${itemId}/service-times`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceStartAt: start ? new Date(start).toISOString() : null,
          serviceEndAt: end ? new Date(end).toISOString() : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || 'Erro ao salvar horário.');
      setSavedAt(true);
      setTimeout(() => setSavedAt(false), 2500);
      onSaved?.({
        serviceStartAt: data.item?.serviceStartAt ?? null,
        serviceEndAt: data.item?.serviceEndAt ?? null,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setStart('');
    setEnd('');
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`/api/v2/events/${eventId}/items/${itemId}/service-times`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceStartAt: null, serviceEndAt: null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Erro ao limpar horário.');
      }
      onSaved?.({ serviceStartAt: null, serviceEndAt: null });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="size-4 text-primary" />
        <span className="text-sm font-medium">Horário de serviço</span>
        {savedAt && (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <Check className="size-3" /> salvo
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">
          <span className="block mb-1">Início</span>
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            min={dayPrefill ? `${dayPrefill}T00:00` : undefined}
            className="rounded border bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          <span className="block mb-1">Fim</span>
          <input
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            min={start || undefined}
            className="rounded border bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>

        <button
          onClick={save}
          disabled={saving || !dirty || !start}
          className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>

        {(serviceStartAt || serviceEndAt) && (
          <button
            onClick={clear}
            disabled={saving}
            className="flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            <X className="size-3" /> limpar
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <p className="mt-2 text-xs text-muted-foreground">
        Aparece no cronograma do evento e na TELA COZINHA.
      </p>
    </div>
  );
}
