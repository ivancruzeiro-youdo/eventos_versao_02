'use client';

// Uma coluna da TELA COZINHA (um espaço). Existe por um motivo estrutural, não estético:
// `useServiceCommands` é um hook e não pode ser chamado dentro do .map() sobre os espaços
// selecionados — mas pode ser chamado uma vez por componente renderizado por espaço.
// A coluna também REGISTRA sua superfície de comandos, pra camada de voz alcançá-la.
import { useEffect } from 'react';
import WeekPanel, { type WeekDay } from './WeekPanel';
import ServicePanel, { type ServiceData } from './ServicePanel';
import { useServiceCommands, type ServiceCommands } from './useServiceCommands';
import { fmtTime, fmtDate, fmtWeekday } from './lib';

interface Candidate {
  id: string; clientName: string; name: string; startAt: string | null; setupAt: string | null;
}

interface Props {
  venueId: string;
  venueName: string;
  mode: 'semana' | 'dia';
  days: WeekDay[];
  service: ServiceData | undefined;
  candidates: Candidate[];
  selectedEventId: string | undefined;
  onSelectEvent: (eventId: string) => void;
  onToggleCheck: (eventId: string, eventItemId: string | null, itemName: string, checked: boolean) => Promise<void>;
  onMutate: () => void;
  onBusyChange: (busy: boolean) => void;
  onRegisterCommands: (venueId: string, cmd: ServiceCommands | null) => void;
}

export default function VenueColumn({
  venueId, venueName, mode, days, service, candidates, selectedEventId,
  onSelectEvent, onToggleCheck, onMutate, onBusyChange, onRegisterCommands,
}: Props) {
  // O hook precisa ser chamado incondicionalmente, mesmo sem evento carregado ainda.
  const cmd = useServiceCommands({
    eventId: service?.event.id ?? '',
    entries: service?.plan.entries ?? [],
    packages: service?.packages ?? [],
    onMutate,
    onBusyChange,
    // Botões mantêm o comportamento de sempre; a voz vai passar outro handler.
    onError: (msg) => alert(msg),
  });

  useEffect(() => {
    onRegisterCommands(venueId, service ? cmd : null);
    return () => onRegisterCommands(venueId, null);
  }, [venueId, cmd, service, onRegisterCommands]);

  const otherVenues = service?.event.venues.filter(v => v.id !== venueId) ?? [];

  return (
    <section className="flex h-full min-w-0 flex-col overflow-y-auto border-r border-slate-200 last:border-r-0">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur">
        <p className="font-bold text-emerald-700">{venueName}</p>

        {mode === 'dia' && (
          <>
            {/* Nunca escolhe silenciosamente: os candidatos ficam sempre visíveis. A lista vem
                de ontem pra frente, e mostra dia da semana + data + hora — só o horário era
                ambíguo, já que dois eventos às 19:00 em dias diferentes ficavam idênticos. */}
            <div className="mt-1 flex flex-wrap gap-1">
              {candidates.length === 0 ? (
                <span className="text-[11px] text-slate-400">Nenhum evento próximo.</span>
              ) : (
                candidates.slice(0, 8).map(ev => {
                  const ref = ev.startAt ?? ev.setupAt;
                  const on = selectedEventId === ev.id;
                  return (
                    <button
                      key={ev.id}
                      onClick={() => onSelectEvent(ev.id)}
                      className={`rounded border px-2 py-1 text-left text-[11px] leading-tight ${
                        on
                          ? 'border-emerald-600 bg-emerald-600 font-semibold text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="block font-semibold">
                        {fmtWeekday(ref)} {fmtDate(ref)} · {fmtTime(ref)}
                      </span>
                      <span className={on ? 'text-white/90' : 'text-slate-500'}>
                        {ev.clientName || ev.name}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            {otherVenues.length > 0 && (
              <p className="mt-1 text-[11px] text-amber-700">
                este evento também está em: {otherVenues.map(v => v.name).join(', ')} — a sequência é compartilhada
              </p>
            )}
          </>
        )}
      </div>

      <div className="p-3">
        {mode === 'semana' ? (
          <WeekPanel days={days} onToggleCheck={onToggleCheck} />
        ) : service ? (
          <ServicePanel data={service} cmd={cmd} />
        ) : (
          <p className="py-8 text-center text-sm text-slate-400">
            {selectedEventId ? 'Carregando…' : 'Escolha um evento acima.'}
          </p>
        )}
      </div>
    </section>
  );
}
