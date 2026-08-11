'use client';

// TELA COZINHA — display de serviço, pensado pra ficar aberto num monitor da cozinha.
// Deliberadamente NÃO envolve o <Layout>: o root layout do app é vazio, então não importar
// Layout já é o mecanismo de tela cheia (mesmo padrão de ~18 páginas, ex. cardapio/placas).
// O middleware já protege /cozinha/* com o cookie de sessão.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, UtensilsCrossed, Maximize2, RefreshCw, Settings2, ChefHat, ExternalLink } from 'lucide-react';
import VenuePicker from './VenuePicker';
import WeekPanel, { type WeekDay } from './WeekPanel';
import ServicePanel, { type ServiceData } from './ServicePanel';
import { fmtTime, fmtDate, fmtWeekday, useNow, usePoll, LS_KEY } from './lib';

interface Venue { id: string; name: string }
type Mode = 'semana' | 'dia';

interface VenueWeek { venue: Venue; days: WeekDay[] }

// useSearchParams() exige limite de Suspense no App Router — sem isso o `next build` falha
// ao pré-renderizar esta rota. O estado da tela (espaços/modo/evento) vive na URL, então o
// hook é necessário; o wrapper resolve.
export default function TelaCozinhaPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-slate-50 text-slate-400">Carregando…</div>}>
      <TelaCozinha />
    </Suspense>
  );
}

function TelaCozinha() {
  const router = useRouter();
  const params = useSearchParams();
  const now = useNow(30_000);

  const [venues, setVenues] = useState<Venue[]>([]);
  const [loadingVenues, setLoadingVenues] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>('dia');
  const [showConfig, setShowConfig] = useState(false);

  // Modo 1
  const [week, setWeek] = useState<VenueWeek[]>([]);
  // Modo 2 — evento escolhido e dados de serviço, por espaço
  const [eventByVenue, setEventByVenue] = useState<Record<string, string>>({});
  const [candidates, setCandidates] = useState<Record<string, { id: string; clientName: string; name: string; startAt: string | null; setupAt: string | null }[]>>({});
  const [service, setService] = useState<Record<string, ServiceData>>({});
  const [lastSync, setLastSync] = useState<Date | null>(null);
  // Congela o poll durante uma mutação: sem isso a resposta atrasada sobrescreve a tela
  // logo depois de o operador reordenar/duplicar algo.
  const [busy, setBusy] = useState(false);
  const hydrated = useRef(false);

  // ── Estado na URL (fonte da verdade) + localStorage (sobrevive a reboot do PC) ──
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;

    const qVenues = params.get('venues');
    const qMode = params.get('mode') as Mode | null;

    if (qVenues) {
      setSelected(qVenues.split(',').filter(Boolean));
      if (qMode === 'semana' || qMode === 'dia') setMode(qMode);
      const evs: Record<string, string> = {};
      params.forEach((v, k) => { if (k.startsWith('e_')) evs[k.slice(2)] = v; });
      setEventByVenue(evs);
      return;
    }

    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved.venues)) setSelected(saved.venues);
        if (saved.mode === 'semana' || saved.mode === 'dia') setMode(saved.mode);
      }
    } catch { /* localStorage indisponível — segue sem estado salvo */ }
  }, [params]);

  useEffect(() => {
    if (!hydrated.current) return;
    const qs = new URLSearchParams();
    if (selected.length) qs.set('venues', selected.join(','));
    qs.set('mode', mode);
    for (const [venueId, eventId] of Object.entries(eventByVenue)) {
      if (selected.includes(venueId) && eventId) qs.set(`e_${venueId}`, eventId);
    }
    router.replace(`/cozinha/tela?${qs.toString()}`, { scroll: false });
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ venues: selected, mode }));
    } catch { /* ignora */ }
  }, [selected, mode, eventByVenue, router]);

  // ── Espaços ──
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v2/kitchen/display/venues', { credentials: 'include' });
        if (res.ok) setVenues((await res.json()).venues || []);
      } finally {
        setLoadingVenues(false);
      }
    })();
  }, []);

  // Sem espaço escolhido, abre o seletor pra tela não parecer quebrada.
  useEffect(() => {
    if (!loadingVenues && selected.length === 0) setShowConfig(true);
  }, [loadingVenues, selected.length]);

  // ── Modo 1: semana ──
  const loadWeek = useCallback(async () => {
    if (selected.length === 0) return;
    const res = await fetch(`/api/v2/kitchen/display/week?venueIds=${selected.join(',')}&days=7`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setWeek(data.venues || []);
      setLastSync(new Date());
    }
  }, [selected]);

  // ── Modo 2: candidatos por espaço ──
  const loadCandidates = useCallback(async () => {
    if (selected.length === 0) return;
    const entries = await Promise.all(selected.map(async venueId => {
      const res = await fetch(`/api/v2/kitchen/display/venues/${venueId}/events`, { credentials: 'include' });
      return [venueId, res.ok ? (await res.json()).events || [] : []] as const;
    }));
    const map = Object.fromEntries(entries);
    setCandidates(map);

    // Pré-seleciona o evento de hoje (o mais cedo), mas nunca sobrescreve escolha manual.
    setEventByVenue(prev => {
      const next = { ...prev };
      const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      for (const venueId of selected) {
        if (next[venueId]) continue;
        const todays = (map[venueId] || []).filter((ev: any) => {
          const ref = ev.startAt ?? ev.setupAt;
          if (!ref) return false;
          return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ref)) === todayKey;
        });
        if (todays.length > 0) next[venueId] = todays[0].id;
      }
      return next;
    });
  }, [selected]);

  const loadService = useCallback(async () => {
    const ids = selected.map(v => eventByVenue[v]).filter(Boolean);
    if (ids.length === 0) return;
    const entries = await Promise.all(selected.map(async venueId => {
      const eventId = eventByVenue[venueId];
      if (!eventId) return null;
      const res = await fetch(`/api/v2/kitchen/display/events/${eventId}/service`, { credentials: 'include' });
      if (!res.ok) return null;
      return [venueId, await res.json()] as const;
    }));
    setService(Object.fromEntries(entries.filter(Boolean) as any));
    setLastSync(new Date());
  }, [selected, eventByVenue]);

  useEffect(() => { if (mode === 'semana') void loadWeek(); }, [mode, loadWeek]);
  useEffect(() => { if (mode === 'dia') void loadCandidates(); }, [mode, loadCandidates]);
  useEffect(() => { if (mode === 'dia') void loadService(); }, [mode, loadService]);

  // Poll: semana muda pouco, serviço muda o tempo todo.
  usePoll(() => { void loadWeek(); }, 300_000, mode !== 'semana');
  usePoll(() => { void loadService(); }, 60_000, mode !== 'dia' || busy);

  const toggleVenue = (id: string) =>
    setSelected(prev => (prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]));

  const cols = Math.max(selected.length, 1);
  const weekByVenue = useMemo(() => {
    const m = new Map<string, WeekDay[]>();
    for (const vw of week) m.set(vw.venue.id, vw.days);
    return m;
  }, [week]);

  const refreshNow = () => { void (mode === 'semana' ? loadWeek() : loadService()); };

  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-900">
      {/* Barra de topo */}
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 shadow-sm">
        <ChefHat className="size-5 text-emerald-600" />
        <span className="font-bold tracking-wide">TELA COZINHA</span>

        <div className="ml-2 flex rounded-lg bg-slate-100 p-0.5">
          <button
            onClick={() => setMode('semana')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              mode === 'semana' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <CalendarDays className="size-4" /> Eventos da semana
          </button>
          <button
            onClick={() => setMode('dia')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              mode === 'dia' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <UtensilsCrossed className="size-4" /> Evento do dia
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-2xl font-bold tabular-nums">{fmtTime(now)}</span>
          {lastSync && (
            <span className="hidden text-[11px] text-slate-400 sm:inline">
              atualizado {fmtTime(lastSync)}
            </span>
          )}
          <button onClick={refreshNow} className="rounded border border-slate-200 bg-white p-2 text-slate-500 shadow-sm hover:bg-slate-50" title="Atualizar agora">
            <RefreshCw className="size-4" />
          </button>
          <button onClick={() => setShowConfig(v => !v)} className="rounded border border-slate-200 bg-white p-2 text-slate-500 shadow-sm hover:bg-slate-50" title="Escolher espaços">
            <Settings2 className="size-4" />
          </button>
          <button
            onClick={() => document.documentElement.requestFullscreen?.()}
            className="rounded border border-slate-200 bg-white p-2 text-slate-500 shadow-sm hover:bg-slate-50"
            title="Tela cheia"
          >
            <Maximize2 className="size-4" />
          </button>
        </div>
      </header>

      {/* Seletor de espaços */}
      {showConfig && (
        <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">
            Espaços exibidos {selected.length > 1 && `· tela dividida em ${selected.length}`}
          </p>
          <VenuePicker venues={venues} selected={selected} onToggle={toggleVenue} loading={loadingVenues} />
          <a
            href="/dashboard"
            className="mt-3 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700"
          >
            <ExternalLink className="size-3" /> voltar ao sistema
          </a>
        </div>
      )}

      {/* Colunas por espaço */}
      {selected.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-slate-400">
          Escolha ao menos um espaço para começar.
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto">
          <div
            className="grid h-full"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(380px, 1fr))` }}
          >
            {selected.map(venueId => {
              const venue = venues.find(v => v.id === venueId);
              const svc = service[venueId];
              const otherVenues = svc?.event.venues.filter(v => v.id !== venueId) ?? [];

              return (
                <section key={venueId} className="flex h-full min-w-0 flex-col overflow-y-auto border-r border-slate-200 last:border-r-0">
                  <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur">
                    <p className="font-bold text-emerald-700">{venue?.name ?? '—'}</p>

                    {mode === 'dia' && (
                      <>
                        {/* Nunca escolhe silenciosamente: os candidatos ficam sempre visíveis.
                            Mostram data e dia da semana, não só hora — os candidatos abrangem
                            ±30 dias, então só o horário era ambíguo. */}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(candidates[venueId] ?? []).length === 0 ? (
                            <span className="text-[11px] text-slate-400">Nenhum evento próximo.</span>
                          ) : (
                            (candidates[venueId] ?? []).slice(0, 8).map(ev => {
                              const ref = ev.startAt ?? ev.setupAt;
                              const on = eventByVenue[venueId] === ev.id;
                              return (
                                <button
                                  key={ev.id}
                                  onClick={() => setEventByVenue(prev => ({ ...prev, [venueId]: ev.id }))}
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
                      <WeekPanel days={weekByVenue.get(venueId) ?? []} />
                    ) : svc ? (
                      <ServicePanel
                        data={svc}
                        onMutate={() => { void loadService(); }}
                        onBusyChange={setBusy}
                      />
                    ) : (
                      <p className="py-8 text-center text-sm text-slate-400">
                        {eventByVenue[venueId] ? 'Carregando…' : 'Escolha um evento acima.'}
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
