'use client';

import { useState } from 'react';
import {
  Users, ChevronUp, ChevronDown, Copy, Trash2, Check, Plus, Wand2,
  MessageSquare, AlertTriangle, UtensilsCrossed, CalendarClock, GripVertical,
} from 'lucide-react';
import { fmtTime } from './lib';

export interface ServiceEntry {
  id: string;
  eventItemId: string | null;
  sourceLabel: string | null;
  itemName: string;
  serveAt: string;
  order: number;
  round: number;
  portionsPerPerson: number;
  manualQuantity: number | null;
  status: string;
  notes: string | null;
  demand: { quantity: number; basis: 'manual' | 'calculado' };
  orphan: boolean;
  packageMissing: boolean;
}

export interface ServicePackage {
  eventItemId: string;
  name: string;
  quantity: number;
  unit: string | null;
  serviceStartAt: string | null;
  serviceEndAt: string | null;
  chosenItems: { itemName: string; sourceLabel: string | null }[];
  comments: { id: string; content: string; createdAt: string; user: { name: string } | null }[];
}

export interface ServiceData {
  event: { id: string; name: string; clientName: string; startAt: string | null; venues: { id: string; name: string }[] };
  headcount: { effective: number; checkedIn: number; contracted: number; isEstimate: boolean };
  packages: ServicePackage[];
  plan: { id: string | null; intervalMinutes: number; anchorAt: string | null; entries: ServiceEntry[] };
  schedule: {
    activities: { id: string; name: string; description: string | null; startAt: string; endAt: string; team: { id: string; name: string } | null; isKitchen: boolean }[];
    abServiceEntries: { eventItemId: string; name: string; startAt: string; endAt: string | null }[];
  };
}

interface Props {
  data: ServiceData;
  onMutate: () => void;
  onBusyChange: (busy: boolean) => void;
}

export default function ServicePanel({ data, onMutate, onBusyChange }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const { headcount, plan, packages, schedule } = data;
  const entries = plan.entries;

  async function call(url: string, init?: RequestInit) {
    setWorking(true);
    onBusyChange(true);
    try {
      const res = await fetch(url, { credentials: 'include', ...init });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Falha na operação.');
      }
      onMutate();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setWorking(false);
      onBusyChange(false);
    }
  }

  const eventId = data.event.id;
  const json = (body: any): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  function reorder(ids: string[]) {
    return call(`/api/v2/kitchen/display/events/${eventId}/plan/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryIds: ids }),
    });
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...entries];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorder(next.map(e => e.id));
  }

  function generateSuggested() {
    // Todos os itens escolhidos que ainda não estão na sequência, espaçados pelo intervalo.
    const already = new Set(entries.map(e => e.itemName.toLowerCase()));
    const items = packages.flatMap(pkg =>
      pkg.chosenItems
        .filter(c => !already.has(c.itemName.toLowerCase()))
        .map(c => ({ eventItemId: pkg.eventItemId, sourceLabel: c.sourceLabel, itemName: c.itemName }))
    );
    if (items.length === 0) { alert('Todos os itens escolhidos já estão na sequência.'); return; }
    call(`/api/v2/kitchen/display/events/${eventId}/plan/entries/bulk`, json({ items }));
  }

  // Itens escolhidos que ainda não entraram na sequência — a marcação é manual, então esta
  // lista é a fonte pro operador escolher o que serve.
  const inSequence = new Set(entries.map(e => e.itemName.toLowerCase()));
  const available = packages.flatMap(pkg =>
    pkg.chosenItems.map(c => ({ ...c, pkg })).filter(c => !inSequence.has(c.itemName.toLowerCase()))
  );

  const allComments = packages.flatMap(p => p.comments.map(c => ({ ...c, pkgName: p.name })));

  return (
    <div className="space-y-3">
      {/* Cabeçalho: pessoas */}
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-5xl font-bold leading-none tabular-nums text-slate-900">{headcount.effective}</p>
            <p className="mt-1 flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
              <Users className="size-3.5" />
              {headcount.isEstimate ? 'pessoas (contratado)' : 'presentes — acumulado'}
            </p>
          </div>
          {headcount.isEstimate ? (
            <span className="rounded bg-amber-100 px-2 py-1 text-right text-[11px] font-bold leading-tight text-amber-700">
              ESTIMADO<br />sem check-in
            </span>
          ) : (
            <span className="text-right text-[11px] leading-tight text-slate-400">
              contratado: {headcount.contracted}
            </span>
          )}
        </div>
        {!headcount.isEstimate && (
          <p className="mt-2 text-[11px] leading-snug text-slate-400">
            Não há registro de saída de convidado — o número só cresce ao longo da noite.
          </p>
        )}
      </div>

      {/* Sequência de serviço */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
            <UtensilsCrossed className="size-4" /> Sequência de serviço
          </h3>
          <div className="flex gap-1.5">
            <button
              onClick={generateSuggested}
              disabled={working}
              className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-40"
              title={`Adiciona os itens escolhidos espaçados de ${plan.intervalMinutes} em ${plan.intervalMinutes} min`}
            >
              <Wand2 className="size-3.5" /> gerar {plan.intervalMinutes}min
            </button>
            <button
              onClick={() => setShowAdd(v => !v)}
              disabled={working}
              className="flex items-center gap-1 rounded bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40"
            >
              <Plus className="size-3.5" /> item
            </button>
          </div>
        </div>

        {/* Escolher item pra entrar na sequência */}
        {showAdd && (
          <div className="mb-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2">
            {available.length === 0 ? (
              <p className="text-xs text-slate-500">Todos os itens escolhidos já estão na sequência.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {available.map(c => (
                  <button
                    key={`${c.pkg.eventItemId}-${c.itemName}`}
                    onClick={() =>
                      call(`/api/v2/kitchen/display/events/${eventId}/plan/entries`,
                        json({ eventItemId: c.pkg.eventItemId, sourceLabel: c.sourceLabel, itemName: c.itemName }))
                    }
                    className="rounded border border-emerald-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-emerald-100"
                  >
                    + {c.itemName}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {entries.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400">
            Nenhuma saída montada. Use "gerar {plan.intervalMinutes}min" ou adicione item por item.
          </p>
        ) : (
          <div className="space-y-1.5">
            {entries.map((e, i) => (
              <div
                key={e.id}
                draggable
                onDragStart={() => setDragId(e.id)}
                onDragOver={ev => ev.preventDefault()}
                onDrop={() => {
                  if (!dragId || dragId === e.id) return;
                  const ids = entries.map(x => x.id);
                  const from = ids.indexOf(dragId);
                  const to = ids.indexOf(e.id);
                  ids.splice(to, 0, ids.splice(from, 1)[0]);
                  setDragId(null);
                  reorder(ids);
                }}
                className={`rounded-lg border p-2 shadow-sm ${
                  e.status === 'served'
                    ? 'border-slate-200 bg-slate-50 opacity-60'
                    : e.orphan || e.packageMissing
                      ? 'border-red-300 bg-red-50'
                      : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <GripVertical className="size-4 shrink-0 cursor-grab text-slate-300" />

                  <span className="w-14 shrink-0 text-lg font-bold tabular-nums text-emerald-600">
                    {fmtTime(e.serveAt)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className={`font-medium leading-tight ${e.orphan ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                      {e.itemName}
                      {e.round > 1 && (
                        <span className="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 align-middle text-[10px] text-slate-600">
                          {e.round}ª vez
                        </span>
                      )}
                    </p>
                    {e.orphan && (
                      <p className="flex items-center gap-1 text-[11px] text-red-600">
                        <AlertTriangle className="size-3" /> não está mais no cardápio
                      </p>
                    )}
                    {!e.orphan && e.packageMissing && (
                      <p className="text-[11px] text-red-600">pacote de origem removido</p>
                    )}
                    {e.sourceLabel && !e.orphan && (
                      <p className="truncate text-[11px] text-slate-400">{e.sourceLabel}</p>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-xl font-bold leading-none tabular-nums text-slate-900">{e.demand.quantity}</p>
                    <p className="text-[10px] uppercase text-slate-400">
                      {e.demand.basis === 'manual' ? 'manual' : 'porções'}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col gap-0.5">
                    <button onClick={() => move(i, -1)} disabled={i === 0 || working}
                      className="rounded border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-25" title="Subir">
                      <ChevronUp className="size-3.5" />
                    </button>
                    <button onClick={() => move(i, 1)} disabled={i === entries.length - 1 || working}
                      className="rounded border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-25" title="Descer">
                      <ChevronDown className="size-3.5" />
                    </button>
                  </div>

                  <div className="flex shrink-0 flex-col gap-0.5">
                    <button
                      onClick={() => call(`/api/v2/kitchen/display/plan/entries/${e.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: e.status === 'served' ? 'pending' : 'served' }),
                      })}
                      disabled={working}
                      className={`rounded border p-1 ${
                        e.status === 'served'
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-slate-200 bg-white text-slate-500 hover:bg-emerald-50 hover:text-emerald-600'
                      }`}
                      title={e.status === 'served' ? 'Desmarcar' : 'Marcar como servido'}
                    >
                      <Check className="size-3.5" />
                    </button>
                    <button
                      onClick={() => call(`/api/v2/kitchen/display/plan/entries/${e.id}/duplicate`, json({}))}
                      disabled={working}
                      className="rounded border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-100"
                      title="Servir de novo mais tarde"
                    >
                      <Copy className="size-3.5" />
                    </button>
                    <button
                      onClick={() => call(`/api/v2/kitchen/display/plan/entries/${e.id}`, { method: 'DELETE' })}
                      disabled={working}
                      className="rounded border border-slate-200 bg-white p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Remover"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Observações de A&B */}
      {allComments.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-700">
            <MessageSquare className="size-4" /> Observações de A&amp;B
          </h3>
          <div className="space-y-1.5">
            {allComments.map(c => (
              <div key={c.id} className="rounded-lg border border-amber-300 bg-amber-50 p-2">
                <p className="text-[11px] font-semibold text-amber-700">{c.pkgName}</p>
                <p className="whitespace-pre-wrap text-sm leading-snug text-slate-800">{c.content}</p>
                {c.user && <p className="mt-0.5 text-[10px] text-slate-400">{c.user.name}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cronograma — Cozinha com destaque forte */}
      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-700">
          <CalendarClock className="size-4" /> Cronograma
        </h3>
        {schedule.activities.length === 0 ? (
          <p className="text-xs text-slate-400">Nenhuma atividade no cronograma.</p>
        ) : (
          <div className="space-y-1.5">
            {schedule.activities.map(a => (
              <div
                key={a.id}
                className={
                  a.isKitchen
                    ? 'rounded-lg border-2 border-emerald-500 bg-emerald-50 p-3 shadow-sm'
                    : 'rounded-lg border border-slate-200 bg-white p-2'
                }
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className={`font-bold tabular-nums ${a.isKitchen ? 'text-xl text-emerald-700' : 'text-sm text-slate-500'}`}>
                    {fmtTime(a.startAt)}–{fmtTime(a.endAt)}
                  </span>
                  <span className={a.isKitchen ? 'text-lg font-bold text-slate-900' : 'text-sm text-slate-600'}>
                    {a.name}
                  </span>
                  {a.team && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      a.isKitchen ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {a.team.name}
                    </span>
                  )}
                </div>
                {a.description && (
                  <p className={`mt-1 whitespace-pre-wrap leading-snug ${a.isKitchen ? 'text-sm text-slate-700' : 'text-xs text-slate-400'}`}>
                    {a.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
