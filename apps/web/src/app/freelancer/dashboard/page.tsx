'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi, freelancerApi, ApiError } from '@/lib/api';
import FreelancerHeader from '@/components/FreelancerHeader';
import { Search, Calendar as CalendarIcon, List, ChevronLeft, ChevronRight, MapPin, X, Users } from 'lucide-react';

interface Slot {
  id: string;
  code: number;
  startAt: string | null;
  endAt: string | null;
  valuePerHour: number;
  maxSlots: number;
  notes: string | null;
  service: { id: string; name: string; description: string | null };
  filledSlots: number;
  myStatus: string | null;
  myApplicationId: string | null;
}

interface EventJob {
  id: string;
  name: string;
  reservationNumber: string | null;
  startAt: string | null;
  venues: { venue: { name: string; city?: string; address?: string | null } }[];
  employer: { name: string } | null;
  services: Slot[];
}

interface Vaga {
  event: EventJob;
  slot: Slot;
}

const PT_MONTHS_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const WEEKDAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function fmtDate(dt: string | null) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDateTime(dt: string | null) {
  if (!dt) return '—';
  const d = new Date(dt);
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function fmtLongDate(dt: string | null) {
  if (!dt) return '—';
  const d = new Date(dt);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

// Horas trabalhadas nessa vaga (fim - início do próprio slot), pra calcular o total a
// receber — não dá pra saber o total só pelo valor/hora, o freelancer precisa ver o
// valor final considerando a duração real do turno.
function shiftHours(startAt: string | null, endAt: string | null): number | null {
  if (!startAt || !endAt) return null;
  const hours = (new Date(endAt).getTime() - new Date(startAt).getTime()) / 3_600_000;
  return hours > 0 ? hours : null;
}

function fmtHours(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  return rounded % 1 === 0 ? `${rounded}h` : `${rounded.toFixed(1)}h`;
}

function monthKey(dt: string | null): string | null {
  if (!dt) return null;
  const d = new Date(dt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function dayKey(dt: string | null): string | null {
  if (!dt) return null;
  const d = new Date(dt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function FreelancerDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [jobs, setJobs] = useState<EventJob[]>([]);
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('all');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedVaga, setSelectedVaga] = useState<Vaga | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [userRes, jobsRes] = await Promise.all([authApi.me(), freelancerApi.jobs()]);
      setUser(userRes.user);
      setJobs(jobsRes.jobs || []);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/freelancer/login');
        return;
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleApply(slotId: string) {
    try {
      await freelancerApi.apply(slotId);
      await loadData();
      setSelectedVaga(null);
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleCancel(applicationId: string, role: string) {
    if (!confirm(`Cancelar candidatura para ${role}?`)) return;
    try {
      await freelancerApi.cancelApplication(applicationId);
      await loadData();
      setSelectedVaga(null);
    } catch (err: any) {
      alert(err.message);
    }
  }

  const vagas: Vaga[] = useMemo(
    () => jobs.flatMap(event => event.services.map(slot => ({ event, slot }))),
    [jobs]
  );

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    vagas.forEach(v => { const k = monthKey(v.slot.startAt); if (k) set.add(k); });
    return Array.from(set).sort();
  }, [vagas]);

  const filtered = vagas.filter(v => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q ||
      v.event.name.toLowerCase().includes(q) ||
      v.event.venues[0]?.venue.name?.toLowerCase().includes(q);
    const matchesMonth = monthFilter === 'all' || monthKey(v.slot.startAt) === monthFilter;
    const matchesDay = !selectedDay || dayKey(v.slot.startAt) === selectedDay;
    return matchesSearch && matchesMonth && matchesDay;
  });

  // day -> 'candidatado' (green, has an application) | 'disponivel' (orange, open slot) — green wins if both
  const dayStatus = useMemo(() => {
    const map = new Map<string, 'candidatado' | 'disponivel'>();
    vagas.forEach(v => {
      const k = dayKey(v.slot.startAt);
      if (!k) return;
      if (v.slot.myStatus) map.set(k, 'candidatado');
      else if (!map.has(k)) map.set(k, 'disponivel');
    });
    return map;
  }, [vagas]);

  function renderApplyControl(v: Vaga, size: 'sm' | 'lg' = 'sm') {
    const { slot } = v;
    const isApproved = slot.myStatus === 'approved';
    const isPending = slot.myStatus === 'pending';
    const padding = size === 'lg' ? 'px-4 py-2 text-sm' : 'px-3 py-1.5 text-xs';

    if (isApproved) {
      return (
        <div className="flex flex-col items-end gap-1">
          <span className={`inline-flex items-center gap-1 ${padding} bg-green-50 text-green-700 rounded-full font-semibold border border-green-200`}>
            ✓ Inscrito
          </span>
          <button
            onClick={() => slot.myApplicationId && handleCancel(slot.myApplicationId, slot.service.name)}
            className="text-xs text-gray-400 hover:text-red-600 underline transition-colors"
          >
            Cancelar
          </button>
        </div>
      );
    }
    if (isPending) {
      return (
        <button
          onClick={() => slot.myApplicationId && handleCancel(slot.myApplicationId, slot.service.name)}
          className={`inline-flex items-center gap-1 ${padding} bg-yellow-50 text-yellow-700 rounded-full font-semibold border border-yellow-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors`}
        >
          ○ Pendente
        </button>
      );
    }
    return (
      <button
        onClick={() => handleApply(slot.id)}
        disabled={slot.filledSlots >= slot.maxSlots}
        className={`${padding} bg-orange-400 hover:bg-orange-500 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-full font-semibold transition-colors shadow-sm`}
      >
        {slot.filledSlots >= slot.maxSlots ? 'Lotado' : 'Candidatar-se'}
      </button>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1f2e] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-400"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      <FreelancerHeader />

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4 pb-10">
        {/* Title */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#1a1f2e] leading-tight">Vagas Disponíveis</h1>
            <p className="text-sm text-gray-500 mt-1">Bem-vindo, {user?.name ?? '—'}!</p>
          </div>
          <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm shrink-0">
            <button
              onClick={() => setView('list')}
              className={`p-2 rounded-lg transition-colors ${view === 'list' ? 'bg-orange-100 text-orange-600' : 'text-gray-400 hover:text-gray-600'}`}
              title="Lista"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('calendar')}
              className={`p-2 rounded-lg transition-colors ${view === 'calendar' ? 'bg-orange-100 text-orange-600' : 'text-gray-400 hover:text-gray-600'}`}
              title="Calendário"
            >
              <CalendarIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 flex items-center gap-1.5 mb-1.5">
              <Search className="w-3.5 h-3.5" /> Buscar
            </label>
            <input
              type="text"
              placeholder="Nome ou localização..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-200 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400/40"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 flex items-center gap-1.5 mb-1.5">
              <CalendarIcon className="w-3.5 h-3.5" /> Mês
            </label>
            <select
              value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-200 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-400/40"
            >
              <option value="all">Todos os meses</option>
              {availableMonths.map(m => {
                const [y, mo] = m.split('-').map(Number);
                return <option key={m} value={m}>{PT_MONTHS_FULL[mo - 1]} {y}</option>;
              })}
            </select>
          </div>
          <button
            onClick={() => setSelectedDay(null)}
            className="w-full py-2.5 bg-orange-400 hover:bg-orange-500 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            Filtrar
          </button>
        </div>

        {view === 'calendar' ? (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-400 inline-block" /> Vagas disponíveis</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Candidatado</span>
            </div>

            <div className="bg-[#1a1f2e] rounded-2xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-4 py-3">
                <button onClick={() => setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="text-white/70 hover:text-white p-1">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-white font-semibold">{PT_MONTHS_FULL[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</span>
                <button onClick={() => setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="text-white/70 hover:text-white p-1">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
              <div className="bg-white p-3">
                <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-400 mb-2">
                  {WEEKDAYS.map(d => <div key={d}>{d}</div>)}
                </div>
                <CalendarGrid
                  month={calendarMonth}
                  dayStatus={dayStatus}
                  selectedDay={selectedDay}
                  onSelectDay={k => { setSelectedDay(k); setView('list'); }}
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            {selectedDay && (
              <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-xl px-4 py-2 text-sm text-orange-700">
                <span>Filtrando por {new Date(selectedDay + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                <button onClick={() => setSelectedDay(null)} className="text-orange-500 hover:text-orange-700"><X className="w-4 h-4" /></button>
              </div>
            )}

            {filtered.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
                <p className="text-gray-400 text-sm">Nenhuma vaga disponível para seu perfil.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map(v => (
                  <div
                    key={v.slot.id}
                    onClick={() => setSelectedVaga(v)}
                    className="bg-white rounded-2xl shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <div className="bg-orange-400 px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-white font-bold text-lg leading-tight">{v.slot.service.name}</p>
                        <span className="shrink-0 bg-white/25 text-white text-xs font-semibold px-2 py-0.5 rounded-full"># {v.slot.code}</span>
                      </div>
                      <p className="text-white/90 text-xs mt-1.5 flex items-center gap-1.5">
                        <CalendarIcon className="w-3 h-3" /> Início: {fmtDateTime(v.slot.startAt)}
                      </p>
                      <p className="text-white/90 text-xs mt-0.5 flex items-center gap-1.5">
                        <CalendarIcon className="w-3 h-3" /> Fim: {fmtDateTime(v.slot.endAt)}
                      </p>
                    </div>
                    <div className="px-4 py-3">
                      {(() => {
                        const hours = shiftHours(v.slot.startAt, v.slot.endAt);
                        const total = hours ? hours * v.slot.valuePerHour : null;
                        return total ? (
                          <p className="text-green-600 font-bold text-sm flex items-center gap-1">
                            $ Total: R$ {total.toFixed(2)}
                            <span className="text-green-600/70 font-normal text-xs">
                              ({fmtHours(hours!)} × R$ {v.slot.valuePerHour.toFixed(2)}/h)
                            </span>
                          </p>
                        ) : (
                          <p className="text-green-600 font-bold text-sm flex items-center gap-1">
                            $ R$ {v.slot.valuePerHour.toFixed(2)}/h
                          </p>
                        );
                      })()}
                      {v.event.venues[0]?.venue && (
                        <p className="text-sm text-gray-600 mt-1.5 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-gray-400" /> {v.event.venues[0].venue.name}
                        </p>
                      )}
                      {(v.slot.notes || v.slot.service.description) && (
                        <p className="text-sm text-gray-500 mt-2 line-clamp-2">
                          {v.slot.notes || v.slot.service.description}
                        </p>
                      )}
                      <div className="border-t border-gray-100 mt-3 pt-3 flex items-center justify-between">
                        <p className="text-xs text-gray-400 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" /> {v.slot.filledSlots} confirmados de {v.slot.maxSlots}
                        </p>
                        <div onClick={e => e.stopPropagation()}>
                          {renderApplyControl(v)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {selectedVaga && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-0 sm:px-4" onClick={() => setSelectedVaga(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-orange-400 px-5 py-4 rounded-t-2xl flex items-start justify-between sticky top-0">
              <div>
                <p className="text-white font-bold text-xl leading-tight">{selectedVaga.slot.service.name}</p>
                <p className="text-white/90 text-sm mt-0.5">
                  {selectedVaga.event.name}
                  {selectedVaga.event.reservationNumber && ` · #${selectedVaga.event.reservationNumber}`}
                </p>
              </div>
              <button onClick={() => setSelectedVaga(null)} className="text-white/80 hover:text-white shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-start gap-2.5">
                <CalendarIcon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Data do Evento</p>
                  <p className="text-sm font-semibold text-[#1a1f2e]">{fmtLongDate(selectedVaga.slot.startAt)}</p>
                </div>
              </div>
              {selectedVaga.event.venues[0]?.venue && (
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400">Localização</p>
                    <p className="text-sm font-semibold text-[#1a1f2e]">{selectedVaga.event.venues[0].venue.name}</p>
                    {selectedVaga.event.venues[0].venue.address && (
                      <p className="text-xs text-gray-500">{selectedVaga.event.venues[0].venue.address}</p>
                    )}
                  </div>
                </div>
              )}
              {(selectedVaga.slot.notes || selectedVaga.slot.service.description) && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Descrição</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {selectedVaga.slot.notes || selectedVaga.slot.service.description}
                  </p>
                </div>
              )}
              {(() => {
                const hours = shiftHours(selectedVaga.slot.startAt, selectedVaga.slot.endAt);
                const total = hours ? hours * selectedVaga.slot.valuePerHour : null;
                return (
                  <div className="bg-green-50 rounded-xl p-3">
                    <p className="text-xs text-gray-500">
                      {hours ? `${fmtHours(hours)} × R$ ${selectedVaga.slot.valuePerHour.toFixed(2)}/h` : 'Valor por hora'}
                    </p>
                    <p className="text-green-700 font-bold text-lg">
                      {total ? `R$ ${total.toFixed(2)}` : `R$ ${selectedVaga.slot.valuePerHour.toFixed(2)}/h`}
                    </p>
                    {total && <p className="text-xs text-gray-400">Valor total a receber por essa vaga</p>}
                  </div>
                );
              })()}
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={() => setSelectedVaga(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Fechar
              </button>
              <div className="flex-1 flex justify-end">
                {renderApplyControl(selectedVaga, 'lg')}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarGrid({
  month, dayStatus, selectedDay, onSelectDay,
}: {
  month: Date;
  dayStatus: Map<string, 'candidatado' | 'disponivel'>;
  selectedDay: string | null;
  onSelectDay: (key: string) => void;
}) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const firstDay = new Date(year, m, 1).getDay();
  const daysInMonth = new Date(year, m + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="grid grid-cols-7 gap-y-1">
      {cells.map((day, i) => {
        if (day === null) return <div key={i} />;
        const key = `${year}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const status = dayStatus.get(key);
        const isSelected = selectedDay === key;
        return (
          <button
            key={i}
            onClick={() => onSelectDay(isSelected ? '' : key)}
            className={`aspect-square flex flex-col items-center justify-center text-sm rounded-lg transition-colors ${
              isSelected ? 'bg-[#1a1f2e] text-white' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <span>{day}</span>
            {status && (
              <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${status === 'candidatado' ? 'bg-green-500' : 'bg-orange-400'}`} />
            )}
          </button>
        );
      })}
    </div>
  );
}
