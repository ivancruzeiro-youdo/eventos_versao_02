'use client';

import { useState } from 'react';
import { Users, AlertTriangle, Check, Wine, LayoutGrid } from 'lucide-react';
import { fmtTime, fmtDayLabel, isToday } from './lib';

export interface WeekPackage {
  eventItemId: string;
  name: string;
  quantity: number;
  unit: string | null;
  kind: 'comida' | 'estacao' | 'bebida';
  serviceStartAt: string | null;
  serviceEndAt: string | null;
  chosenItems: { itemName: string; sourceLabel: string | null }[];
  prepChecked: boolean;
}

export interface WeekEvent {
  id: string;
  name: string;
  clientName: string;
  status: string;
  startAt: string | null;
  setupAt: string | null;
  headcount?: { effective: number; isEstimate: boolean; contracted: number; checkedIn: number };
  packages: WeekPackage[];
  hiddenDrinks: string[];
  prepChecks: { itemName: string; checkedAt: string; checkedByName: string | null }[];
}

export interface WeekDay { date: string; events: WeekEvent[] }

interface Props {
  days: WeekDay[];
  onToggleCheck: (eventId: string, eventItemId: string | null, itemName: string, checked: boolean) => Promise<void>;
}

/** Modo 1 — próximos 7 dias de um espaço, com check de produção por item.
 *  Dias sem evento colapsam numa linha fina pra semana caber sem rolagem. */
export default function WeekPanel({ days, onToggleCheck }: Props) {
  // Marcação otimista: a cozinha clica e vê na hora; o poll reconcilia depois.
  const [pending, setPending] = useState<Record<string, boolean>>({});

  async function toggle(ev: WeekEvent, pkg: WeekPackage | null, itemName: string, current: boolean) {
    const key = `${ev.id}|${itemName.toLowerCase()}`;
    setPending(p => ({ ...p, [key]: !current }));
    try {
      await onToggleCheck(ev.id, pkg?.eventItemId ?? null, itemName, !current);
    } catch {
      setPending(p => { const n = { ...p }; delete n[key]; return n; });
    }
  }

  function isChecked(ev: WeekEvent, itemName: string, fallback: boolean): boolean {
    const key = `${ev.id}|${itemName.toLowerCase()}`;
    return pending[key] ?? fallback;
  }

  return (
    <div className="space-y-1.5">
      {days.map(day => {
        const today = isToday(day.date);

        if (day.events.length === 0) {
          return (
            <div
              key={day.date}
              className={`flex items-center gap-2 rounded px-2 py-1 text-xs ${
                today ? 'bg-emerald-50 text-emerald-700' : 'text-slate-400'
              }`}
            >
              <span className="font-semibold">{fmtDayLabel(day.date)}</span>
              {today && <span className="text-[10px] font-bold">HOJE</span>}
              <span className="text-slate-300">·</span>
              <span className="text-slate-400">sem eventos</span>
            </div>
          );
        }

        return (
          <div
            key={day.date}
            className={`rounded-lg border ${today ? 'border-emerald-400 bg-emerald-50/60' : 'border-slate-200 bg-white'}`}
          >
            <div className={`flex items-center gap-2 px-2.5 py-1.5 text-xs font-bold ${today ? 'text-emerald-700' : 'text-slate-500'}`}>
              {fmtDayLabel(day.date)}
              {today && <span className="rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] text-white">HOJE</span>}
            </div>

            <div className="space-y-1.5 px-2 pb-2">
              {day.events.map(ev => {
                const checkByName = new Map(ev.prepChecks.map(c => [c.itemName.toLowerCase(), c]));
                return (
                  <div key={ev.id} className="rounded-md border border-slate-200 bg-white p-2.5 shadow-sm">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{ev.clientName || ev.name}</p>
                        <p className="text-xs font-medium text-slate-500">{fmtTime(ev.startAt ?? ev.setupAt)}</p>
                      </div>
                      {ev.headcount && (
                        <div className="shrink-0 text-right">
                          <p className="text-2xl font-bold leading-none tabular-nums text-slate-900">
                            {ev.headcount.effective}
                          </p>
                          <p className="flex items-center justify-end gap-1 text-[10px] uppercase tracking-wide text-slate-400">
                            <Users className="size-3" /> pessoas
                          </p>
                          {ev.headcount.isEstimate && (
                            <span className="text-[10px] font-medium text-amber-600">contratado</span>
                          )}
                        </div>
                      )}
                    </div>

                    {ev.packages.length === 0 ? (
                      <p className="text-xs text-slate-400">Nenhum item de cozinha.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {ev.packages.map(pkg => {
                          // Estação não tem item pra checar individualmente — o check é do pacote.
                          const units = pkg.kind === 'estacao' || pkg.chosenItems.length === 0
                            ? [{ itemName: pkg.name, isPackage: true }]
                            : pkg.chosenItems.map(c => ({ itemName: c.itemName, isPackage: false }));

                          return (
                            <div key={pkg.eventItemId} className="text-xs">
                              <div className="flex flex-wrap items-baseline gap-x-2">
                                <span className="font-medium text-slate-800">{pkg.name}</span>
                                {pkg.kind === 'estacao' && (
                                  <span className="inline-flex items-center gap-0.5 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                                    <LayoutGrid className="size-2.5" /> estação
                                  </span>
                                )}
                                {pkg.serviceStartAt && (
                                  <span className="font-semibold text-emerald-600">
                                    {fmtTime(pkg.serviceStartAt)}
                                    {pkg.serviceEndAt && `–${fmtTime(pkg.serviceEndAt)}`}
                                  </span>
                                )}
                                <span className="text-slate-400">{pkg.quantity} {pkg.unit || 'pessoas'}</span>
                              </div>

                              {pkg.chosenItems.length === 0 && pkg.kind !== 'estacao' && (
                                <p className="mt-0.5 flex items-center gap-1 text-amber-600">
                                  <AlertTriangle className="size-3" />
                                  cliente ainda não escolheu os itens
                                </p>
                              )}

                              {/* Check de produzido, por item */}
                              <div className="mt-1 flex flex-wrap gap-1">
                                {units.map(u => {
                                  const rec = checkByName.get(u.itemName.toLowerCase());
                                  const on = isChecked(ev, u.itemName, pkg.prepChecked || !!rec);
                                  return (
                                    <button
                                      key={u.itemName}
                                      onClick={() => toggle(ev, pkg, u.itemName, on)}
                                      title={on && rec?.checkedByName ? `Produzido — ${rec.checkedByName}` : 'Marcar como produzido'}
                                      className={`inline-flex items-center gap-1 rounded border px-1.5 py-1 text-[11px] transition ${
                                        on
                                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 line-through'
                                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                      }`}
                                    >
                                      <span className={`flex size-3.5 items-center justify-center rounded-sm border ${
                                        on ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'
                                      }`}>
                                        {on && <Check className="size-2.5" strokeWidth={3} />}
                                      </span>
                                      {u.itemName}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Bebidas não entram na cozinha, mas ficam visíveis — se algo caiu aqui
                        por erro de classificação, tem que dar pra perceber. */}
                    {ev.hiddenDrinks.length > 0 && (
                      <p className="mt-1.5 flex items-start gap-1 text-[10px] text-slate-400">
                        <Wine className="mt-0.5 size-2.5 shrink-0" />
                        <span>bebidas (fora da cozinha): {ev.hiddenDrinks.join(' · ')}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
