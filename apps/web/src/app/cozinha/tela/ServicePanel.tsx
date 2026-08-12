'use client';

import { useState } from 'react';
import {
  Users, ChevronUp, ChevronDown, Copy, Trash2, Check, Plus, Wand2,
  MessageSquare, AlertTriangle, UtensilsCrossed, CalendarClock, GripVertical,
  Wine, History, LayoutGrid, Volume2, Clock,
} from 'lucide-react';
import { fmtTime, fmtDateTimeShort } from './lib';
import type { ServiceCommands } from './useServiceCommands';
import { fmtLate, type LateItem } from './useLateAlerts';

export interface ServiceEntry {
  id: string;
  eventItemId: string | null;
  sourceLabel: string | null;
  itemName: string;
  entryKind: 'item' | 'montagem' | 'reposicao' | 'desmontagem';
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
  kind: 'comida' | 'estacao' | 'bebida';
  serviceStartAt: string | null;
  serviceEndAt: string | null;
  chosenItems: { itemName: string; sourceLabel: string | null }[];
  comments: { id: string; content: string; createdAt: string; user: { name: string } | null }[];
}

export interface ServiceData {
  event: { id: string; name: string; clientName: string; startAt: string | null; venues: { id: string; name: string }[] };
  headcount: { effective: number; checkedIn: number; contracted: number; isEstimate: boolean };
  packages: ServicePackage[];
  hiddenDrinks: string[];
  plan: {
    id: string | null; intervalMinutes: number; anchorAt: string | null; entries: ServiceEntry[];
    logs: { id: string; action: string; detail: string; userName: string | null; createdAt: string }[];
  };
  schedule: {
    activities: { id: string; name: string; description: string | null; startAt: string; endAt: string; team: { id: string; name: string } | null; isKitchen: boolean }[];
    abServiceEntries: { eventItemId: string; name: string; kind: string; startAt: string; endAt: string | null }[];
  };
}

const KIND_LABEL: Record<string, string> = {
  montagem: 'Montagem',
  reposicao: 'Reposição',
  desmontagem: 'Desmontagem',
};

interface Props {
  data: ServiceData;
  /** Superfície de comandos vinda do VenueColumn — a mesma que a voz usa. */
  cmd: ServiceCommands;
  /** Alerta de atraso, calculado no VenueColumn (precisa do relógio). */
  lateAlerts: {
    late: LateItem[];
    allLate: LateItem[];
    criticalCount: number;
    ack: (entryId: string) => void;
    ackAll: () => void;
    tierOf: (entryId: string) => 'atrasado' | 'critico' | null;
  };
  audioOn: boolean;
  onEnableAudio: () => void;
}

export default function ServicePanel({ data, cmd, lateAlerts, audioOn, onEnableAudio }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const { headcount, plan, packages, schedule } = data;
  const entries = plan.entries;
  const { working, available, availableStations } = cmd;

  const allComments = packages.flatMap(p => p.comments.map(c => ({ ...c, pkgName: p.name })));

  // Cronograma + itens de A&B com horário, na mesma linha do tempo (igual ao cronograma do
  // evento). Item 7 do pedido: a tela mostra também os itens que já aparecem lá.
  type TL =
    | { kind: 'act'; at: number; act: ServiceData['schedule']['activities'][number] }
    | { kind: 'ab'; at: number; ab: ServiceData['schedule']['abServiceEntries'][number] };
  const timeline: TL[] = [
    ...schedule.activities.map((act): TL => ({ kind: 'act', at: new Date(act.startAt).getTime(), act })),
    ...schedule.abServiceEntries.map((ab): TL => ({ kind: 'ab', at: new Date(ab.startAt).getTime(), ab })),
  ].sort((a, b) => a.at - b.at);

  return (
    <div className="space-y-3">
      {/* ATRASO no topo de tudo, acima até das observações: é a única informação da tela que
          exige ação AGORA. */}
      {lateAlerts.late.length > 0 && (
        <div
          className={`rounded-lg border-4 p-3 ${
            lateAlerts.criticalCount > 0
              ? 'animate-pulse border-red-600 bg-red-100'
              : 'border-amber-500 bg-amber-100'
          }`}
        >
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className={`size-7 shrink-0 ${lateAlerts.criticalCount > 0 ? 'text-red-700' : 'text-amber-700'}`} />
            <p className={`text-2xl font-black leading-none ${lateAlerts.criticalCount > 0 ? 'text-red-800' : 'text-amber-800'}`}>
              {lateAlerts.late.length === 1 ? '1 SAÍDA ATRASADA' : `${lateAlerts.late.length} SAÍDAS ATRASADAS`}
            </p>
            <button
              onClick={lateAlerts.ackAll}
              className="ml-auto shrink-0 rounded border border-slate-400 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              title="Silencia o alerta; a linha continua marcada como atrasada"
            >
              ciente de tudo
            </button>
          </div>

          <div className="space-y-1">
            {lateAlerts.late.map(l => (
              <div key={l.entry.id} className="flex items-center gap-2 rounded bg-white/80 px-2 py-1.5">
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold text-white ${
                  l.tier === 'critico' ? 'bg-red-600' : 'bg-amber-600'
                }`}>
                  {fmtLate(l.lateMs)}
                </span>
                <span className="min-w-0 flex-1 truncate text-lg font-bold text-slate-900">{l.label}</span>
                <span className="shrink-0 text-sm text-slate-500">era {fmtTime(l.entry.serveAt)}</span>
                <button
                  onClick={() => cmd.setServed(l.entry.id, true)}
                  disabled={working}
                  className="shrink-0 rounded bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  saiu agora
                </button>
                <button
                  onClick={() => lateAlerts.ack(l.entry.id)}
                  className="shrink-0 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
                  title="Silencia só este"
                >
                  ciente
                </button>
              </div>
            ))}
          </div>

          {/* O navegador só libera áudio após um gesto — sem isso o alerta sai só no visual, e
              a cozinha precisa saber disso em vez de achar que o som está quebrado. */}
          {!audioOn && (
            <button
              onClick={onEnableAudio}
              className="mt-2 flex items-center gap-1.5 rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
            >
              <Volume2 className="size-3.5" /> ativar som dos alertas
            </button>
          )}
        </div>
      )}

      {/* Observações de A&B — no topo: é a informação que muda a operação ("servir só depois
          do jantar", "cliente pediu sem lactose") e não pode ficar embaixo da lista. */}
      {allComments.length > 0 && (
        <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-2.5">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-amber-800">
            <MessageSquare className="size-4" /> Observações de A&amp;B
          </h3>
          <div className="space-y-1.5">
            {allComments.map(c => (
              <div key={c.id} className="rounded border border-amber-200 bg-white p-2">
                <p className="text-[11px] font-semibold text-amber-700">{c.pkgName}</p>
                <p className="whitespace-pre-wrap text-sm leading-snug text-slate-800">{c.content}</p>
                {c.user && <p className="mt-0.5 text-[10px] text-slate-400">{c.user.name}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

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
              onClick={() => cmd.generateSuggested()}
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
            {available.length === 0 && availableStations.length === 0 ? (
              <p className="text-xs text-slate-500">Tudo que havia para adicionar já está na sequência.</p>
            ) : (
              <>
                {available.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {available.map(c => (
                      <button
                        key={`${c.pkg.eventItemId}-${c.itemName}`}
                        onClick={() =>
                          cmd.addItem({ eventItemId: c.pkg.eventItemId, sourceLabel: c.sourceLabel, itemName: c.itemName })
                        }
                        className="rounded border border-emerald-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-emerald-100"
                      >
                        + {c.itemName}
                      </button>
                    ))}
                  </div>
                )}
                {/* Estação entra como pacote e gera montagem + reposição + desmontagem */}
                {availableStations.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5 border-t border-emerald-200 pt-1.5">
                    {availableStations.map(p => (
                      <button
                        key={p.eventItemId}
                        onClick={() => cmd.addStation(p)}
                        title="Cria montagem, reposição e desmontagem"
                        className="inline-flex items-center gap-1 rounded border border-sky-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-sky-100"
                      >
                        <LayoutGrid className="size-3 text-sky-600" />
                        + {p.name}
                        <span className="text-[10px] text-slate-400">(3 etapas)</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
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
                  const to = entries.findIndex(x => x.id === e.id);
                  setDragId(null);
                  cmd.moveToPosition(dragId, to);
                }}
                className={`rounded-lg border p-2 shadow-sm ${
                  e.status === 'served'
                    ? 'border-slate-200 bg-slate-50 opacity-60'
                    : e.orphan || e.packageMissing
                      ? 'border-red-300 bg-red-50'
                      : lateAlerts.tierOf(e.id) === 'critico'
                        ? 'border-2 border-red-600 bg-red-50'
                        : lateAlerts.tierOf(e.id) === 'atrasado'
                          ? 'border-2 border-amber-500 bg-amber-50'
                          : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <GripVertical className="size-4 shrink-0 cursor-grab text-slate-300" />

                  <span className={`w-14 shrink-0 text-lg font-bold tabular-nums ${
                    lateAlerts.tierOf(e.id) === 'critico' ? 'text-red-700'
                      : lateAlerts.tierOf(e.id) === 'atrasado' ? 'text-amber-700'
                      : 'text-emerald-600'
                  }`}>
                    {fmtTime(e.serveAt)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className={`font-medium leading-tight ${e.orphan ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                      {/* Estação: o que a cozinha executa é a etapa, então ela vem primeiro */}
                      {e.entryKind !== 'item' && (
                        <span className="mr-1.5 rounded bg-sky-100 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase text-sky-700">
                          {KIND_LABEL[e.entryKind] ?? e.entryKind}
                        </span>
                      )}
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
                    {lateAlerts.tierOf(e.id) && (
                      <p className={`flex items-center gap-1 text-[11px] font-bold ${
                        lateAlerts.tierOf(e.id) === 'critico' ? 'text-red-700' : 'text-amber-700'
                      }`}>
                        <Clock className="size-3" />
                        atrasado {fmtLate(lateAlerts.allLate.find(l => l.entry.id === e.id)?.lateMs ?? 0)}
                      </p>
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
                    <button onClick={() => cmd.moveByIndex(i, -1)} disabled={i === 0 || working}
                      className="rounded border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-25" title="Subir">
                      <ChevronUp className="size-3.5" />
                    </button>
                    <button onClick={() => cmd.moveByIndex(i, 1)} disabled={i === entries.length - 1 || working}
                      className="rounded border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-25" title="Descer">
                      <ChevronDown className="size-3.5" />
                    </button>
                  </div>

                  <div className="flex shrink-0 flex-col gap-0.5">
                    <button
                      onClick={() => cmd.toggleServed(e.id)}
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
                      onClick={() => cmd.duplicate(e.id)}
                      disabled={working}
                      className="rounded border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-100"
                      title="Servir de novo mais tarde"
                    >
                      <Copy className="size-3.5" />
                    </button>
                    <button
                      onClick={() => cmd.remove(e.id)}
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

      {/* Cronograma — atividades + itens de A&B com horário, na mesma linha do tempo, igual
          ao cronograma do evento. Cozinha com destaque forte. */}
      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-700">
          <CalendarClock className="size-4" /> Cronograma
        </h3>
        {timeline.length === 0 ? (
          <p className="text-xs text-slate-400">Nenhuma atividade no cronograma.</p>
        ) : (
          <div className="space-y-1.5">
            {timeline.map(t => t.kind === 'ab' ? (
              <div
                key={`ab-${t.ab.eventItemId}`}
                className="rounded-lg border border-dashed border-amber-400 bg-amber-50/50 p-2"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-bold tabular-nums text-amber-700">
                    {fmtTime(t.ab.startAt)}{t.ab.endAt && `–${fmtTime(t.ab.endAt)}`}
                  </span>
                  <span className="text-sm font-medium text-slate-700">{t.ab.name}</span>
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                    <UtensilsCrossed className="size-2.5" /> A&amp;B
                  </span>
                  {t.ab.kind === 'bebida' && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">bar</span>
                  )}
                </div>
              </div>
            ) : (
              <div
                key={t.act.id}
                className={
                  t.act.isKitchen
                    ? 'rounded-lg border-2 border-emerald-500 bg-emerald-50 p-3 shadow-sm'
                    : 'rounded-lg border border-slate-200 bg-white p-2'
                }
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className={`font-bold tabular-nums ${t.act.isKitchen ? 'text-xl text-emerald-700' : 'text-sm text-slate-500'}`}>
                    {fmtTime(t.act.startAt)}–{fmtTime(t.act.endAt)}
                  </span>
                  <span className={t.act.isKitchen ? 'text-lg font-bold text-slate-900' : 'text-sm text-slate-600'}>
                    {t.act.name}
                  </span>
                  {t.act.team && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      t.act.isKitchen ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {t.act.team.name}
                    </span>
                  )}
                </div>
                {t.act.description && (
                  <p className={`mt-1 whitespace-pre-wrap leading-snug ${t.act.isKitchen ? 'text-sm text-slate-700' : 'text-xs text-slate-400'}`}>
                    {t.act.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bebidas ficam fora da cozinha, mas visíveis — classificação errada tem que aparecer. */}
      {data.hiddenDrinks.length > 0 && (
        <p className="flex items-start gap-1 text-[10px] text-slate-400">
          <Wine className="mt-0.5 size-2.5 shrink-0" />
          <span>bebidas (fora da cozinha): {data.hiddenDrinks.join(' · ')}</span>
        </p>
      )}

      {/* Histórico: quem mexeu na sequência e quando */}
      {plan.logs.length > 0 && (
        <div>
          <button
            onClick={() => setShowLog(v => !v)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700"
          >
            <History className="size-3.5" />
            Histórico de alterações ({plan.logs.length})
            {showLog ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
          {showLog && (
            <div className="mt-1.5 space-y-1 border-l-2 border-slate-200 pl-2">
              {plan.logs.map(l => (
                <div key={l.id} className="text-[11px] leading-snug">
                  <span className="text-slate-400">{fmtDateTimeShort(l.createdAt)}</span>
                  {l.userName && <span className="text-slate-500"> · {l.userName}</span>}
                  <p className="text-slate-600">{l.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
