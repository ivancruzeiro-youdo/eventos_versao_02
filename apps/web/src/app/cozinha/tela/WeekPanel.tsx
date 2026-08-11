'use client';

import { Users, AlertTriangle } from 'lucide-react';
import { fmtTime, fmtDayLabel, isToday } from './lib';

export interface WeekPackage {
  eventItemId: string;
  name: string;
  quantity: number;
  unit: string | null;
  serviceStartAt: string | null;
  serviceEndAt: string | null;
  chosenItems: { itemName: string; sourceLabel: string | null }[];
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
}

export interface WeekDay { date: string; events: WeekEvent[] }

interface Props {
  days: WeekDay[];
}

/** Modo 1 — próximos 7 dias de um espaço. Dias sem evento colapsam numa linha fina, pra
 *  a semana inteira caber na tela sem rolagem (é um display, ninguém vai scrollar). */
export default function WeekPanel({ days }: Props) {
  return (
    <div className="space-y-1.5">
      {days.map(day => {
        const today = isToday(day.date);
        const empty = day.events.length === 0;

        // Dia vazio: uma linha e nada mais.
        if (empty) {
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
              {day.events.map(ev => (
                <div key={ev.id} className="rounded-md border border-slate-200 bg-white p-2.5 shadow-sm">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{ev.clientName || ev.name}</p>
                      <p className="text-xs font-medium text-slate-500">
                        {fmtTime(ev.startAt ?? ev.setupAt)}
                      </p>
                    </div>
                    {ev.headcount && (
                      <div className="shrink-0 text-right">
                        <p className="text-2xl font-bold leading-none tabular-nums text-slate-900">
                          {ev.headcount.effective}
                        </p>
                        <p className="flex items-center justify-end gap-1 text-[10px] uppercase tracking-wide text-slate-400">
                          <Users className="size-3" />
                          pessoas
                        </p>
                        {ev.headcount.isEstimate && (
                          <span className="text-[10px] font-medium text-amber-600">contratado</span>
                        )}
                      </div>
                    )}
                  </div>

                  {ev.packages.length === 0 ? (
                    <p className="text-xs text-slate-400">Nenhum item de A&amp;B.</p>
                  ) : (
                    <div className="space-y-1">
                      {ev.packages.map(pkg => (
                        <div key={pkg.eventItemId} className="text-xs">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="font-medium text-slate-800">{pkg.name}</span>
                            {pkg.serviceStartAt && (
                              <span className="font-semibold text-emerald-600">
                                {fmtTime(pkg.serviceStartAt)}
                                {pkg.serviceEndAt && `–${fmtTime(pkg.serviceEndAt)}`}
                              </span>
                            )}
                            <span className="text-slate-400">{pkg.quantity} {pkg.unit || 'pessoas'}</span>
                          </div>
                          {pkg.chosenItems.length > 0 ? (
                            <p className="mt-0.5 leading-snug text-slate-500">
                              {pkg.chosenItems.map(c => c.itemName).join(' · ')}
                            </p>
                          ) : (
                            <p className="mt-0.5 flex items-center gap-1 text-amber-600">
                              <AlertTriangle className="size-3" />
                              cliente ainda não escolheu os itens
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
