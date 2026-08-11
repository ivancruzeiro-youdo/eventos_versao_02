'use client';

import { Users, Clock, AlertTriangle } from 'lucide-react';
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

/** Modo 1 — próximos 7 dias de um espaço, com cardápio e nº de pessoas. */
export default function WeekPanel({ days }: Props) {
  return (
    <div className="space-y-3">
      {days.map(day => {
        const today = isToday(day.date);
        return (
          <div
            key={day.date}
            className={`rounded-lg border ${today ? 'border-emerald-500/60 bg-emerald-500/5' : 'border-white/10 bg-white/[0.03]'}`}
          >
            <div className={`px-3 py-2 text-sm font-bold tracking-wide ${today ? 'text-emerald-400' : 'text-white/50'}`}>
              {fmtDayLabel(day.date)}
              {today && <span className="ml-2 text-xs font-normal">· hoje</span>}
            </div>

            {day.events.length === 0 ? (
              <p className="px-3 pb-3 text-xs text-white/30">Sem eventos.</p>
            ) : (
              <div className="space-y-2 px-3 pb-3">
                {day.events.map(ev => (
                  <div key={ev.id} className="rounded-md bg-black/30 p-3">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="min-w-0">
                        <p className="font-semibold text-white truncate">{ev.clientName || ev.name}</p>
                        <p className="text-xs text-white/50 flex items-center gap-1">
                          <Clock className="size-3" />
                          {fmtTime(ev.startAt ?? ev.setupAt)}
                        </p>
                      </div>
                      {ev.headcount && (
                        <div className="text-right shrink-0">
                          <p className="text-2xl font-bold leading-none text-white tabular-nums">
                            {ev.headcount.effective}
                          </p>
                          <p className="text-[10px] uppercase tracking-wide text-white/40 flex items-center gap-1 justify-end">
                            <Users className="size-3" />
                            pessoas
                          </p>
                          {ev.headcount.isEstimate && (
                            <span className="text-[10px] text-amber-400">contratado</span>
                          )}
                        </div>
                      )}
                    </div>

                    {ev.packages.length === 0 ? (
                      <p className="text-xs text-white/30">Nenhum item de A&amp;B.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {ev.packages.map(pkg => (
                          <div key={pkg.eventItemId} className="text-xs">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="font-medium text-white/90">{pkg.name}</span>
                              {pkg.serviceStartAt && (
                                <span className="text-emerald-400">
                                  {fmtTime(pkg.serviceStartAt)}
                                  {pkg.serviceEndAt && `–${fmtTime(pkg.serviceEndAt)}`}
                                </span>
                              )}
                              <span className="text-white/40">{pkg.quantity} {pkg.unit || 'pessoas'}</span>
                            </div>
                            {pkg.chosenItems.length > 0 ? (
                              <p className="text-white/50 mt-0.5 leading-snug">
                                {pkg.chosenItems.map(c => c.itemName).join(' · ')}
                              </p>
                            ) : (
                              <p className="text-amber-400/70 mt-0.5 flex items-center gap-1">
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
            )}
          </div>
        );
      })}
    </div>
  );
}
