'use client';

import { useState } from 'react';
import { Clock, Check, X, Plus, Trash2 } from 'lucide-react';
import { utcToLocalInput } from '@/lib/utils';

const MAX_WINDOWS = 3;

interface ServiceWindow {
  startAt: string;
  endAt: string;
}

interface DraftRow {
  start: string;
  end: string;
}

interface AbServiceTimeFieldsProps {
  eventId: string;
  itemId: string;
  windows: ServiceWindow[];
  /** Data do evento (ISO) — usada só pra pré-preencher o dia quando ainda não há horário. */
  eventStartAt?: string | null;
  /** Categoria do item — só muda o texto de rodapé (TELA COZINHA é exclusiva de A&B). */
  category?: 'ab' | 'entretenimento';
  onSaved?: (windows: ServiceWindow[]) => void;
}

function toDraftRows(windows: ServiceWindow[]): DraftRow[] {
  return windows.map(w => ({ start: utcToLocalInput(w.startAt), end: utcToLocalInput(w.endAt) }));
}

function sameRows(a: DraftRow[], b: DraftRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, i) => row.start === b[i].start && row.end === b[i].end);
}

/** Editor de horário de início/fim de um item de A&B ou Entretenimento — permite até 3 janelas
 *  (ex.: 20h-21h + 21h30-22h + 22h30-23h30). Usado na aba A&B, na aba Entretenimento e no Plano
 *  do Evento — uma implementação só, pros lugares não divergirem. Os horários salvos aparecem
 *  no cronograma como linhas tracejadas (merge visual, sem criar item de cronograma de verdade),
 *  uma por janela. */
export default function AbServiceTimeFields({
  eventId,
  itemId,
  windows,
  eventStartAt,
  category = 'ab',
  onSaved,
}: AbServiceTimeFieldsProps) {
  // Pré-preenche o dia com a data do evento pro operador só digitar a hora.
  const dayPrefill = eventStartAt ? utcToLocalInput(eventStartAt).slice(0, 10) : '';
  const [rows, setRows] = useState<DraftRow[]>(() => (windows.length > 0 ? toDraftRows(windows) : [{ start: '', end: '' }]));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState(false);

  const savedRows = windows.length > 0 ? toDraftRows(windows) : [{ start: '', end: '' }];
  const dirty = !sameRows(rows, savedRows);
  const validRows = rows.filter(r => r.start && r.end);

  function updateRow(idx: number, field: 'start' | 'end', value: string) {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    if (rows.length >= MAX_WINDOWS) return;
    setRows(prev => [...prev, { start: '', end: '' }]);
  }

  function removeRow(idx: number) {
    setRows(prev => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length > 0 ? next : [{ start: '', end: '' }];
    });
  }

  async function persist(payload: ServiceWindow[]) {
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`/api/v2/events/${eventId}/items/${itemId}/service-times`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ windows: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || 'Erro ao salvar horário.');
      const saved: ServiceWindow[] = data.item?.windows ?? [];
      setRows(saved.length > 0 ? toDraftRows(saved) : [{ start: '', end: '' }]);
      setSavedAt(true);
      setTimeout(() => setSavedAt(false), 2500);
      onSaved?.(saved);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function save() {
    persist(
      validRows.map(r => ({
        startAt: new Date(r.start).toISOString(),
        endAt: new Date(r.end).toISOString(),
      })),
    );
  }

  function clear() {
    setRows([{ start: '', end: '' }]);
    persist([]);
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

      <div className="space-y-2">
        {rows.map((row, idx) => (
          <div key={idx} className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-muted-foreground">
              <span className="block mb-1">Início</span>
              <input
                type="datetime-local"
                value={row.start}
                onChange={(e) => updateRow(idx, 'start', e.target.value)}
                min={dayPrefill ? `${dayPrefill}T00:00` : undefined}
                className="rounded border bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              <span className="block mb-1">Fim</span>
              <input
                type="datetime-local"
                value={row.end}
                onChange={(e) => updateRow(idx, 'end', e.target.value)}
                min={row.start || undefined}
                className="rounded border bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            {rows.length > 1 && (
              <button
                onClick={() => removeRow(idx)}
                disabled={saving}
                className="flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                <Trash2 className="size-3" /> remover
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-3">
        {rows.length < MAX_WINDOWS && (
          <button
            onClick={addRow}
            disabled={saving}
            className="flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <Plus className="size-3" /> adicionar horário
          </button>
        )}

        <button
          onClick={save}
          disabled={saving || !dirty || validRows.length === 0}
          className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Salvar'}
        </button>

        {windows.length > 0 && (
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
        {category === 'ab' ? 'Aparece no cronograma do evento e na TELA COZINHA.' : 'Aparece no cronograma do evento.'}
        {' '}Até {MAX_WINDOWS} janelas de horário.
      </p>
    </div>
  );
}
